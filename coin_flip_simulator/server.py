"""Serve the coin-flip simulator web app locally and print its URL."""

from __future__ import annotations

import argparse
import errno
import functools
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

STATIC_DIR = Path(__file__).resolve().parent / "static"


class Handler(SimpleHTTPRequestHandler):
    # Module scripts and module workers must be served with a JavaScript MIME type;
    # don't rely on the OS mime.types database for that.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".html": "text/html",
    }

    def end_headers(self) -> None:
        # Always serve the latest files while you're editing them.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:  # noqa: A002 (stdlib signature)
        if self.verbose:
            super().log_message(format, *args)

    verbose = False


def bind(host: str, port: int, tries: int) -> ThreadingHTTPServer:
    """Bind to `port`, or the next free port if it's taken."""
    handler = functools.partial(Handler, directory=str(STATIC_DIR))
    for candidate in range(port, port + tries):
        try:
            return ThreadingHTTPServer((host, candidate), handler)
        except OSError as exc:
            if exc.errno != errno.EADDRINUSE:
                raise
    raise SystemExit(f"No free port found in {port}-{port + tries - 1}. Try --port.")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="coin-flip", description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="address to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="port to try first (default: 8000)")
    parser.add_argument("--open", action="store_true", help="also open the page in your browser")
    parser.add_argument("--verbose", action="store_true", help="log every HTTP request")
    args = parser.parse_args(argv)

    Handler.verbose = args.verbose
    server = bind(args.host, args.port, tries=20)
    port = server.server_address[1]
    shown_host = "localhost" if args.host in ("127.0.0.1", "0.0.0.0", "::", "") else args.host
    url = f"http://{shown_host}:{port}/"

    print(f"Coin flip simulator running at: {url}", flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.", file=sys.stderr)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
