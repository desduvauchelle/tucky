#!/usr/bin/env python3
"""Exercise the exact embedded updater helper with fault-injected OS tools."""
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
HELPER = ROOT / 'src-tauri/src/update-install.sh'


class UpdateInstallTests(unittest.TestCase):
    def run_update(self, failure=''):
        with tempfile.TemporaryDirectory(prefix='tu-') as directory:
            root = Path(directory)
            target = root / 'Applications/Tucky.app'
            staged = root / 'pending/Tucky.app'
            for app, version in [(target, '1.0.27'), (staged, '1.0.28')]:
                binary = app / 'Contents/MacOS/Tucky'
                binary.parent.mkdir(parents=True)
                binary.write_text('''#!/bin/bash
if [[ "${TEST_FAILURE:-}" == launch ]]; then exit 1; fi
if [[ "${TEST_FAILURE:-}" == no_checkpoint ]]; then exit 0; fi
printf '1.0.28\\n' > "$TEST_STAGE/health-$TUCKY_UPDATE_HEALTH_TOKEN"
''')
                binary.chmod(0o755)
                (app / 'version').write_text(version)
                with (app / 'Contents/Info.plist').open('wb') as file:
                    plistlib.dump({'CFBundleShortVersionString': version}, file)
            binaries = root / 'bin'
            binaries.mkdir()
            mock = '''#!/usr/bin/env python3
import json, os, pathlib, shutil, subprocess, sys
name=pathlib.Path(sys.argv[0]).name
args=sys.argv[1:]
failure=os.environ.get('TEST_FAILURE')
with open(os.environ['TEST_LOG'],'a') as log: log.write(json.dumps([name,*args])+'\\n')
if name == 'codesign':
    assert '--deep' in args and '--strict' in args
    requirement=args[args.index('-R')+1]
    assert 'BSH2UEDLU5' in requirement and 'com.echoscribe.app' in requirement
    if failure == 'signature': sys.exit(1)
elif name == 'spctl' and failure == 'gatekeeper': sys.exit(1)
elif name == 'ditto':
    if failure == 'copy':
        pathlib.Path(args[-1]).mkdir(); sys.exit(1)
    shutil.copytree(args[-2],args[-1],symlinks=True)
elif name == 'mv':
    if failure == 'swap' and '.update-new-' in args[-2]: sys.exit(1)
    subprocess.run(['/bin/mv',*args],check=True)
'''
            for command in ['codesign','spctl','ditto','mv','open']:
                path = binaries / command
                path.write_text(mock)
                path.chmod(0o755)
            log = root / 'calls.jsonl'
            env = dict(os.environ, PATH=str(binaries)+':'+os.environ['PATH'],
                TEST_FAILURE=failure, TEST_LOG=str(log), TEST_STAGE=str(staged.parent))
            script = root / 'helper.sh'
            if HELPER.exists():
                script.write_text(HELPER.read_text())
                args = ['bash',str(script),str(target),str(staged),'999999','1.0.28','fixture',str(root/'helper.log')]
            else:
                # Reproduce the current inline helper before replacing it.
                source = (ROOT / 'src-tauri/src/updater.rs').read_text()
                raw = source.split('let script = format!(')[-1].split('"',1)[1].split('\",\n        log =',1)[0]
                raw = re.sub(r'\\\n\s*','',raw)
                script_text = json.loads('"'+raw+'"')
                for key,value in dict(log=root/'helper.log',pid=999999,target=target,
                                      staged=staged,staging_dir=staged.parent).items():
                    script_text=script_text.replace('{'+key+'}',str(value))
                script.write_text(script_text)
                args = ['bash',str(script)]
            result = subprocess.run(args,env=env,capture_output=True,text=True,timeout=15)
            version = (target/'version').read_text() if (target/'version').exists() else None
            backups = [p/'version' for p in target.parent.glob('*.update-backup-*')]
            calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
            return result,version,[p.read_text() for p in backups],calls

    def test_invalid_signature_and_gatekeeper_leave_old_app_intact(self):
        for failure in ['signature','gatekeeper']:
            with self.subTest(failure=failure):
                result,version,_,calls=self.run_update(failure)
                self.assertNotEqual(result.returncode,0)
                self.assertEqual(version,'1.0.27')

    def test_copy_and_swap_failures_restore_old_app(self):
        for failure in ['copy','swap','launch','no_checkpoint']:
            with self.subTest(failure=failure):
                result,version,_,calls=self.run_update(failure)
                self.assertNotEqual(result.returncode,0)
                self.assertEqual(version,'1.0.27')
                self.assertTrue(any(call[0]=='open' for call in calls))

    def test_success_requires_health_checkpoint_and_keeps_backup(self):
        result,version,backups,calls=self.run_update()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(version,'1.0.28')
        self.assertEqual(backups,['1.0.27'])
        self.assertGreaterEqual(sum(call[0]=='codesign' for call in calls),2)
        self.assertFalse(any(call[0]=='xattr' for call in calls))


if __name__ == '__main__': unittest.main()
