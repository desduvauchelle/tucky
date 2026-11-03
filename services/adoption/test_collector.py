from contextlib import redirect_stderr
import http.client
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest

from collector import PrivateServer, handler_for, initialize


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = Path(self.temp.name) / 'counts.sqlite'
        initialize(self.database)
        self.server = PrivateServer(('127.0.0.1', 0), handler_for(self.database))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def post(self, payload):
        client = http.client.HTTPConnection(*self.server.server_address)
        client.request('POST', '/first-launch', json.dumps(payload), {
            'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.5',
            'User-Agent': 'sensitive-unique-value',
        })
        response = client.getresponse()
        result = (response.status, response.read())
        client.close()
        return result

    def rows(self):
        with sqlite3.connect(self.database) as db:
            return db.execute('SELECT * FROM daily_counts').fetchall()

    def test_real_http_aggregates_without_retaining_request_metadata(self):
        payload = {'event': 'first_launch', 'version': '1.0.28', 'platform': 'macos'}
        logs = io.StringIO()
        with redirect_stderr(logs):
            self.assertEqual(self.post(payload), (204, b''))
            self.assertEqual(self.post(payload), (204, b''))
        rows = self.rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][1:], ('1.0.28', 'macos', 2))
        self.assertEqual(logs.getvalue(), '')
        content = self.database.read_bytes()
        self.assertNotIn(b'192.0.2.5', content)
        self.assertNotIn(b'sensitive-unique-value', content)

    def test_rejects_identifiers_content_and_invalid_events(self):
        base = {'event': 'first_launch', 'version': '1.0.28', 'platform': 'macos'}
        for payload in [dict(base, device_id='abc'), dict(base, transcript='hello'),
                        dict(base, version='someone@example.com'), dict(base, event='capture'),
                        dict(base, platform={}), dict(base, version=[]), [], None]:
            with self.subTest(payload=payload):
                self.assertEqual(self.post(payload)[0], 400)
        self.assertEqual(self.rows(), [])

    def test_rejects_oversized_request_without_logs_or_storage(self):
        logs = io.StringIO()
        with redirect_stderr(logs):
            self.assertEqual(self.post({'content': 'x' * 300})[0], 413)
        self.assertEqual(self.rows(), [])
        self.assertEqual(logs.getvalue(), '')


if __name__ == '__main__':
    unittest.main()
