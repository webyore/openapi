#!/usr/bin/env bash
# WebYore short link example: Bash, curl 7.76+ and Python 3.
set -euo pipefail
: "${WEBYORE_API_KEY:?Set WEBYORE_API_KEY}"
: "${WEBYORE_IDEMPOTENCY_KEY:?Set WEBYORE_IDEMPOTENCY_KEY}"
base="${WEBYORE_API_BASE:-https://api.webyore.com/v1}"
case "$base" in https://*|http://127.0.0.1:*|http://localhost:*) ;; *) echo 'Use HTTPS, or HTTP on localhost for tests' >&2; exit 1;; esac
body=$("${PYTHON_BIN:-python3}" -c 'import json,sys; print(json.dumps({"url":sys.argv[1]}))' "${1:-https://example.com/article}")
# curl retries transient HTTP failures (including 429/503) and honors Retry-After.
# No --location: redirects must never forward credentials to another host.
# A 409 is deliberately surfaced for inspection; only idempotency_in_progress is retryable.
response_file=$(mktemp)
trap 'rm -f -- "$response_file"' EXIT
if status=$(curl --silent --show-error --fail-with-body --connect-timeout 10 --max-time 30 \
  --retry 3 --retry-max-time 120 --retry-connrefused \
  --request POST --url "${base%/}/links" \
  --header "Authorization: Bearer $WEBYORE_API_KEY" \
  --header "Idempotency-Key: $WEBYORE_IDEMPOTENCY_KEY" \
  --header 'Content-Type: application/json' --data-binary "$body" \
  --output "$response_file" --write-out '%{http_code}'); then
  case "$status" in 2??) cat "$response_file";; *) echo "Unexpected HTTP $status; keep the idempotency key when retrying" >&2; exit 1;; esac
else
  code=$?
  cat "$response_file" >&2
  exit "$code"
fi
