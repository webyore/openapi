# WebYore API

OpenAPI 3.1 specification and runnable examples for the **WebYore API v1**: short links, updatable QR codes, web snapshots, and image hosting.

WebYore 提供短網址、可更新 QR Code、網頁快照與圖床。本 repo 收錄公開 API 規格與可執行範例；金鑰請存放在環境變數，勿提交到 GitHub。

- Website: https://webyore.com/
- Documentation: https://webyore.com/developers
- Production base URL: `https://api.webyore.com/v1`
- Canonical specification: https://api.webyore.com/openapi.json
- Specification format: OpenAPI 3.1.0; API contract version: 1.0.0
- General inquiries: contact@webyore.com
- Report abuse: https://webyore.com/report

## Run an example

Create a scoped API key in your WebYore account. Link examples require `links:write`; the image example requires `images:write` and `images:read`. Running the examples against production creates resources and uses your account's quota. Tests use localhost mocks and need no real credentials.

Set `WEBYORE_API_KEY` privately in your shell or secret manager. Set `WEBYORE_IDEMPOTENCY_KEY` to a unique value of 8–128 letters, digits, dots, underscores, colons, or hyphens for each new operation. Keep that key for retries of the **same request** (retained by the API for 24 hours). Do not commit keys or paste them into issues. These scripts do not read `.env` files automatically.

```sh
# After setting the two environment variables:
node examples/create-link.mjs https://example.com/article
python3 examples/create-link.py https://example.com/article
php examples/create-link.php https://example.com/article
bash examples/create-link.sh https://example.com/article
```

Run one example per intended operation. Choose a new idempotency key when switching language examples: serializers may generate different request bytes. JavaScript uses Node.js 22+; Python uses Python 3.10+ with the standard library; PHP uses PHP 8.1+ with ext-curl; the Bash example needs curl 7.76+ and Python 3 (`python3`).

The JavaScript, Python and PHP examples retry network failures and transient HTTP responses up to three times, preserving their request bytes and key. They honor `Retry-After`, stopping for a manual retry if the server requests more than 60 seconds. They retry `409 idempotency_in_progress`, but stop on `409 idempotency_conflict`, validation errors and authentication errors. The smaller cURL example uses curl's built-in transient retry policy; it surfaces 409 and other failures for inspection. Retry an in-progress request with the same key; resolve a conflict before creating another operation.

## Upload and wait for an image

With a new idempotency key:

```sh
node examples/upload-image.mjs ./photo.jpg
# Optional explicit MIME type:
node examples/upload-image.mjs ./photo.bin image/jpeg
```

This example sends raw image bytes through the existing `POST /images` API; it does not demonstrate the optional direct-to-R2 flow. Sources must be at most 10 MiB. The API validates their actual format. The filename extension only chooses the request MIME type and does not bypass validation.

A 202 response acknowledges acceptance; it may contain a processing image or a reused ready image. The example polls `GET /images/{id}`, handles failed/deleted results and prints the returned URL when ready. It stops after 60 polls, printing the image ID so you can resume status checks without uploading again. Network retries may extend elapsed time. The API's processing window can be longer than this example's polling window. Background content classification can finish after publication.

API keys belong on a trusted server or local machine. Do not bundle them into public browser JavaScript. `WEBYORE_API_BASE` is available for localhost tests; keep the production default unless you trust the alternative server. The examples do not follow redirects with credentials.

## Keep the specification current

`openapi.json` is generated from the same source as WebYore's production endpoint. Do not edit the snapshot manually.

```sh
npm run spec:check  # compare with the current production contract
npm run spec:update # download the current public contract; review and commit the diff
npm test           # local mocks only; no production writes
```

CI runs on pushes, pull requests and manual dispatch. It validates the executable examples and checks for specification drift; it does not silently rewrite the repository or enable a recurring job. WebYore release maintainers export the contract from the main project before publishing and verify it against the production endpoint after deployment.

These are integration examples, not a full SDK. Use the complete specification for endpoint-specific validation, plan limits, scopes and response formats.
