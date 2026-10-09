import { listSamples } from '@/lib/jobs'; import { noStore } from '@/lib/http';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET() { return Response.json({ samples: listSamples() }, { headers: noStore }); }
