import { client } from './client.mjs';
try {
  const key = process.env.WEBYORE_IDEMPOTENCY_KEY;
  if (!key) throw new Error('Set WEBYORE_IDEMPOTENCY_KEY; reuse it only for retries of this request');
  const data = await client().request('/links', { method: 'POST', key, body: JSON.stringify({ url: process.argv[2] || 'https://example.com/article' }) });
  if (!data.short_url) throw new Error('Response has no short_url');
  console.log(data.short_url);
} catch (error) { console.error(error.message); process.exitCode = 1; }
