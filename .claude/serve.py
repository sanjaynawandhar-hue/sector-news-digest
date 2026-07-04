#!/usr/bin/env python3
"""Minimal static server (sandbox-safe: no os.getcwd())."""
import functools, http.server, socketserver
DIRECTORY = "/Users/suhani/Documents/sector-news-digest"
PORT = 8770
Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=DIRECTORY)
with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"Serving {DIRECTORY} at http://127.0.0.1:{PORT}")
    httpd.serve_forever()
