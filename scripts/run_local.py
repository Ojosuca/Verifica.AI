"""Start the local MVP and optionally a temporary HTTPS tunnel."""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

from cryptography.fernet import Fernet

ROOT = Path(__file__).resolve().parent.parent
KEY_NAMES = ('VERIFICA_ADMIN_KEY', 'VERIFICA_TEMPLATE_KEY', 'VERIFICA_PAD_SECRET')


def load_credentials(directory):
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    directory.chmod(0o700)
    path = directory / 'credentials.json'
    if not path.exists():
        # Never replace a missing encryption key while an existing database remains.
        if (directory / 'verifica-ai.db').exists():
            raise RuntimeError('Chaves ausentes com banco existente. Restaure credentials.json do backup.')
        values = dict(zip(KEY_NAMES, (secrets.token_urlsafe(32),
                                      Fernet.generate_key().decode(), secrets.token_urlsafe(32))))
        with path.open('x', encoding='utf-8') as file:
            path.chmod(0o600)
            json.dump(values, file)
    path.chmod(0o600)
    try:
        values = json.loads(path.read_text(encoding='utf-8'))
        if any(not isinstance(values.get(key), str) or len(values[key]) < 32 for key in KEY_NAMES):
            raise ValueError('Missing key')
        Fernet(values['VERIFICA_TEMPLATE_KEY'].encode())
    except (ValueError, TypeError, AttributeError) as error:
        raise RuntimeError('Arquivo de chaves inválido. Restaure o backup; as chaves não foram trocadas.') from error
    return {key: values[key] for key in KEY_NAMES}


def check_ports():
    for port in (8000, 8001):
        with socket.socket() as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(('127.0.0.1', port))
            except OSError as error:
                raise RuntimeError(f'Porta {port} ocupada. Encerre a outra instância antes de iniciar.') from error


def wait_ready(process, url, expected):
    deadline = time.monotonic() + 60
    # Local health checks must not use an external HTTP proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('Um serviço encerrou durante a inicialização. Confira o erro acima.')
        try:
            with opener.open(url, timeout=1) as response:
                result = json.load(response)
            if not all(result.get(key) == value for key, value in expected.items()):
                raise RuntimeError('Modelos indisponíveis. Execute novamente bash scripts/setup-mac.sh.')
            return
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(0.2)
    raise RuntimeError('O serviço não iniciou em 60 segundos.')


def stop_processes(processes):
    for process in reversed(processes):
        if process.poll() is None:
            process.terminate()
    for process in reversed(processes):
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def main():
    parser = argparse.ArgumentParser(description='Verifica.ai local · Ctrl+C encerra todos os serviços')
    parser.add_argument('--share', action='store_true', help='Criar um link HTTPS temporário')
    args = parser.parse_args()
    processes = []
    os.umask(0o077)

    def interrupted(signum, frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupted)
    try:
        check_ports()
        if args.share and not shutil.which('cloudflared'):
            raise RuntimeError('Instale o túnel com: brew install cloudflared')
        keys = load_credentials(ROOT / '.local')
        env = {**os.environ, **keys,
               'VERIFICA_DB': str(ROOT / '.local' / 'verifica-ai.db'),
               'VERIFICA_PAD_URL': 'http://127.0.0.1:8001/api/v1/analyze'}
        for module, port, health, expected in (
            ('backend.liveness:app', 8001, '/health', {'face': True, 'objects': True}),
            ('backend.main:app', 8000, '/api/v1/health', {'face_engine': 'ready'}),
        ):
            process = subprocess.Popen([sys.executable, '-m', 'uvicorn', module,
                                        '--host', '127.0.0.1', '--port', str(port)],
                                       cwd=ROOT, env=env)
            processes.append(process)
            wait_ready(process, f'http://127.0.0.1:{port}{health}', expected)
        print('\nVerifica.ai pronto: http://localhost:8000', flush=True)
        if args.share:
            print('No celular/tablet: abra o link HTTPS que o túnel mostrará abaixo.', flush=True)
        print('Em Configurações, use o endereço aberto no navegador como URL da API.', flush=True)
        print('Chave administrativa (cole somente no seu console):', flush=True)
        print(keys['VERIFICA_ADMIN_KEY'], flush=True)
        print('Mantenha este Terminal aberto. Ctrl+C encerra os serviços e o link.\n', flush=True)
        if args.share:
            # Do not forward application secrets to the tunnel process.
            tunnel_env = {key: value for key, value in os.environ.items()
                          if not key.startswith('VERIFICA_')}
            processes.append(subprocess.Popen([
                'cloudflared', 'tunnel', '--url', 'http://127.0.0.1:8000',
            ], cwd=ROOT / '.local', env=tunnel_env))
        while True:
            for process in processes:
                if process.poll() is not None:
                    raise RuntimeError('Um serviço ou túnel encerrou. Reinicie bash scripts/start-mac.sh.')
            time.sleep(0.5)
    except KeyboardInterrupt:
        print('\nEncerrando Verifica.ai…', flush=True)
        return 0
    except (RuntimeError, OSError) as error:
        print(f'Erro: {error}', file=sys.stderr)
        return 1
    finally:
        stop_processes(processes)


if __name__ == '__main__':
    sys.exit(main())
