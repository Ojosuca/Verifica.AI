"""Bounded sequential decoding supports browser WebM without duration metadata."""
import math
import tempfile
import cv2
from fastapi import HTTPException


def sample_video(data, size=640):
    samples = []
    with tempfile.NamedTemporaryFile(suffix='.webm') as temp:
        temp.write(data)
        temp.flush()
        cap = cv2.VideoCapture(temp.name)
        try:
            fps = cap.get(cv2.CAP_PROP_FPS)
            valid_fps = math.isfinite(fps) and 1 <= fps <= 120
            frames, last_time = 0, 0.
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                frames += 1
                if frames > 961 or frame.shape[0] * frame.shape[1] > 20_000_000:
                    raise HTTPException(422, 'Vídeo excede limites de quadros ou resolução.')
                timestamp = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
                if not math.isfinite(timestamp) or timestamp < 0:
                    timestamp = 0.
                if timestamp <= last_time and frames > 1:
                    if not valid_fps:
                        raise HTTPException(422, 'Vídeo sem informação temporal válida.')
                    timestamp = (frames - 1) / fps
                if timestamp > 8.05:
                    raise HTTPException(422, 'Vídeo maior que 8 segundos.')
                last_time = timestamp
                if not samples or timestamp - samples[-1][0] >= .26:
                    h, w = frame.shape[:2]
                    scale = min(1., size / max(h, w))
                    samples.append((timestamp, cv2.resize(frame, (round(w * scale), round(h * scale)))))
                    if len(samples) > 32:
                        raise HTTPException(422, 'Vídeo excede o limite de amostras.')
            duration = last_time + (1 / fps if valid_fps else 0)
            if not 1 <= duration <= 8.1 or len(samples) < 3:
                raise HTTPException(422, 'Envie um vídeo entre 1 e 8 segundos.')
            return samples
        finally:
            cap.release()
