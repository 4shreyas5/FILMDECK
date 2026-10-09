import { liveAvailable, liveModel } from '@/lib/jobs'; import { noStore } from '@/lib/http';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
// Tells the page whether live generation is configured on the server. Booleans and the model name only: never the key.
export async function GET() { return Response.json({ live: { available: liveAvailable(), model: liveAvailable() ? await liveModel() : null } }, { headers: noStore }); }
