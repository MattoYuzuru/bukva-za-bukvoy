#!/usr/bin/env python3
"""Локальный сервер статической игры. По умолчанию доступен только на этом компьютере."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--host', default='127.0.0.1')
parser.add_argument('--port', type=int, default=8877)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent / 'game'
class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()
server = ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=str(root)))
print(f'Игра: http://{args.host}:{args.port}', flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
