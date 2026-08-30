import { handleRequest } from '../../../server/bridge';

// The API must run in the Node.js runtime: it depends on Node streams (multer /
// busboy), the filesystem, and native modules.
export const runtime = 'nodejs';

// Every request is user-specific and must hit Express live — never cached,
// never statically optimized.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type RouteContext = { params: Promise<{ path?: string[] }> };

/**
 * Catch-all API handler.
 *
 * This is what finally makes the API reachable in production. Previously the
 * Express server only ran as a separate process on localhost:4000, which does
 * not exist on Vercel — so `NEXT_PUBLIC_API_URL` fell back to
 * `http://localhost:4000/api` in the browser and every data call silently hit
 * the visitor's own machine. Mounting the same Express app here puts the API on
 * the deployment's own origin.
 */
async function handler(request: Request, ctx: RouteContext): Promise<Response> {
  const { path } = await ctx.params;
  const segments = Array.isArray(path) ? path : [];
  const pathname = `/api/${segments.join('/')}`;

  return handleRequest(request, { pathname });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
