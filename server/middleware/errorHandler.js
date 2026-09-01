// Express error-handler middleware.
//
// The previous behaviour was that any uncaught exception in a controller or
// middleware fell through to Express's built-in error handler, which writes a
// generic HTML page — that's the page the customer saw in /customer/documents
// instead of a JSON `{ success: false, error: ... }` body. Browsers then
// bubble that HTML through `fetch().text()` and the alert shows the raw
// markup.
//
// This middleware normalises the response to JSON so the front-end can
// cleanly branch on `error` rather than scraping HTML.
const STATUS_BY_CODE = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED: 415,
};

/**
 * Best-effort mapping from a thrown error to an HTTP status code.
 * Defaults to 500 (Internal Server Error) — never reveal internal details
 * beyond the message.
 */
function classifyError(err) {
  if (!err) return 500;

  // Multer errors carry a `.code` (LIMIT_FILE_SIZE, LIMIT_UNEXPECTED_FILE, etc.)
  if (err.code && /^LIMIT_/.test(err.code)) {
    if (err.code === 'LIMIT_FILE_SIZE') return 413;
    return 400;
  }
  if (err.name === 'MulterError') return 400;

  // JSON parse failures from express.json() arrive as SyntaxError with 400.
  if (err.type === 'entity.parse.failed') return 400;

  // Common auth / shape markers.
  if (err.name === 'UnauthorizedError' || /unauthori[sz]ed/i.test(err.message || '')) return 401;
  if (/forbidden|not allowed|access denied/i.test(err.message || '')) return 403;
  if (/not found/i.test(err.message || '')) return 404;
  if (/file too large|too large|payload too large/i.test(err.message || '')) return 413;
  if (/unsupported file type|unsupported mime/i.test(err.message || '')) return 415;

  return 500;
}

/**
 * Express error-handling middleware. Always responds with JSON.
 *
 * IMPORTANT: this is `function (err, req, res, next)` (4 args) so Express
 * recognises it as an error handler. Do not convert to an arrow with default
 * args — Express routes on `.length`.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status =
    typeof err?.status === 'number' && err.status >= 400 && err.status < 600
      ? err.status
      : typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : classifyError(err);

  const message =
    typeof err?.message === 'string' && err.message.length
      ? err.message
      : status >= 500
        ? 'Internal server error'
        : 'Request failed';

  // Log only server-side detail for 5xx — 4xx is the client's problem.
  if (status >= 500) {
    console.error('[api] unhandled error:', err);
  } else {
    console.warn('[api] client error:', status, message);
  }

  // Always set Content-Type BEFORE sending, otherwise a thrown JSON.stringify
  // downstream race could leak HTML.
  try {
    if (!res.headersSent) {
      res.status(status).json({ success: false, error: message });
    }
  } catch (writeErr) {
    // Last-ditch: ensure we don't leak HTML even if the response was already
    // committed or the body writer threw.
    try { res.end(JSON.stringify({ success: false, error: 'Internal server error' })); } catch {}
    console.error('[api] failed to write JSON error response:', writeErr);
  }
}

module.exports = {
  errorHandler,
  classifyError,
  STATUS_BY_CODE,
};
