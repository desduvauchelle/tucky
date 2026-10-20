#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class AutomationTests(unittest.TestCase):
    def run_script(self, script, data, status=0, tag='', corrupt=False):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'package.json').write_text('{"version":"1.0.28"}')
            (root/'SHA256SUMS.txt').write_text(hashlib.sha256(b'fixture').hexdigest()+'  Tucky-arm64.dmg\n')
            if script=='verify-release-assets.py':
                data={'assets':[{'name':'Tucky-arm64.dmg','digest':'sha256:'+hashlib.sha256(b'fixture').hexdigest()},
                    {'name':'SHA256SUMS.txt','digest':'sha256:'+hashlib.sha256((root/'SHA256SUMS.txt').read_bytes()).hexdigest()}]}
                if corrupt: data['assets'][0]['digest']='sha256:wrong'
            binaries=root/'bin';binaries.mkdir()
            gh=binaries/'gh';gh.write_text('#!/bin/bash\nprintf "%s" "$TEST_API"\nif [[ "$TEST_STATUS" != 0 ]]; then echo "HTTP $TEST_STATUS" >&2; exit 1; fi\n');gh.chmod(0o755)
            git=binaries/'git';git.write_text('#!/bin/bash\necho 0123456789abcdef\n');git.chmod(0o755)
            output=root/'outputs'
            result=subprocess.run(['python3',str(ROOT/'scripts'/script)],cwd=root,
                env=dict(os.environ,PATH=str(binaries)+':'+os.environ['PATH'],TEST_API=json.dumps(data),
                    TEST_STATUS=str(status),GITHUB_REF_NAME='main',INPUT_TAG=tag,GITHUB_REPOSITORY='fixture/repo',
                    GITHUB_OUTPUT=str(output),RELEASE_TAG='v1.0.28'),capture_output=True,text=True)
            return result, output.read_text() if output.exists() else ''

    def test_published_release_is_never_rebuilt(self):
        result,output=self.run_script('prepare-release.py',{'draft':False})
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('should_release=false',output)

    def test_missing_release_builds_version_from_main(self):
        result,output=self.run_script('prepare-release.py',{},404)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('tag=v1.0.28',output)
        self.assertIn('should_release=true',output)

    def test_api_failure_and_wrong_tag_fail_closed(self):
        for status,tag in [(403,''),(0,'v1.0.29')]:
            result,output=self.run_script('prepare-release.py',{},status,tag)
            self.assertNotEqual(result.returncode,0)
            self.assertEqual(output,'')

    def test_corrupt_upload_blocks_publishing(self):
        for corrupt in [False,True]:
            result,_=self.run_script('verify-release-assets.py',{},corrupt=corrupt)
            self.assertEqual(result.returncode==0,not corrupt,result.stderr)


if __name__=='__main__':unittest.main()
