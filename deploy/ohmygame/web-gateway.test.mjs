import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGateway } from './web-gateway.mjs';

test('protected gateway authenticates, strips credentials and limits preview access', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ohmygame-gateway-'));
  await writeFile(path.join(root, 'index.html'), '<h1>studio</h1>');
  const daemon = http.createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer daemon-private');
    assert.equal(req.headers.cookie, undefined);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ uri: req.url }));
  });
  await new Promise((resolve) => daemon.listen(0, '127.0.0.1', resolve));
  const daemonPort = daemon.address().port;
  const hosts = new Set();
  const gateway = createGateway({ rendererDirectory: root, accessKey: 'a-strong-secret-key-with-32-bytes', daemonToken: 'daemon-private', daemonPort, allowedHosts: hosts });
  await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  const host = `127.0.0.1:${gateway.address().port}`, base = `http://${host}`; hosts.add(host);
  try {
    assert.equal((await fetch(`${base}/api/projects`)).status, 401);
    assert.match(await (await fetch(base)).text(), /工作区访问密钥/);
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/login`, { method: 'POST', headers: { origin: 'https://evil.example' }, body: 'key=a-strong-secret-key-with-32-bytes' })).status, 403);
    assert.equal((await fetch(`${base}/login`, { method: 'POST', body: 'key=wrong' })).status, 401);
    const login = await fetch(`${base}/login`, { method: 'POST', body: 'key=a-strong-secret-key-with-32-bytes', redirect: 'manual' });
    assert.equal(login.status, 303);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal(await (await fetch(base, { headers: { cookie } })).text(), '<h1>studio</h1>');
    const api = await fetch(`${base}/api/projects?x=1`, { headers: { cookie, authorization: 'Bearer attacker' } });
    assert.deepEqual(await api.json(), { uri: '/projects?x=1' });
    assert.equal((await fetch(`${base}/api/projects`, { method: 'POST', headers: { cookie, origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(`${base}/preview/${daemonPort}/health`, { headers: { cookie } })).status, 404);
    assert.equal((await fetch(`${base}/api/projects`, { headers: { cookie: `${cookie}tampered` } })).status, 401);
    assert.equal((await fetch(`${base}/assets/missing.js`, { headers: { cookie } })).status, 404);
    const invalidHost = await new Promise((resolve, reject) => {
      const request = http.get(`${base}/api/projects`, { headers: { host: 'evil.example', cookie } }, (response) => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject);
    });
    assert.equal(invalidHost, 403);
  } finally {
    gateway.closeAllConnections(); daemon.closeAllConnections();
    await Promise.all([new Promise((resolve) => gateway.close(resolve)), new Promise((resolve) => daemon.close(resolve))]);
    await rm(root, { recursive: true, force: true });
  }
});
