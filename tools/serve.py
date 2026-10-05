"""Lokaler Testserver ohne Browser-Cache.

python tools/serve.py [port]   (Standard 8000, im Projektordner starten)

python -m http.server sendet nur Last-Modified; Browser halten JS/CSS dann
heuristisch für frisch und laden geänderte Module nicht neu.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoStore(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    ThreadingHTTPServer(("127.0.0.1", port), partial(NoStore, directory=".")).serve_forever()
