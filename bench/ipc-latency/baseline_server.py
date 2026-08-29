"""Serve the pre-IPC harness with NO bundler in the request path.

Vite's dev server cannot serve onnxruntime-web's `.mjs` files untouched: it
claims every same-origin request that looks like a module, appends `?import`,
and then either blocks it under COEP or fails the transform with a 500. That
was invisible from the page - the benchmark simply hung - and it is why the
harness silently fell back to fetching its runtime from a CDN in the first
place, which is the whole reason these numbers had to be re-taken.

So the harness is BUILT once and then served as static files by a plain HTTP
server that adds the three headers the measurement depends on:

  COOP same-origin + COEP require-corp   cross-origin isolation, without which
                                         onnxruntime-web silently drops to one
                                         WASM thread and the comparison is
                                         between different configurations
  CORP same-origin                       or COEP blocks every subresource
"""

import http.server
import socketserver
import subprocess
import threading
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
HARNESS = REPO / 'bench' / 'wasm-latency'
DIST = HARNESS / 'dist'
MODELS = REPO / '.hf-cache'
ORT = MODELS / 'ort'

# What the URL prefix maps to on disk. `/ort/` and `/hfmodels/` are the paths
# main.mjs asks for; everything else is the built harness itself.
ROUTES = (('/hfmodels/', MODELS), ('/ort/', ORT))

TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
}


def build() -> None:
    subprocess.run(
        ['npx.cmd', 'vite', 'build', '--outDir', 'dist', '--emptyOutDir'],
        cwd=HARNESS, check=True, capture_output=True, text=True, timeout=600,
    )


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_a):
        pass

    def resolve(self, path: str) -> Path | None:
        clean = path.split('?')[0]
        for prefix, root in ROUTES:
            if clean.startswith(prefix):
                target = (root / clean[len(prefix):]).resolve()
                return target if str(target).startswith(str(root.resolve())) else None
        if clean in ('/', ''):
            clean = '/index.html'
        target = (DIST / clean.lstrip('/')).resolve()
        return target if str(target).startswith(str(DIST.resolve())) else None

    def do_GET(self):  # noqa: N802 - http.server's interface
        target = self.resolve(self.path)
        if target is None or not target.is_file():
            self.send_error(404)
            return
        body = target.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', TYPES.get(target.suffix, 'application/octet-stream'))
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.end_headers()
        self.wfile.write(body)


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def serve(port: int) -> Server:
    """Builds the harness, then serves it. Returns the running server."""
    if not ORT.is_dir():
        ORT.mkdir(parents=True, exist_ok=True)
        for f in (REPO / 'node_modules' / 'onnxruntime-web' / 'dist').glob('ort-wasm-*'):
            (ORT / f.name).write_bytes(f.read_bytes())
    build()
    # Bound on IPv4 AND reachable as 'localhost': vite binds IPv6-only here,
    # which already turned one readiness probe into a false failure.
    httpd = Server(('127.0.0.1', port), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd
