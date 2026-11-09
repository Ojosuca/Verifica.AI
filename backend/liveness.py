"""Own experimental action/object service. Not a validated anti-spoofing model."""
import asyncio
import hashlib
import hmac
import json
import math
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, Depends, File, Form, Header, HTTPException, UploadFile
from backend.main import Engine, MAX_BYTES, ROOT, upload
from backend.video import sample_video

CLASSES = ['background','aeroplane','bicycle','bird','boat','bottle','bus','car','cat','chair','cow',
           'diningtable','dog','horse','motorbike','person','pottedplant','sheep','sofa','train','tvmonitor']


def action_for_face(face):
    eye_mid = (float(face[4]) + float(face[6])) / 2
    eye_distance = abs(float(face[4]) - float(face[6]))
    if eye_distance < 15:
        return 'unknown'
    offset = (float(face[8]) - eye_mid) / eye_distance
    if offset > .14:
        return 'turn_left'
    if offset < -.14:
        return 'turn_right'
    if abs(offset) < .10:
        return 'center'
    return 'unknown'


def analyze_clip(data, challenge, engine, object_net):
    if not engine.ready:
        raise HTTPException(503, 'Instale os modelos faciais antes de analisar o vídeo.')
    sequence, all_actions, objects = [], [], {}
    last, consecutive = None, 0
    for sample, (timestamp, frame) in enumerate(sample_video(data, size=640)):
        engine.detector.setInputSize((frame.shape[1], frame.shape[0]))
        _, faces = engine.detector.detect(frame)
        if faces is None or len(faces) != 1:
            return {'live': False, 'score': 0., 'validated': False, 'actions': all_actions, 'objects': [], 'reason': 'single_face_required'}
        action = action_for_face(faces[0])
        all_actions.append({'at_ms': round(timestamp * 1000), 'action': action})
        consecutive = consecutive + 1 if action == last else 1
        last = action
        if consecutive >= 2 and len(sequence) < len(challenge) and action == challenge[len(sequence)]:
            sequence.append(action)
        if object_net is not None and sample % 8 == 0:
            blob = cv2.dnn.blobFromImage(frame, .007843, (300, 300), 127.5)
            object_net.setInput(blob)
            detections = object_net.forward()[0, 0]
            for detection in detections:
                confidence, label = float(detection[2]), int(detection[1])
                if confidence >= .6 and 0 < label < len(CLASSES):
                    name = CLASSES[label]
                    objects[name] = max(objects.get(name, 0), round(confidence, 3))
    return {'live': sequence == challenge, 'score': len(sequence) / len(challenge), 'validated': False,
            'actions': all_actions, 'objects': [{'label': k, 'confidence': v} for k, v in objects.items()],
            'object_engine': 'ready' if object_net is not None else 'not_configured',
            'reason': 'experimental_challenge_only'}


@asynccontextmanager
async def lifespan(app):
    app.state.engine = Engine()
    app.state.lock = asyncio.Semaphore(1)
    directory = Path(os.getenv('VERIFICA_MODELS', str(ROOT / 'models')))
    proto, model = directory / 'MobileNetSSD_deploy.prototxt', directory / 'MobileNetSSD_deploy.caffemodel'
    app.state.objects = cv2.dnn.readNetFromCaffe(str(proto), str(model)) if proto.exists() and model.exists() else None
    yield


app = FastAPI(title='Verifica.ai · Liveness & visão experimental', version='0.1.0', lifespan=lifespan)


def service_auth(authorization: str = Header(default='')):
    secret = os.getenv('VERIFICA_PAD_SECRET', '')
    if not secret or not hmac.compare_digest(authorization, 'Bearer ' + secret):
        raise HTTPException(401, 'Credencial do serviço inválida.')


@app.get('/health')
def health():
    return {'face': app.state.engine.ready, 'objects': app.state.objects is not None, 'validated': False}


@app.post('/api/v1/analyze', dependencies=[Depends(service_auth)])
async def analyze(session_id: str = Form(..., max_length=128), nonce: str = Form(..., max_length=128),
                  sha256: str = Form(..., min_length=64, max_length=64), challenge: str = Form(..., max_length=256),
                  video: UploadFile = File(...)):
    data = await upload(video, {'application/octet-stream', 'video/webm', 'video/mp4'})
    if not hmac.compare_digest(hashlib.sha256(data).hexdigest(), sha256):
        raise HTTPException(422, 'O hash não corresponde à captura.')
    try:
        steps = json.loads(challenge)
        if not isinstance(steps, list) or len(steps) != 3 or steps[0] != 'center' or set(steps[1:]) != {'turn_left', 'turn_right'}:
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(422, 'Desafio inválido.')
    async with app.state.lock:
        result = await asyncio.to_thread(analyze_clip, data, steps, app.state.engine, app.state.objects)
    payload = {'session_id': session_id, 'nonce': nonce, 'sha256': sha256,
               **{key: result[key] for key in ('live', 'score', 'validated', 'actions', 'objects')}}
    encoded = json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()
    signature = hmac.new(os.environ['VERIFICA_PAD_SECRET'].encode(), encoded, hashlib.sha256).hexdigest()
    return {**payload, 'signature': signature, 'diagnostics': {'reason': result['reason'], 'object_engine': result.get('object_engine', 'not_configured')}}
