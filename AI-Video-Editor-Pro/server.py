#!/usr/bin/env python3
"""Local static server with COOP/COEP headers for FFmpeg.wasm (Class B)."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        super().end_headers()

if __name__ == "__main__":
    host, port = "127.0.0.1", 8080
    print(f"AI Video Editor Pro http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
