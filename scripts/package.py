"""Create a source download without secrets, models, local state or git metadata."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
output = root / 'dist' / 'verifica-ai-source.zip'
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for directory in ('backend', 'tests', 'docs', 'scripts', 'dist', '.openai', '.impeccable'):
        for file in (root / directory).rglob('*'):
            if not file.is_file() or file == output or '__pycache__' in file.parts or '.pyc' == file.suffix:
                continue
            archive.write(file, 'verifica-ai/' + str(file.relative_to(root)))
    for name in ('README.md', 'requirements.txt', 'package.json', 'package-lock.json', '.env.example', '.gitignore', 'PRODUCT.md', 'DESIGN.md'):
        if not (root / name).exists():
            continue
        archive.write(root / name, 'verifica-ai/' + name)
print(output)
