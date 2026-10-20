#!/usr/bin/env python3
"""Resolve an immutable source commit and avoid replacing published releases."""
import json
import os
from pathlib import Path
import re
import subprocess

version = json.loads(Path('package.json').read_text())['version']
tag = os.environ.get('INPUT_TAG') or (
    os.environ['GITHUB_REF_NAME'] if os.environ['GITHUB_REF_NAME'].startswith('v') else f'v{version}')
if not re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?', tag):
    raise SystemExit('Invalid version tag')
if tag != f'v{version}':
    raise SystemExit('Release tag must match package.json in the selected commit')
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
result = subprocess.run(['gh', 'api', f'repos/{os.environ["GITHUB_REPOSITORY"]}/releases/tags/{tag}'],
                        capture_output=True, text=True)
if result.returncode == 0:
    release = json.loads(result.stdout)
    should_release = release.get('draft', False)
elif 'HTTP 404' in result.stderr:
    should_release = True
else:
    raise SystemExit('Could not check existing release; refusing to publish blindly')
values = {'tag': tag, 'commit': commit, 'should_release': str(should_release).lower()}
with open(os.environ['GITHUB_OUTPUT'], 'a') as file:
    file.write(''.join(f'{key}={value}\n' for key, value in values.items()))
print(f'{tag}: ' + ('build verified artifacts' if should_release else 'already published; preserving existing assets'))
