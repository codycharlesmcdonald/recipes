"""Serve a folder on a free local port, open one page in headless Chrome, print the text of its #out element.

    python3 -I -B run_tests.py <site folder> [page path, default tests/index.html]

Exit 0 when the page's title ends up PASSED, 1 otherwise. Standard library only; Chrome runs headless with a
throwaway profile folder, so the everyday Chrome is not touched.
"""
import functools
import html
import http.server
import re
import socketserver
import subprocess
import sys
import tempfile
import threading

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    root = sys.argv[1]
    page = sys.argv[2] if len(sys.argv) > 2 else "tests/index.html"
    handler = functools.partial(Quiet, directory=root)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler) as srv:
        port = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        with tempfile.TemporaryDirectory(prefix="recipe-tests-chrome-") as profile:
            cmd = [CHROME, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                   "--user-data-dir=" + profile, "--virtual-time-budget=15000", "--dump-dom",
                   "http://127.0.0.1:%d/%s" % (port, page)]
            p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
        srv.shutdown()
    dom = p.stdout.decode("utf-8", "replace")
    title = re.search(r"<title>(.*?)</title>", dom, re.S)
    out = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
    print(html.unescape(out.group(1)) if out else "no #out element in the page; Chrome said: " + p.stderr.decode("utf-8", "replace")[-600:])
    ok = bool(title) and title.group(1).strip() == "PASSED"
    print("title:", title.group(1).strip() if title else None)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
