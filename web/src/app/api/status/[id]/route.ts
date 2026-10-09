import { fail, noStore, sameOrigin } from '@/lib/http'; import { getJob, publicJob, deleteJob } from '@/lib/jobs';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params; const job = getJob(id);
  if (!job) return fail(404, 'Not found', 'This job does not exist. The server may have been restarted.');
  return Response.json(publicJob(job), { headers: noStore });
}

// Remove a finished job's files (the uploaded document, its normalised text, the deck). Same-origin only.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'Request refused', 'This request came from another website.');
  const { id } = await ctx.params, r = deleteJob(id);
  if (r === 'not-found') return fail(404, 'Not found', 'This job does not exist.'); if (r === 'active') return fail(409, 'Still running', 'Wait for the job to finish before deleting it.');
  return Response.json({ ok: true }, { headers: noStore });
}
