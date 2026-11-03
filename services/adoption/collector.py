"""Aggregate-only installation counter. Standard library; no external analytics SDK.

Run behind an HTTPS reverse proxy with access/error request logging disabled.
No request headers, source addresses, bodies, or individual events are persisted.
"""
import argparse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import sqlite3

MAX_BODY = 256
PLATFORMS = {'macos', 'windows', 'linux'}


def validate(payload):
    return (isinstance(payload, dict)
            and set(payload) == {'event', 'version', 'platform'}
            and payload['event'] == 'first_launch'
            and isinstance(payload['version'], str)
            and re.fullmatch(r'\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[a-zA-Z0-9.-]{1,24})?', payload['version']) is not None
            and isinstance(payload['platform'], str)
            and payload['platform'] in PLATFORMS)


def initialize(database):
    with sqlite3.connect(database) as db:
        db.execute('''CREATE TABLE IF NOT EXISTS daily_counts (
            day TEXT NOT NULL, version TEXT NOT NULL, platform TEXT NOT NULL,
            count INTEGER NOT NULL, PRIMARY KEY (day, version, platform))''')


def record(database, payload):
    # One aggregate row, no per-request row or exact request timestamp.
    day = datetime.now(timezone.utc).date().isoformat()
    with sqlite3.connect(database) as db:
        db.execute('''INSERT INTO daily_counts VALUES (?, ?, ?, 1)
            ON CONFLICT(day, version, platform) DO UPDATE SET count = count + 1''',
                   (day, payload['version'], payload['platform']))


def handler_for(database):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'InstallationCounter'
        sys_version = ''

        def setup(self):
            super().setup()
            self.connection.settimeout(5)

        def log_message(self, *_args):
            pass  # Includes malformed requests and default error/access logging.

        def reply(self, status):
            self.send_response(status)
            self.send_header('Content-Length', '0')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()

        def do_POST(self):
            if self.path != '/first-launch':
                return self.reply(404)
            if self.headers.get('Transfer-Encoding') is not None:
                return self.reply(400)
            if self.headers.get('Content-Type') != 'application/json':
                return self.reply(415)
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= MAX_BODY:
                    return self.reply(413)
                payload = json.loads(self.rfile.read(length))
            except (ValueError, UnicodeError, TimeoutError, OSError):
                return self.reply(400)
            if not validate(payload):
                return self.reply(400)
            try:
                record(database, payload)
            except sqlite3.Error:
                # No exception/body/headers/IP logging, including storage failures.
                return self.reply(503)
            self.reply(204)

    return Handler


class PrivateServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        # The standard implementation prints the client IP + traceback to stderr.
        # Keep failures private; availability monitoring must use aggregate health.
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, type=Path)
    parser.add_argument('--port', type=int, default=8788)
    parser.add_argument('--summary', action='store_true', help='Read aggregates locally; no public read API')
    args = parser.parse_args()
    if args.summary:
        # mode=ro prevents creating an empty database when a path is mistyped.
        with sqlite3.connect(args.database.resolve().as_uri() + '?mode=ro', uri=True) as db:
            print(json.dumps(db.execute('SELECT day, version, platform, count FROM daily_counts ORDER BY day').fetchall()))
        return
    initialize(args.database)
    PrivateServer(('127.0.0.1', args.port), handler_for(args.database)).serve_forever()


if __name__ == '__main__':
    main()
