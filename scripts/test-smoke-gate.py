#!/usr/bin/env python3
"""A clean exit without the frontend checkpoint must never pass release QA."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class SmokeGateTests(unittest.TestCase):
    def test_requires_frontend_checkpoint(self):
        for checkpoint in (False, True):
            with self.subTest(checkpoint=checkpoint), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / 'scripts').mkdir()
                shutil.copyfile(ROOT / 'scripts/smoke-test.sh', root / 'scripts/smoke-test.sh')
                (root / 'install.sh').write_text('''#!/bin/bash
set -eu
mkdir -p "$INSTALL_DIR/Tucky.app/Contents/MacOS"
cat > "$INSTALL_DIR/Tucky.app/Contents/MacOS/Tucky" <<'APP'
#!/bin/bash
if [[ "$TEST_CHECKPOINT" == 1 ]]; then echo 'SMOKE OK view=onboarding'; fi
exit 0
APP
chmod +x "$INSTALL_DIR/Tucky.app/Contents/MacOS/Tucky"
''')
                archive = root / 'fixture.tar.gz'
                archive.touch()
                result = subprocess.run(['bash', str(root / 'scripts/smoke-test.sh'), str(archive)],
                    env=dict(os.environ, TEST_CHECKPOINT=str(int(checkpoint))),
                    capture_output=True, text=True, timeout=15)
                if checkpoint:
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                else:
                    self.assertNotEqual(result.returncode, 0,
                                        'A second-instance exit was incorrectly accepted as a rendered app')


if __name__ == '__main__':
    unittest.main()
