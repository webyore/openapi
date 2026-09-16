"""WebYore short link example (Python 3.10+, standard library only)."""
import json
import os
import sys
import time
from email.utils import parsedate_to_datetime
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    token = os.environ.get("WEBYORE_API_KEY")
    key = os.environ.get("WEBYORE_IDEMPOTENCY_KEY")
    if not token or not key:
        raise RuntimeError("Set WEBYORE_API_KEY and WEBYORE_IDEMPOTENCY_KEY")
    base = os.environ.get("WEBYORE_API_BASE", "https://api.webyore.com/v1").rstrip("/")
    url = urlparse(base)
    if url.username or url.password or not (url.scheme == "https" or (url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1"))):
        raise RuntimeError("Use HTTPS, or HTTP on localhost for tests")
    body = json.dumps({"url": sys.argv[1] if len(sys.argv) > 1 else "https://example.com/article"}).encode()
    opener = build_opener(NoRedirect())
    for attempt in range(4):
        request = Request(base + "/links", data=body, headers={"Authorization": "Bearer " + token, "Idempotency-Key": key, "Content-Type": "application/json"})
        try:
            try:
                response = opener.open(request, timeout=30)
            except HTTPError as error:
                response = error
            with response:
                status, headers, raw = response.status, response.headers, response.read()
        except (URLError, OSError, HTTPException):
            if attempt == 3:
                raise RuntimeError("Network failure; retry the same request with the same idempotency key") from None
            time.sleep(2 ** attempt)
            continue
        try:
            data = json.loads(raw)
        except ValueError:
            data = {}
        if 200 <= status < 300:
            print(data["data"]["short_url"])
            return
        code = data.get("error", {}).get("code", "request_failed")
        retryable = status in (408, 429, 500, 502, 503, 504) or (status == 409 and code == "idempotency_in_progress")
        if not retryable or attempt == 3:
            raise RuntimeError(f"WebYore HTTP {status}: {code}")
        value = headers.get("Retry-After")
        delay = 2 ** attempt
        if value:
            try:
                delay = float(value) if value.isdigit() else parsedate_to_datetime(value).timestamp() - time.time()
            except (ValueError, TypeError, OverflowError):
                pass
        if delay > 60:
            raise RuntimeError("Retry later as requested by Retry-After, using the same idempotency key")
        time.sleep(max(0, delay))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never print request headers or API credentials.
        print(str(error) if isinstance(error, RuntimeError) else "Invalid or incomplete response; keep the idempotency key when retrying", file=sys.stderr)
        sys.exit(1)
