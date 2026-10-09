export const noStore = { 'Cache-Control': 'no-store' };
export function fail(status: number, title: string, message: string) { return Response.json({ error: { title, message } }, { status, headers: noStore }); }
// This server is for the local user only. Two protections for the requests that change anything (upload, retry, delete):
//  1. the Host header must be a loopback name. A "DNS rebinding" page (evil.example re-pointed at 127.0.0.1) arrives with Host: evil.example and is refused.
//  2. a cross-origin Origin / cross-site fetch metadata is refused, so another website cannot make this server run jobs.
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/i;
export function sameOrigin(req: Request): boolean {
  const host = req.headers.get('host') || ''; if (!LOOPBACK.test(host)) return false;
  const origin = req.headers.get('origin'); if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  try { return new URL(origin).host === host; } catch { return false; }
}
