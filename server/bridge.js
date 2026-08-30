// Adapter: Web Fetch <-> Express.
//
// Next.js route handlers speak the Web platform (Request -> Response). Express
// speaks Node (IncomingMessage -> ServerResponse). This module bridges them in
// process — no extra TCP port, no second server, no CORS preflight — so the
// entire Express API can be served from the same deployment as the frontend.
//
// Why in-process instead of `app.listen(0)` + fetch:
//   - Vercel's serverless sandbox is not guaranteed to permit binding ports.
//   - An extra socket per request costs latency and leaves lingering handles
//     that interfere with container freeze/reuse.
const http = require('http');
const net = require('net');
const { createApp, initDb } = require('./app');

let app = null;

function getApp() {
  if (!app) app = createApp();
  return app;
}

/**
 * Build a Node IncomingMessage from a Web Request's parts.
 * Headers from the Fetch API are already lower-cased, which is what Node expects.
 */
function createIncomingMessage({ method, url, headers, body }) {
  // Dummy socket — Express/multer/audit logging read `remoteAddress` and
  // `encrypted`; nothing is ever actually written to it.
  const socket = new net.Socket();
  socket.remoteAddress = '127.0.0.1';
  socket.remotePort = 0;

  const req = new http.IncomingMessage(socket);
  req.method = method;
  req.url = url;
  req.httpVersion = '1.1';
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;
  req.headers = headers;
  req.rawHeaders = Object.entries(headers).flat();
  req.connection = socket;
  req.socket = socket;

  if (body && body.length) {
    req.headers['content-length'] = String(body.length);
    req.push(body);
  }
  req.push(null); // signal end-of-stream to body parsers (multer/busboy)

  return req;
}

/**
 * Drive an Express response into a captured { statusCode, headers, body }.
 *
 * We override `write`/`end` so nothing hits a real socket, and read status +
 * headers off the live ServerResponse at the moment `end()` fires. That keeps
 * Express's own header bookkeeping ([kOutHeaders]) authoritative.
 */
function runExpress(app, url, method, headers, body) {
  const nodeReq = createIncomingMessage({ method, url, headers, body });

  return new Promise((resolve, reject) => {
    const res = new http.ServerResponse(nodeReq);
    const chunks = [];

    let settled = false;
    const settleOnce = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    res.write = function write(chunk, encoding, callback) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      }
      if (typeof encoding === 'function') encoding();
      else if (typeof callback === 'function') callback();
      return true;
    };

    res.end = function end(chunk, encoding, callback) {
      if (typeof chunk === 'function') {
        callback = chunk;
        chunk = null;
      }
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      }
      if (typeof callback === 'function') callback();

      settleOnce({
        statusCode: res.statusCode || 200,
        statusMessage: res.statusMessage || '',
        headers: res.getHeaders(),
        body: Buffer.concat(chunks),
      });
      return res;
    };

    // Surface synchronous handler crashes as a 500 instead of hanging forever.
    res.on('error', reject);

    try {
      app(nodeReq, res);
    } catch (err) {
      reject(err);
    }
  });
}

const BODYLESS_STATUS = new Set([204, 205, 304]);

function toWebResponse({ statusCode, headers, body }) {
  const out = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => out.append(key, String(v)));
    } else {
      out.set(key, String(value));
    }
  }
  // Body was already decoded/collected — a stale content-length would corrupt it.
  out.delete('transfer-encoding');

  if (BODYLESS_STATUS.has(statusCode)) {
    return new Response(null, { status: statusCode, headers: out });
  }

  out.set('content-length', String(body.length));
  // Buffer -> Uint8Array view; Response accepts it and copies.
  return new Response(new Uint8Array(body), { status: statusCode, headers: out });
}

/**
 * Handle one Web Request through the Express app.
 *
 * @param {Request} request
 * @param {{ pathname: string }} ctx  path with the `/api` prefix already stripped
 *                                    by the caller (or the full path — both work).
 */
async function handleRequest(request, ctx) {
  // Storage must be warm before the first query. Memoised, so this is a no-op
  // after the first invocation in a warm container.
  await initDb();

  const incoming = new URL(request.url);
  const pathname = ctx && ctx.pathname ? ctx.pathname : incoming.pathname;
  const url = pathname + incoming.search;

  const headers = {};
  request.headers.forEach((value, key) => {
    // Fetch forbids setting a few hop-by-hop headers on a Response; harmless to
    // forward on the request side, but `host` must reflect the real host.
    headers[key] = value;
  });
  if (!headers.host) headers.host = incoming.host;

  let body = null;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const buf = await request.arrayBuffer();
    if (buf.byteLength) body = Buffer.from(buf);
  }

  const result = await runExpress(getApp(), url, request.method, headers, body);

  return toWebResponse(result);
}

module.exports = { handleRequest, getApp, initDb };
