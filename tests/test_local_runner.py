import json
import stat
import subprocess
import sys

import pytest
from cryptography.fernet import Fernet

from scripts import run_local


def test_restart_keeps_encryption_key_and_private_permissions(tmp_path):
    directory = tmp_path / 'local'
    first = run_local.load_credentials(directory)
    encrypted = Fernet(first['VERIFICA_TEMPLATE_KEY'].encode()).encrypt(b'reference')
    second = run_local.load_credentials(directory)
    assert second == first
    assert Fernet(second['VERIFICA_TEMPLATE_KEY'].encode()).decrypt(encrypted) == b'reference'
    assert stat.S_IMODE(directory.stat().st_mode) == 0o700
    assert stat.S_IMODE((directory / 'credentials.json').stat().st_mode) == 0o600


def test_lost_keys_do_not_silently_replace_existing_database_keys(tmp_path):
    (tmp_path / 'verifica-ai.db').touch()
    with pytest.raises(RuntimeError, match='Chaves ausentes'):
        run_local.load_credentials(tmp_path)
    assert not (tmp_path / 'credentials.json').exists()


def test_invalid_keys_are_preserved_for_recovery(tmp_path):
    path = tmp_path / 'credentials.json'
    content = json.dumps({'VERIFICA_ADMIN_KEY': 'broken'})
    path.write_text(content)
    with pytest.raises(RuntimeError, match='não foram trocadas'):
        run_local.load_credentials(tmp_path)
    assert path.read_text() == content


def test_cleanup_reaps_running_children():
    processes = [subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
                 for _ in range(2)]
    try:
        run_local.stop_processes(processes)
        assert all(process.poll() is not None for process in processes)
    finally:
        for process in processes:
            if process.poll() is None:
                process.kill()
                process.wait()
