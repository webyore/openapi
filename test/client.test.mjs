import assert from 'node:assert/strict';
import test from 'node:test';
import { client } from '../examples/client.mjs';
const response = (status, data, headers = {}) => new Response(JSON.stringify(status < 300 ? { data } : { error: { code: data } }), { status, headers });

test('retries preserve the exact mutation and idempotency key, respecting Retry-After', async () => {
  const calls = [], waits = [], sequence = [response(503, 'unavailable', { 'retry-after': '2' }), response(409, 'idempotency_in_progress'), response(201, { short_url: 'https://webyore.com/example' })];
  const api = client({ apiKey: 'test-only', wait: async ms => waits.push(ms), fetchImpl: async (url, init) => { calls.push({ url, body: init.body, headers: init.headers, redirect: init.redirect }); return sequence.shift(); } });
  assert.equal((await api.request('/links', { method: 'POST', key: 'same-request-123', body: '{"url":"https://example.com"}' })).short_url, 'https://webyore.com/example');
  assert.equal(calls.length, 3); assert.deepEqual(calls[0], calls[1]); assert.deepEqual(calls[1], calls[2]); assert.deepEqual(waits, [2000, 2000]); assert.equal(calls[0].redirect, 'error');
});
test('conflicts and authentication failures do not retry', async () => {
  for (const [status, code] of [[401, 'unauthorized'], [409, 'idempotency_conflict']]) {
    let count = 0;
    const api = client({ apiKey: 'test-only', fetchImpl: async () => { count++; return response(status, code); } });
    await assert.rejects(api.request('/links', { method: 'POST', key: 'request-123', body: '{}' }), new RegExp(code)); assert.equal(count, 1);
  }
});
test('polls processing images until ready without reposting and ignores external status URLs', async () => {
  const urls = [];
  const api = client({ apiKey: 'test-only', wait: async () => {}, fetchImpl: async (url, init) => { urls.push(url); assert.equal(init.method, 'GET'); return response(200, { id: 'example1', status: 'ready', url: 'https://i.webyore.com/example1.webp' }); } });
  const image = await api.waitForImage({ id: 'example1', status: 'processing', status_url: 'https://untrusted.invalid/' });
  assert.equal(image.url, 'https://i.webyore.com/example1.webp'); assert.deepEqual(urls, ['https://api.webyore.com/v1/images/example1']);
  await assert.rejects(api.waitForImage({ id: 'example1', status: 'failed', failure_code: 'image_format_rejected' }), /image_format_rejected/);
  await assert.rejects(api.waitForImage({ id: 'example1', status: 'processing' }, { maxPolls: 0 }), /do not upload it again/);
});
test('network and truncated-body errors retry with bounded attempts', async () => {
  let count = 0;
  const api = client({ apiKey: 'test-only', wait: async () => {}, fetchImpl: async () => { count++; if(count === 1)throw new Error('network');if(count===2)return { text: async () => {throw new Error('truncated');} };return response(201,{short_url:'ok'}); } });
  assert.equal((await api.request('/links', { method: 'POST', key: 'request-123', body: '{}' })).short_url,'ok');assert.equal(count,3);
  const bad = client({ apiKey: 'test-only', wait: async () => {}, fetchImpl: async () => { throw new Error('network'); } });
  await assert.rejects(bad.request('/links',{method:'POST',key:'request-123',body:'{}'}),/same idempotency key/);
});
