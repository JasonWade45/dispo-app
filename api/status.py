"""GET /api/status — is a refresh cached, and when was it taken?"""
import json, os, time
from http.server import BaseHTTPRequestHandler

CACHE = '/tmp/dispo-refresh.json'


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        payload = {'ok': True, 'source': 'https://www.elevatereg.com', 'endpoint': '/api/refresh'}
        try:
            with open(CACHE) as f:
                d = json.load(f)
            payload.update(cached=True, age_seconds=int(time.time() - d.get('_at', 0)),
                           checked=d.get('checked'), listings=d.get('count'),
                           available=d.get('available'), pending=d.get('pending'),
                           sold=d.get('sold'))
        except Exception:
            payload['cached'] = False
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass
