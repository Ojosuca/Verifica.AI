"""Verifica.ai 1:1. PAD is fail-closed and must be integrated server-to-server."""
import asyncio
import hashlib
import hmac
import json
import math
import os
import secrets
import sqlite3
import tempfile
import threading
import time
from pathlib import Path
from contextlib import asynccontextmanager

import cv2
import httpx
import numpy as np
from cryptography.fernet import Fernet
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from backend.video import sample_video

ROOT = Path(__file__).resolve().parent.parent
MAX_BYTES = 8 * 1024 * 1024
INFERENCE_LOCK = threading.Lock()


class SessionInput(BaseModel):
    subject_id: str = Field(min_length=1, max_length=128, pattern=r'^[a-zA-Z0-9_.@-]+$')
    consent: bool


def db():
    c = sqlite3.connect(os.getenv('VERIFICA_DB', str(ROOT / 'verifica-ai.db')), timeout=10)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    with db() as c:
        c.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS subjects(id TEXT PRIMARY KEY, template BLOB NOT NULL, created REAL);
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, subject TEXT, nonce TEXT, expires REAL, used INTEGER DEFAULT 0, challenge TEXT);
        CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, subject TEXT, status TEXT, created REAL, elapsed INTEGER);
        ''')
        if 'display_name' not in {row['name'] for row in c.execute('PRAGMA table_info(subjects)')}:
            c.execute("ALTER TABLE subjects ADD COLUMN display_name TEXT NOT NULL DEFAULT ''")


def cipher():
    key = os.getenv('VERIFICA_TEMPLATE_KEY')
    if not key:
        raise HTTPException(503, 'Configure VERIFICA_TEMPLATE_KEY antes de cadastrar biometria.')
    return Fernet(key.encode())


def auth(authorization: str = Header(default='')):
    key = os.getenv('VERIFICA_ADMIN_KEY', '')
    if not key:
        raise HTTPException(503, 'Configure VERIFICA_ADMIN_KEY no servidor.')
    if not hmac.compare_digest(authorization, 'Bearer ' + key):
        raise HTTPException(401, 'Credencial inválida.')


class Engine:
    def __init__(self):
        directory = Path(os.getenv('VERIFICA_MODELS', str(ROOT / 'models')))
        detector = directory / 'face_detection_yunet_2023mar.onnx'
        recognizer = directory / 'face_recognition_sface_2021dec.onnx'
        self.ready = detector.is_file() and recognizer.is_file()
        if self.ready:
            self.detector = cv2.FaceDetectorYN.create(str(detector), '', (640, 480), 0.9, 0.3, 5000)
            self.recognizer = cv2.FaceRecognizerSF.create(str(recognizer), '')

    def embedding(self, frame):
        if not self.ready:
            raise HTTPException(503, 'Modelos ausentes. Execute python -m backend.download_models.')
        if frame is None or frame.size == 0:
            raise HTTPException(422, 'Imagem inválida.')
        h, w = frame.shape[:2]
        if h * w > 20_000_000:
            raise HTTPException(413, 'Resolução da imagem excede 20 MP.')
        if max(h, w) > 960:
            frame = cv2.resize(frame, (round(w * 960 / max(h, w)), round(h * 960 / max(h, w))))
        with INFERENCE_LOCK:
            self.detector.setInputSize((frame.shape[1], frame.shape[0]))
            _, faces = self.detector.detect(frame)
            if faces is None or len(faces) != 1:
                raise HTTPException(422, 'A captura deve conter exatamente um rosto.')
            face = faces[0]
            if min(face[2:4]) < 80:
                raise HTTPException(422, 'Aproxime o rosto da câmera.')
            crop = self.recognizer.alignCrop(frame, face)
            if cv2.Laplacian(crop, cv2.CV_64F).var() < 15:
                raise HTTPException(422, 'Imagem desfocada. Tente novamente.')
            emb = self.recognizer.feature(crop).flatten().astype(np.float32)
        return emb / max(float(np.linalg.norm(emb)), 1e-12)


@asynccontextmanager
async def lifespan(app):
    init_db()
    app.state.engine = Engine()
    app.state.slots = asyncio.Semaphore(2)
    yield


app = FastAPI(title='Verifica.ai · API de identidade', version='0.1.0', lifespan=lifespan,
              description='Verificação facial 1:1. Exige referência consentida e aprovação PAD independente.')
origins = [x.strip() for x in os.getenv('VERIFICA_ALLOWED_ORIGINS', '').split(',') if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET', 'POST', 'DELETE'], allow_headers=['Authorization', 'Content-Type'])


@app.middleware('http')
async def body_limit(request: Request, call_next):
    length = request.headers.get('content-length')
    if length:
        try:
            if int(length) > MAX_BYTES + 65536:
                from fastapi.responses import JSONResponse
                return JSONResponse({'detail': 'Envio excede 8 MiB.'}, status_code=413)
        except ValueError:
            from fastapi.responses import JSONResponse
            return JSONResponse({'detail': 'Content-Length inválido.'}, status_code=400)
    response = await call_next(request)
    path = request.url.path
    public_face_asset = path.startswith('/face/') and (
        path.endswith(('.wasm', '.mjs', '.task')) or path.rsplit('/', 1)[-1].startswith('vision_wasm_'))
    response.headers['Cache-Control'] = 'public, max-age=0, must-revalidate' if public_face_asset else 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


async def upload(file: UploadFile, allowed):
    try:
        if file.content_type not in allowed:
            raise HTTPException(415, 'Formato não suportado.')
        data = await file.read(MAX_BYTES + 1)
        if not data or len(data) > MAX_BYTES:
            raise HTTPException(413, 'Arquivo vazio ou maior que 8 MiB.')
        return data
    finally:
        await file.close()


def require_pad():
    url = os.getenv('VERIFICA_PAD_URL', '')
    local = url.startswith('http://127.0.0.1:8001/') or url.startswith('http://localhost:8001/')
    if not (url.startswith('https://') or local) or not os.getenv('VERIFICA_PAD_SECRET'):
        raise HTTPException(503, 'Prova de vida indisponível. Configure um provedor PAD validado.')
    return url


async def pad(data, session):
    url = require_pad()
    digest = hashlib.sha256(data).hexdigest()
    meta = {'session_id': session['id'], 'nonce': session['nonce'], 'sha256': digest}
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            response = await client.post(url, data={**meta, 'challenge': session['challenge']},
                files={'video': ('capture.webm', data, 'application/octet-stream')},
                headers={'Authorization': 'Bearer ' + os.environ['VERIFICA_PAD_SECRET']})
            response.raise_for_status()
            result = response.json()
        payload = {key: result[key] for key in ('session_id', 'nonce', 'sha256', 'live', 'score', 'validated', 'actions', 'objects')}
        encoded = json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()
        expected = hmac.new(os.environ['VERIFICA_PAD_SECRET'].encode(), encoded, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, str(result.get('signature', ''))):
            raise ValueError('signature')
        if any(payload[k] != v for k, v in meta.items()):
            raise ValueError('binding')
        score = float(payload['score'])
        if not math.isfinite(score) or not 0 <= score <= 1 or type(payload['live']) is not bool:
            raise ValueError('result')
        if payload['validated'] is not False:
            raise ValueError('Experimental engine must return validated=false')
        return payload
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise HTTPException(502, 'Provedor PAD indisponível ou resposta inválida.')


def video_embedding(data, engine):
    samples = sample_video(data, size=960)
    vectors = [engine.embedding(samples[i][1]) for i in np.linspace(0, len(samples) - 1, 8).astype(int)]
    if min(float(np.dot(vectors[0], v)) for v in vectors) < 0.363:
        raise HTTPException(422, 'Rosto inconsistente ao longo da captura.')
    mean = np.mean(vectors, axis=0)
    return mean / np.linalg.norm(mean)


@app.get('/api/v1/health')
def health():
    return {'status': 'development', 'face_engine': 'ready' if app.state.engine.ready else 'not_configured',
            'liveness': 'configured_unvalidated' if os.getenv('VERIFICA_PAD_URL') else 'not_configured',
            'version': '0.1.0'}


@app.post('/api/v1/subjects', dependencies=[Depends(auth)], status_code=201)
async def enroll(subject_id: str = Form(..., min_length=1, max_length=128, pattern=r'^[a-zA-Z0-9_.@-]+$'),
                 consent: bool = Form(...), reference: UploadFile = File(...),
                 display_name: str = Form(default='', max_length=80)):
    if not consent:
        raise HTTPException(422, 'O consentimento é obrigatório.')
    encryptor = cipher()
    data = await upload(reference, {'image/jpeg', 'image/png'})
    async with app.state.slots:
        emb = await asyncio.to_thread(app.state.engine.embedding, cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR))
    try:
        with db() as c:
            c.execute('INSERT INTO subjects(id, template, created, display_name) VALUES (?, ?, ?, ?)',
                      (subject_id, encryptor.encrypt(emb.tobytes()), time.time(), display_name.strip()))
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'Identificador já cadastrado. Exclua a referência antes de substituí-la.')
    return {'subject_id': subject_id, 'status': 'enrolled'}


@app.get('/api/v1/subjects', dependencies=[Depends(auth)])
def subjects():
    with db() as c:
        rows = c.execute('SELECT id AS subject_id, display_name, created FROM subjects ORDER BY created DESC, id LIMIT 1001').fetchall()
    return {'subjects': [dict(row) for row in rows[:1000]], 'has_more': len(rows) > 1000}


@app.post('/api/v1/sessions', dependencies=[Depends(auth)], status_code=201)
def session(body: SessionInput):
    if not body.consent:
        raise HTTPException(422, 'O consentimento é obrigatório.')
    require_pad()
    if not app.state.engine.ready:
        raise HTTPException(503, 'Motor facial não configurado.')
    with db() as c:
        if not c.execute('SELECT 1 FROM subjects WHERE id=?', (body.subject_id,)).fetchone():
            raise HTTPException(404, 'Referência não encontrada.')
        sid, nonce, expires = secrets.token_urlsafe(24), secrets.token_urlsafe(24), time.time() + 120
        c.execute('DELETE FROM sessions WHERE expires < ?', (time.time() - 3600,))
        turns = ['turn_left', 'turn_right']
        secrets.SystemRandom().shuffle(turns)
        challenge = ['center', *turns]
        c.execute('INSERT INTO sessions VALUES (?, ?, ?, ?, 0, ?)', (sid, body.subject_id, nonce, expires, json.dumps(challenge)))
    return {'session_id': sid, 'nonce': nonce, 'expires_at': expires, 'max_bytes': MAX_BYTES, 'max_duration_seconds': 8, 'challenge': challenge}


@app.post('/api/v1/sessions/{session_id}/verify', dependencies=[Depends(auth)])
async def verify(session_id: str, nonce: str = Form(...), video: UploadFile = File(...)):
    require_pad()
    data = await upload(video, {'video/webm', 'video/mp4'})
    with db() as c:
        row = c.execute('SELECT * FROM sessions WHERE id=?', (session_id,)).fetchone()
        if not row or not hmac.compare_digest(row['nonce'], nonce) or row['expires'] < time.time() or row['used']:
            raise HTTPException(409, 'Sessão inválida, expirada ou já utilizada. Crie uma nova sessão.')
        changed = c.execute('UPDATE sessions SET used=1 WHERE id=? AND used=0', (session_id,)).rowcount
        if changed != 1:
            raise HTTPException(409, 'Sessão já utilizada.')
        subject = c.execute('SELECT template FROM subjects WHERE id=?', (row['subject'],)).fetchone()
    if not subject:
        raise HTTPException(404, 'Referência removida.')
    started = time.monotonic()
    async with app.state.slots:
        pad_result = await pad(data, row)
        live = pad_result['live']
        similarity = None
        if live:
            candidate = await asyncio.to_thread(video_embedding, data, app.state.engine)
            reference = np.frombuffer(cipher().decrypt(subject['template']), dtype=np.float32)
            similarity = float(np.clip(np.dot(reference, candidate), -1, 1))
    threshold = float(os.getenv('VERIFICA_FACE_THRESHOLD', '0.363'))
    approved = live and similarity is not None and similarity >= threshold
    status = 'review_required' if approved else ('liveness_failed' if not live else 'face_mismatch')
    elapsed = round((time.monotonic() - started) * 1000)
    with db() as c:
        c.execute('INSERT INTO events VALUES (?, ?, ?, ?, ?)', (session_id, row['subject'], status, time.time(), elapsed))
    return {'session_id': session_id, 'decision': status, 'similarity': similarity, 'threshold': threshold,
            'liveness': {k: pad_result[k] for k in ('live', 'score', 'validated', 'actions', 'objects')}, 'elapsed_ms': elapsed}


@app.get('/api/v1/events', dependencies=[Depends(auth)])
def events():
    with db() as c:
        return {'events': [dict(row) for row in c.execute('SELECT * FROM events ORDER BY created DESC LIMIT 100')]}


@app.delete('/api/v1/subjects/{subject_id}', dependencies=[Depends(auth)], status_code=204)
def delete_subject(subject_id: str):
    with db() as c:
        c.execute('DELETE FROM subjects WHERE id=?', (subject_id,))
        c.execute('DELETE FROM sessions WHERE subject=?', (subject_id,))
        c.execute('DELETE FROM events WHERE subject=?', (subject_id,))


app.mount('/face', StaticFiles(directory=ROOT / 'dist' / 'face'), name='face-guidance')
app.mount('/assets', StaticFiles(directory=ROOT / 'dist'), name='assets')


@app.get('/', include_in_schema=False)
def console():
    return FileResponse(ROOT / 'dist' / 'index.html')


@app.get('/style.css', include_in_schema=False)
def css():
    return FileResponse(ROOT / 'dist' / 'style.css')


@app.get('/app.js', include_in_schema=False)
def js():
    return FileResponse(ROOT / 'dist' / 'app.js')
