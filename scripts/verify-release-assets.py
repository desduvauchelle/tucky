#!/usr/bin/env python3
"""Require every uploaded artifact to match the local SHA-256 manifest."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

release = json.loads(subprocess.check_output(['gh', 'api',
    f'repos/{os.environ["GITHUB_REPOSITORY"]}/releases/{os.environ["RELEASE_ID"]}'], text=True))
assets = {asset['name']: asset for asset in release['assets']}
expected = {}
for line in Path('SHA256SUMS.txt').read_text().splitlines():
    digest, name = line.split(maxsplit=1)
    expected[name.strip()] = digest
expected['SHA256SUMS.txt'] = hashlib.sha256(Path('SHA256SUMS.txt').read_bytes()).hexdigest()
for name, digest in expected.items():
    if name not in assets or assets[name].get('digest') != 'sha256:' + digest:
        raise SystemExit('Uploaded release digest is missing or mismatched: ' + name)
print('All uploaded release assets match their local verified SHA-256 values.')
