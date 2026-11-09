import hashlib
import hmac
import json
import time

import cv2
import httpx
import numpy as np
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from backend import main, liveness

AUTH = {'Authorization': 'Bearer test-admin'}


class FakeEngine:
    ready = True

    def embedding(self, image):
        return np.array([1., 0., 0.], dtype=np.float32)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('VERIFICA_DB', str(tmp_path / 'test.db'))
    monkeypatch.setenv('VERIFICA_ADMIN_KEY', 'test-admin')
    monkeypatch.setenv('VERIFICA_TEMPLATE_KEY', Fernet.generate_key().decode())
    monkeypatch.setenv('VERIFICA_PAD_URL', 'http://127.0.0.1:8001/api/v1/analyze')
    monkeypatch.setenv('VERIFICA_PAD_SECRET', 'test-pad')
    with TestClient(main.app) as c:
        main.app.state.engine = FakeEngine()
        yield c


def enroll(client):
    _, png = cv2.imencode('.png', np.zeros((100, 100, 3), np.uint8))
    return client.post('/api/v1/subjects', headers=AUTH, data={'subject_id': 'employee_1', 'consent': 'true'},
                       files={'reference': ('ref.png', png.tobytes(), 'image/png')})


def session(client):
    assert enroll(client).status_code == 201
    result = client.post('/api/v1/sessions', headers=AUTH, json={'subject_id': 'employee_1', 'consent': True})
    assert result.status_code == 201
    return result.json()


def verify(client, s, nonce=None):
    return client.post('/api/v1/sessions/' + s['session_id'] + '/verify', headers=AUTH,
                       data={'nonce': nonce or s['nonce']}, files={'video': ('clip.webm', b'video', 'video/webm')})


def test_auth_required(client):
    assert client.get('/api/v1/events').status_code == 401
    assert client.get('/api/v1/events', headers={'Authorization': 'Bearer wrong'}).status_code == 401
    assert client.get('/api/v1/events', headers=AUTH).status_code == 200


def test_encryption_duplicate_and_delete(client):
    assert enroll(client).status_code == 201
    assert enroll(client).status_code == 409
    with main.db() as db:
        template = db.execute('SELECT template FROM subjects').fetchone()[0]
    assert template != FakeEngine().embedding(None).tobytes()
    assert main.cipher().decrypt(template) == FakeEngine().embedding(None).tobytes()
    assert client.delete('/api/v1/subjects/employee_1', headers=AUTH).status_code == 204
    assert client.post('/api/v1/sessions', headers=AUTH, json={'subject_id': 'employee_1', 'consent': True}).status_code == 404


def test_consent_and_missing_provider_fail_closed(client, monkeypatch):
    assert client.post('/api/v1/sessions', headers=AUTH, json={'subject_id': 'employee_1', 'consent': False}).status_code == 422
    monkeypatch.delenv('VERIFICA_PAD_URL')
    assert client.post('/api/v1/sessions', headers=AUTH, json={'subject_id': 'employee_1', 'consent': True}).status_code == 503


def test_challenge_nonce_expiry(client):
    s = session(client)
    assert s['challenge'][0] == 'center'
    assert set(s['challenge'][1:]) == {'turn_left', 'turn_right'}
    assert verify(client, s, 'tampered').status_code == 409
    with main.db() as db:
        db.execute('UPDATE sessions SET expires=?', (time.time() - 1,))
    assert verify(client, s).status_code == 409


@pytest.mark.parametrize('live,expected', [(True, 'review_required'), (False, 'liveness_failed')])
def test_never_auto_approve_experimental_and_single_use(client, monkeypatch, live, expected):
    s = session(client)

    async def pad(*args):
        return {'live': live, 'score': 1. if live else 0., 'validated': False, 'actions': [], 'objects': []}

    monkeypatch.setattr(main, 'pad', pad)
    monkeypatch.setattr(main, 'video_embedding', lambda *args: np.array([1., 0., 0.], np.float32))
    result = verify(client, s)
    assert result.status_code == 200, result.text
    assert result.json()['decision'] == expected
    assert verify(client, s).status_code == 409
    events = client.get('/api/v1/events', headers=AUTH).json()['events']
    assert len(events) == 1
    client.delete('/api/v1/subjects/employee_1', headers=AUTH)
    assert client.get('/api/v1/events', headers=AUTH).json()['events'] == []


def test_bad_video_mime(client):
    s = session(client)
    assert client.post('/api/v1/sessions/' + s['session_id'] + '/verify', headers=AUTH,
                       data={'nonce': s['nonce']}, files={'video': ('x.txt', b'bad', 'text/plain')}).status_code == 415


def test_oversized_upload(client):
    s = session(client)
    result = client.post('/api/v1/sessions/' + s['session_id'] + '/verify', headers=AUTH,
                         data={'nonce': s['nonce']}, files={'video': ('x.webm', b'x' * (main.MAX_BYTES + 1), 'video/webm')})
    assert result.status_code == 413


def test_actions_from_landmarks():
    face = np.zeros(15)
    face[4], face[6] = 80, 120
    face[8] = 100
    assert liveness.action_for_face(face) == 'center'
    face[8] = 110
    assert liveness.action_for_face(face) == 'turn_left'
    face[8] = 90
    assert liveness.action_for_face(face) == 'turn_right'


def test_liveness_auth_hash_and_signed_result(monkeypatch):
    monkeypatch.setenv('VERIFICA_PAD_SECRET', 'test-pad')
    result = {'live': True, 'score': 1., 'validated': False, 'actions': [], 'objects': [], 'reason': 'experimental_challenge_only'}
    monkeypatch.setattr(liveness, 'analyze_clip', lambda *args: result)
    with TestClient(liveness.app) as c:
        data = {'session_id': 's1', 'nonce': 'n1', 'sha256': hashlib.sha256(b'clip').hexdigest(),
                'challenge': json.dumps(['center', 'turn_left', 'turn_right'])}
        files = {'video': ('x.webm', b'clip', 'video/webm')}
        assert c.post('/api/v1/analyze', data=data, files=files).status_code == 401
        headers = {'Authorization': 'Bearer test-pad'}
        assert c.post('/api/v1/analyze', headers=headers, data={**data, 'sha256': '0' * 64}, files=files).status_code == 422
        assert c.post('/api/v1/analyze', headers=headers, data={**data, 'challenge': '[]'}, files=files).status_code == 422
        response = c.post('/api/v1/analyze', headers=headers, data=data, files=files)
        assert response.status_code == 200
        out = response.json()
        payload = {k: out[k] for k in ('session_id', 'nonce', 'sha256', 'live', 'score', 'validated', 'actions', 'objects')}
        expected = hmac.new(b'test-pad', json.dumps(payload, sort_keys=True, separators=(',', ':')).encode(), hashlib.sha256).hexdigest()
        assert out['signature'] == expected


def test_pad_rejects_tampered_signature(client, monkeypatch):
    import asyncio
    real_client = httpx.AsyncClient
    payload = {'session_id': 's1', 'nonce': 'n1', 'sha256': hashlib.sha256(b'clip').hexdigest(),
               'live': True, 'score': 1., 'validated': False, 'actions': [], 'objects': [], 'signature': 'tampered'}
    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=payload))
    monkeypatch.setattr(main.httpx, 'AsyncClient', lambda **kwargs: real_client(transport=transport, **kwargs))
    with pytest.raises(main.HTTPException) as error:
        asyncio.run(main.pad(b'clip', {'id': 's1', 'nonce': 'n1', 'challenge': '["center","turn_left","turn_right"]'}))
    assert error.value.status_code == 502


def test_local_console_assets(client):
    for path in ('/', '/style.css', '/app.js', '/openapi.json'):
        assert client.get(path).status_code == 200


def test_subjects_list_auth_and_shared_metadata_without_biometrics(client):
    assert client.get('/api/v1/subjects').status_code == 401
    assert client.get('/api/v1/subjects', headers=AUTH).json()['subjects'] == []
    _, png = cv2.imencode('.png', np.zeros((100, 100, 3), np.uint8))
    response = client.post('/api/v1/subjects', headers=AUTH,
        data={'subject_id': 'shared_person', 'display_name': 'Ana Silva', 'consent': 'true'},
        files={'reference': ('reference.png', png.tobytes(), 'image/png')})
    assert response.status_code == 201
    # A fresh database connection sees the same persisted metadata.
    main.init_db()
    result = client.get('/api/v1/subjects', headers=AUTH).json()
    assert result['subjects'][0]['subject_id'] == 'shared_person'
    assert result['subjects'][0]['display_name'] == 'Ana Silva'
    assert set(result['subjects'][0]) == {'subject_id', 'display_name', 'created'}
    assert result['has_more'] is False
    client.delete('/api/v1/subjects/shared_person', headers=AUTH)
    assert client.get('/api/v1/subjects', headers=AUTH).json()['subjects'] == []


def test_existing_database_migration_preserves_templates(tmp_path, monkeypatch):
    import sqlite3
    path = tmp_path / 'legacy.db'
    monkeypatch.setenv('VERIFICA_DB', str(path))
    with sqlite3.connect(path) as db:
        db.execute('CREATE TABLE subjects(id TEXT PRIMARY KEY, template BLOB NOT NULL, created REAL)')
        db.execute('INSERT INTO subjects VALUES (?, ?, ?)', ('old_person', b'encrypted-reference', 1))
    main.init_db()
    main.init_db()
    with main.db() as db:
        record = dict(db.execute('SELECT * FROM subjects').fetchone())
    assert record == {'id': 'old_person', 'template': b'encrypted-reference', 'created': 1, 'display_name': ''}
