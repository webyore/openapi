# WebYore example tests

Run `npm test` from the repository root. These tests use local mock responses and do not require a WebYore account or API key. They check exact request replay, transient errors, authentication failures, and asynchronous image completion.

CI runs all four language examples on Linux. On Windows, optional `PHP_BIN`, `BASH_BIN`, and `PYTHON_BIN` environment variables select installed runtimes.
