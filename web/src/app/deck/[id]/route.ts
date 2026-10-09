// Serves a finished deck. Only the one index.html of a finished job, selected by a 32-hex id; the response carries a CSP that lets the deck run its
// own inline script and styles and nothing else (no network, no framing by other sites), and a sandbox so the deck never shares this app's origin.
import fs from 'fs'; import path from 'path';
import { getJob, deckDir } from '@/lib/jobs';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; media-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts allow-downloads";
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params; const job = getJob(id);
  const plain = (s: number, m: string) => new Response(m, { status: s, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!job) return plain(404, 'Deck not found.');
  if (job.state !== 'done') return plain(409, 'This deck is not ready.');
  let html: Buffer; try {
    const file = fs.realpathSync(path.join(deckDir(job), 'index.html')), base = fs.realpathSync(job.dir); // a symlink must not lead outside this job's folder
    if (!file.startsWith(base + path.sep)) return plain(404, 'Deck file is missing.');
    html = fs.readFileSync(file);
  } catch { return plain(404, 'Deck file is missing.'); }
  const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' };
  if (new URL(req.url).searchParams.get('download') === '1') headers['Content-Disposition'] = `attachment; filename="filmdeck-${job.displayName.replace(/\.[^.]*$/, '').replace(/[^a-z0-9-]/g, '')}.html"`;
  return new Response(new Uint8Array(html), { headers });
}
