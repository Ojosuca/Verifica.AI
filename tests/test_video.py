import cv2
import numpy as np
import pytest
from fastapi import HTTPException
from backend import video


def test_sequential_decode_without_container_duration(monkeypatch):
    class Capture:
        def __init__(self, *args):
            self.index = 0

        def get(self, prop):
            if prop == cv2.CAP_PROP_FPS:
                return 10.
            if prop == cv2.CAP_PROP_POS_MSEC:
                return (self.index - 1) * 100.
            raise AssertionError('Decoder must not rely on container frame count')

        def read(self):
            self.index += 1
            return (True, np.zeros((480, 640, 3), np.uint8)) if self.index <= 30 else (False, None)

        def release(self):
            pass

    monkeypatch.setattr(video.cv2, 'VideoCapture', Capture)
    samples = video.sample_video(b'unindexed-webm', size=320)
    assert 3 <= len(samples) <= 32
    assert samples[0][1].shape[:2] == (240, 320)
    assert samples[-1][0] > 2.5


def test_real_decode_and_invalid_video(tmp_path):
    path = tmp_path / 'clip.avi'
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*'MJPG'), 10, (160, 120))
    assert writer.isOpened()
    for i in range(30):
        writer.write(np.full((120, 160, 3), i * 5, dtype=np.uint8))
    writer.release()
    assert 3 <= len(video.sample_video(path.read_bytes())) <= 32
    with pytest.raises(HTTPException) as error:
        video.sample_video(b'not a video')
    assert error.value.status_code == 422
