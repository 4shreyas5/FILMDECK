import fs from 'fs'; import path from 'path';
import { fail, sameOrigin, noStore } from '@/lib/http';
import { engine, submit, queueFull, listSamples, findFixture, liveAvailable, SAMPLE_DIR, UPLOAD_TYPES, MAX_UPLOAD_BYTES } from '@/lib/jobs';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

const NO_FIXTURE = (n: string) => `This local version uses prepared storyboards, so it can only build decks for its built-in sample documents (it has none for "${n}"). Pick a sample below, or upload one of the files in tests/corpus/docs. Live AI planning for any document arrives in a later version.`;

// Cheap content sniffing so a renamed file is refused before anything parses it.
function looksRight(ext: string, b: Buffer): boolean {
  if (ext === 'pptx' || ext === 'docx') return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
  if (ext === 'pdf') return b.subarray(0, 1024).includes('%PDF-');
  return !b.subarray(0, 8192).includes(0); // md, txt: no NUL bytes
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'Request refused', 'This request came from another website.');
  const lenHeader = req.headers.get('content-length');
  if (!lenHeader || !/^\d+$/.test(lenHeader)) return fail(411, 'Length required', 'The upload must state its size. Please use the FilmDeck page.'); // a body of unknown size could be buffered without limit
  const len = Number(lenHeader);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return fail(413, 'File too large', `Files can be up to ${MAX_UPLOAD_BYTES / 1048576} MB.`);
  let form: FormData; try { form = await req.formData(); } catch { return fail(400, 'Upload not understood', 'Please choose a file and try again.'); }
  const qa = String(form.get('qa') || 'fast'); if (qa !== 'fast' && qa !== 'full') return fail(400, 'Invalid option', 'Quality check must be "fast" or "full".');
  const mode = String(form.get('mode') || 'mock'); if (mode !== 'mock' && mode !== 'live') return fail(400, 'Invalid option', 'Mode must be "mock" or "live".');
  // No silent fallback: asking for live without a configured key is refused, never turned into a mock run.
  if (mode === 'live' && !liveAvailable()) return fail(400, "Live generation isn't configured", "Live generation isn't configured on this machine. Choose Mock mode, or ask whoever runs this server to set it up.");
  const sample = form.get('sample'); const file = form.get('file');
  let original: string, bytes: Buffer;
  if (typeof sample === 'string' && sample) {
    const s = listSamples().find(x => x.file === sample); // exact match against the allowlist: no path ever comes from the client
    if (!s) return fail(400, 'Unknown sample', 'That sample document does not exist.');
    original = s.file; bytes = fs.readFileSync(path.join(SAMPLE_DIR, s.file));
  } else if (file instanceof File) {
    if (file.size === 0) return fail(400, 'Empty file', 'That file is empty.');
    if (file.size > MAX_UPLOAD_BYTES) return fail(413, 'File too large', `Files can be up to ${MAX_UPLOAD_BYTES / 1048576} MB.`);
    original = (file.name || '').slice(0, 255); bytes = Buffer.from(await file.arrayBuffer());
  } else return fail(400, 'No file', 'Please choose a document to upload.');

  const ext = path.extname(original.replace(/\\/g, '/')).slice(1).toLowerCase();
  if (!UPLOAD_TYPES.includes(ext)) return fail(415, 'Unsupported file type', `FilmDeck reads ${UPLOAD_TYPES.map(t => '.' + t).join(', ')} files. Old .ppt/.doc files should be saved as .pptx/.docx first.`);
  if (!looksRight(ext, bytes)) return fail(415, 'File does not match its type', `This file is named .${ext} but its content is not a real ${ext.toUpperCase()} document.`);
  const eng = await engine(); const name = eng.projectName(original); // lowercase ASCII letters, digits and dashes only
  if (mode === 'mock' && !findFixture(name)) return fail(422, 'No prepared deck plan for this document', NO_FIXTURE(path.basename(original.replace(/\\/g, '/')).slice(0, 80)));
  if (queueFull()) return fail(429, 'Busy', 'Several decks are already waiting. Try again in a few minutes.');

  const job = submit({ name, ext, bytes, qaMode: qa, mode, sample: typeof sample === 'string' && sample ? sample : null }); // the client's file name is never used as a path
  return Response.json({ id: job.id }, { status: 202, headers: noStore });
}
