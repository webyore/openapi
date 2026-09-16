import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const exec = promisify(execFile), root = fileURLToPath(new URL('../', import.meta.url));
const runtimes = [['JavaScript', process.execPath, ['examples/create-link.mjs']], ['Python', process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3'), ['examples/create-link.py']]];
if (process.env.PHP_BIN || process.platform !== 'win32') runtimes.push(['PHP', process.env.PHP_BIN || 'php', ['examples/create-link.php']]);
if (process.env.BASH_BIN || process.platform !== 'win32') runtimes.push(['cURL', process.env.BASH_BIN || 'bash', ['examples/create-link.sh']]);
for (const [name, command, args] of runtimes) test(`${name}: executable example retries 503 and fails on 401`, async () => {
  const calls = []; let status = 503;
  const server = createServer(async (req,res) => {
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    calls.push({url:req.url,authorization:req.headers.authorization,key:req.headers['idempotency-key'],body:Buffer.concat(chunks).toString()});
    res.writeHead(status, {'content-type':'application/json','retry-after':'0'});
    res.end(JSON.stringify(status===201?{data:{short_url:'https://webyore.com/example'}}:{error:{code:status===401?'unauthorized':'unavailable'}}));
    if(status===503)status=201;
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const env={...process.env,WEBYORE_API_KEY:'test-only',WEBYORE_IDEMPOTENCY_KEY:'request-example-123',WEBYORE_API_BASE:`http://127.0.0.1:${server.address().port}/v1`};
  try {
    const result=await exec(command,args,{cwd:root,env,timeout:20000,windowsHide:true});
    assert.match(result.stdout,/https:\/\/webyore.com\/example/);assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].authorization,'Bearer test-only');assert.equal(calls[0].key,'request-example-123');assert.equal(JSON.parse(calls[0].body).url,'https://example.com/article');
    calls.length=0;status=401;
    await assert.rejects(exec(command,args,{cwd:root,env,timeout:20000,windowsHide:true}));assert.equal(calls.length,1);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('image CLI retries identical raw bytes, then polls 202 to ready', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webyore-example-')), file = join(dir, 'mock.jpg');
  const bytes = Buffer.from([255,216,255,217]); await writeFile(file, bytes);
  const calls = []; let uploads = 0;
  const server = createServer(async (req, res) => {
    const chunks=[];for await(const c of req)chunks.push(c);
    calls.push({ path:req.url, method:req.method, key:req.headers['idempotency-key'], mime:req.headers['content-type'], body:Buffer.concat(chunks) });
    if(req.method==='POST' && uploads++===0) {
      res.writeHead(503,{'retry-after':'0','content-type':'application/json'});res.end(JSON.stringify({error:{code:'unavailable'}}));return;
    }
    res.writeHead(req.method==='POST'?202:200,{'content-type':'application/json'});
    res.end(JSON.stringify({data:{id:'example1',status:req.method==='POST'?'processing':'ready',url:req.method==='POST'?null:'https://i.webyore.com/example1.webp'}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const result=await exec(process.execPath,['examples/upload-image.mjs',file],{cwd:root,env:{...process.env,WEBYORE_API_KEY:'test-only',WEBYORE_IDEMPOTENCY_KEY:'image-example-123',WEBYORE_API_BASE:`http://127.0.0.1:${server.address().port}/v1`},timeout:20000,windowsHide:true});
    assert.match(result.stdout,/example1.webp/);assert.equal(calls.length,3);assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].mime,'image/jpeg');assert.deepEqual(calls[0].body,bytes);assert.equal(calls[2].method,'GET');assert.equal(calls[2].path,'/v1/images/example1');
  } finally {
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await unlink(file);await rmdir(dir);
  }
});
