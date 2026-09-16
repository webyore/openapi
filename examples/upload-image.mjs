import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { client } from './client.mjs';
try {
  const file = process.argv[2], key = process.env.WEBYORE_IDEMPOTENCY_KEY;
  if (!file || !key) throw new Error('Pass an image path and set WEBYORE_IDEMPOTENCY_KEY');
  if ((await stat(file)).size > 10 * 1024 * 1024) throw new Error('Maximum source file size is 10 MiB');
  const contentType = process.argv[3] || ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.heic': 'image/heic', '.heif': 'image/heif' })[extname(file).toLowerCase()];
  if (!contentType) throw new Error('Pass the image MIME type as the second argument');
  // Raw bytes keep the request identical even if the CLI is restarted with the same key.
  const body = await readFile(file);
  const api = client();
  const accepted = await api.request('/images', { method: 'POST', key, body, contentType });
  console.error(`Image ID: ${accepted.id}`);
  const image = await api.waitForImage(accepted);
  console.log(image.url);
} catch (error) { console.error(error.message); process.exitCode = 1; }
