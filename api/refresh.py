"""GET /api/refresh — live snapshot of elevatereg.com (cached 10 min per warm instance)."""
import json, os, time
from http.server import BaseHTTPRequestHandler
from _scrape import snapshot

CACHE = '/tmp/dispo-refresh.json'
TTL = 600


def load():
    try:
        with open(CACHE) as f:
            cached = json.load(f)
        if time.time() - cached.get('_at', 0) < TTL:
            cached['cached'] = True
            return cached
    except Exception:
        pass
    data = snapshot(budget=45)
    data['_at'] = time.time()
    try:
        with open(CACHE, 'w') as f:
            json.dump(data, f)
    except Exception:
        pass
    data['cached'] = False
    return data


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            body = json.dumps(load(), separators=(',', ':')).encode()
            code = 200
        except Exception as e:
            body = json.dumps({'error': str(e)[:300]}).encode()
            code = 500
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass
