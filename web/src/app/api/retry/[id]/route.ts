import { fail, noStore, sameOrigin } from '@/lib/http'; import { retryJob } from '@/lib/jobs';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
// "Try again" after a failed job: a new job from the same stored upload with the same options. Never automatic; same-origin only.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'Request refused', 'This request came from another website.');
  const { id } = await ctx.params, r = retryJob(id);
  if (r === 'not-found') return fail(404, 'Not found', 'This job does not exist. The server may have been restarted.');
  if (r === 'not-failed') return fail(409, 'Nothing to retry', 'Only a failed job can be retried.');
  if (r === 'no-upload') return fail(410, 'Document no longer available', 'The uploaded file is gone. Please upload it again.');
  if (r === 'busy') return fail(429, 'Busy', 'Several decks are already waiting. Try again in a few minutes.');
  return Response.json({ id: r.id }, { status: 202, headers: noStore });
}
