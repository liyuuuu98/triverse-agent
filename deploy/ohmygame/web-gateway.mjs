import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHmac, timingSafeEqual } from 'node:crypto';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
const LOGIN = `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OhMyGame 登录</title><style>body{background:#121212;color:#eee;font:16px system-ui;display:grid;place-items:center;min-height:95vh}form{width:300px;padding:32px;background:#202020;border-radius:16px}input,button{box-sizing:border-box;width:100%;padding:12px;margin-top:16px;border-radius:8px;border:1px solid #555}button{background:#7654da;color:white;cursor:pointer}</style><form method="post" action="/login"><h1>OhMyGame</h1><p>输入工作区访问密钥</p><input name="key" type="password" autocomplete="current-password" required><button>进入工作区</button></form></html>`;
const equal = (a, b) => { const x = Buffer.from(a ?? ''), y = Buffer.from(b ?? ''); return x.length === y.length && timingSafeEqual(x, y); };
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

export function createGateway({ rendererDirectory, accessKey, daemonToken, daemonPort = 43110, allowedHosts, previewPorts = () => new Set() }) {
  if (!accessKey || accessKey.length < 24 || !daemonToken) throw new Error('Gateway requires strong credentials');
  const root = path.resolve(rendererDirectory), attempts = new Map();
  const sign = (value) => createHmac('sha256', accessKey).update(value).digest('hex');
  const cookie = (req) => { const value = /(?:^|;\s*)ohmygame_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? ''; const [expiry, signature] = value.split('.'); return /^\d+$/.test(expiry ?? '') && Number(expiry) > Date.now() && Number(expiry) <= Date.now() + 8 * 3600_000 && equal(signature, sign(expiry)); };
  const hostAllowed = (req) => allowedHosts.has(req.headers.host);
  const sameOrigin = (req) => !req.headers.origin || req.headers.origin === `http://${req.headers.host}` || req.headers.origin === `https://${req.headers.host}`;
  const fail = (res, status, message) => { res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end(message); };
  const target = async (req) => {
    const url = new URL(req.url, 'http://gateway');
    if (url.pathname.startsWith('/api/')) return { port: daemonPort, uri: `${url.pathname.slice(4)}${url.search}`, api: true };
    const match = /^\/preview\/(\d+)\//.exec(url.pathname);
    if (match && (await previewPorts()).has(Number(match[1]))) return { port: Number(match[1]), uri: `${url.pathname}${url.search}`, api: false };
  };
  const headers = (req, api) => { const result = Object.fromEntries(Object.entries(req.headers).filter(([key]) => !HOP.has(key) && !['authorization', 'cookie', 'host'].includes(key))); result.host = `127.0.0.1:${daemonPort}`; if (api) result.authorization = `Bearer ${daemonToken}`; return result; };
  const server = http.createServer(async (req, res) => {
    try {
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('referrer-policy', 'same-origin');
      if (!hostAllowed(req)) return fail(res, 403, 'Host not allowed');
      if (req.url === '/health' && req.method === 'GET') { res.setHeader('content-type', 'application/json'); res.end('{"status":"ok"}'); return; }
      if (!sameOrigin(req)) return fail(res, 403, 'Origin not allowed');
      if (req.url === '/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress, now = Date.now();
        // Bound the rate-limit map; expired entries cannot retain memory indefinitely.
        for (const [address, item] of attempts) if (item.until < now) attempts.delete(address);
        const item = attempts.get(ip) ?? { count: 0, until: now + 60_000 };
        if (item.count >= 10 || attempts.size > 10_000) return fail(res, 429, '请稍后再试');
        item.count++; attempts.set(ip, item);
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) return fail(res, 413, 'Request too large'); }
        if (!equal(new URLSearchParams(body).get('key'), accessKey)) return fail(res, 401, '访问密钥不正确');
        attempts.delete(ip);
        const expiry = String(Date.now() + 8 * 3600_000);
        res.writeHead(303, { location: '/', 'set-cookie': `ohmygame_session=${expiry}.${sign(expiry)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${req.socket.encrypted ? '; Secure' : ''}`, 'cache-control': 'no-store' }); res.end(); return;
      }
      if (!cookie(req)) {
        if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/preview/')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(LOGIN); return; }
        return fail(res, 401, 'Unauthorized');
      }
      const upstream = await target(req);
      if (upstream) {
        const proxy = http.request({ hostname: '127.0.0.1', port: upstream.port, path: upstream.uri, method: req.method, headers: headers(req, upstream.api) }, (incoming) => {
          const responseHeaders = Object.fromEntries(Object.entries(incoming.headers).filter(([key]) => !HOP.has(key) && key !== 'set-cookie'));
          res.writeHead(incoming.statusCode ?? 502, responseHeaders); incoming.pipe(res);
          res.on('close', () => incoming.destroy());
        });
        proxy.on('error', () => { if (!res.headersSent) fail(res, 502, 'Upstream unavailable'); else res.destroy(); });
        req.on('aborted', () => proxy.destroy()); res.on('close', () => proxy.destroy()); req.pipe(proxy); return;
      }
      if (req.url.startsWith('/preview/') || req.url.startsWith('/api/')) return fail(res, 404, 'Not found');
      if (!['GET', 'HEAD'].includes(req.method)) return fail(res, 405, 'Method not allowed');
      const pathname = decodeURIComponent(new URL(req.url, 'http://gateway').pathname);
      let file = path.resolve(root, `.${pathname}`);
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) return fail(res, 403, 'Forbidden');
      let info = await stat(file).catch(() => undefined);
      if (!info?.isFile()) { if (path.extname(pathname)) return fail(res, 404, 'Not found'); file = path.join(root, 'index.html'); info = await stat(file); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'content-length': info.size, 'cache-control': file.endsWith('.html') ? 'no-cache' : 'private, max-age=3600' });
      if (req.method === 'HEAD') res.end(); else createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { if (!res.headersSent) fail(res, 500, 'Request failed'); else res.destroy(); }
  });
  server.on('upgrade', async (req, socket, head) => {
    if (!hostAllowed(req) || !sameOrigin(req) || !cookie(req)) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    let upstream;
    try { upstream = await target(req); } catch { socket.destroy(); return; }
    if (!hostAllowed(req) || !sameOrigin(req) || !cookie(req) || !upstream || upstream.api) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    const remote = net.connect(upstream.port, '127.0.0.1', () => {
      const requestHeaders = { ...headers(req, false), host: req.headers.host, connection: 'Upgrade', upgrade: 'websocket' };
      remote.write(`${req.method} ${upstream.uri} HTTP/1.1\r\n${Object.entries(requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
      if (head.length) remote.write(head); socket.pipe(remote).pipe(socket);
    });
    remote.on('error', () => socket.destroy()); socket.on('error', () => remote.destroy()); socket.on('close', () => remote.destroy()); remote.on('close', () => socket.destroy());
  });
  return server;
}
