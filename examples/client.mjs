import { setTimeout as sleep } from 'node:timers/promises';

export function client({ apiKey = process.env.WEBYORE_API_KEY, baseUrl = process.env.WEBYORE_API_BASE || 'https://api.webyore.com/v1', fetchImpl = fetch, wait = sleep } = {}) {
  if (!apiKey) throw new Error('Set WEBYORE_API_KEY');
  const base = new URL(baseUrl);
  if (base.username || base.password || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)))) throw new Error('Use HTTPS, or HTTP on localhost for tests');
  async function request(path, { method = 'GET', body, key, contentType = typeof body === 'string' ? 'application/json' : undefined } = {}) {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('\\')) throw new Error('Expected an API-relative path');
    if (method !== 'GET' && !key) throw new Error('Supply a stable idempotency key for mutations');
    for (let attempt = 0; attempt < 4; attempt++) {
      let response;
      try {
        response = await fetchImpl(base.href.replace(/\/$/, '') + path, {
          method, redirect: 'error', signal: AbortSignal.timeout(30_000),
          headers: { Authorization: `Bearer ${apiKey}`, ...(key ? { 'Idempotency-Key': key } : {}), ...(contentType ? { 'Content-Type': contentType } : {}) }, body,
        });
      } catch {
        if (attempt === 3) throw new Error('Network failure; the result may be unknown. Retry the same request with the same idempotency key.');
        await wait(1000 * 2 ** attempt); continue;
      }
      // A connection can also fail while reading a successful response body.
      let raw;
      try { raw = await response.text(); }
      catch {
        if (attempt === 3) throw new Error('Incomplete response; retry with the same idempotency key.');
        await wait(1000 * 2 ** attempt); continue;
      }
      let result; try { result = JSON.parse(raw); } catch { result = null; }
      if (response.ok) {
        if (!result?.data) throw new Error('Invalid API response; keep the idempotency key when retrying.');
        return result.data;
      }
      const code = result?.error?.code ?? 'request_failed';
      const retryable = [408, 429, 500, 502, 503, 504].includes(response.status) || (response.status === 409 && code === 'idempotency_in_progress');
      if (!retryable || attempt === 3) throw new Error(`WebYore HTTP ${response.status}: ${code}`);
      const value = response.headers.get('retry-after');
      const seconds = value && /^\d+$/.test(value) ? Number(value) : value ? (Date.parse(value) - Date.now()) / 1000 : NaN;
      if (seconds > 60) throw new Error(`Retry later as requested by Retry-After (${value}), using the same idempotency key.`);
      await wait(Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 1000 * 2 ** attempt);
    }
  }
  async function waitForImage(image, { maxPolls = 60, intervalMs = 2000 } = {}) {
    for (let n = 0; n <= maxPolls; n++) {
      if (image.status === 'ready' && image.url) return image;
      if (['failed', 'deleted'].includes(image.status)) throw new Error(`Image ${image.id}: ${image.status} (${image.failure_code ?? 'no code'})`);
      if (image.status !== 'processing') throw new Error('Unexpected image state');
      if (n === maxPolls) break;
      await wait(intervalMs);
      // Construct the path locally: never forward credentials to a returned external URL.
      image = await request(`/images/${encodeURIComponent(image.id)}`);
    }
    throw new Error(`Image ${image.id} is still processing. Resume GET /images/${image.id}; do not upload it again.`);
  }
  return { request, waitForImage };
}
