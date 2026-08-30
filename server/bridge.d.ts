// Type surface for server/bridge.js (the project compiles with allowJs:false,
// so the CommonJS adapter needs an ambient declaration to be importable from
// TypeScript route handlers).
export interface BridgeContext {
  /** Path with the `/api` prefix, e.g. `/api/profile`. */
  pathname: string;
}

export function handleRequest(request: Request, ctx: BridgeContext): Promise<Response>;
export function getApp(): unknown;
export function initDb(): Promise<unknown>;
