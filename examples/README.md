# WebYore API examples

See the [integration guide](../README.md) for prerequisites, API scopes and commands.

- `create-link.sh`: cURL with transient retries.
- `create-link.mjs`: Node.js with a shared API client.
- `create-link.py`: Python standard library.
- `create-link.php`: PHP with ext-curl.
- `upload-image.mjs`: Node.js raw image upload and status polling.

Set credentials in environment variables. The scripts create resources when pointed at production. Automated tests use a local mock server.
