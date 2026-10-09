// In-process job registry for the local web app. One FilmDeck run at a time (the browser QA is CPU heavy), a small FIFO queue behind it,
// progress taken from the real onEvent stream of runFilmDeck(). State lives in memory: restarting the server forgets all jobs.
import fs from 'fs'; import path from 'path'; import crypto from 'crypto'; import { pathToFileURL } from 'url';

export const REPO_ROOT = path.resolve(process.env.FILMDECK_ROOT || path.join(/*turbopackIgnore: true*/ process.cwd(), '..'));
export const DATA_DIR = path.join(REPO_ROOT, 'generated', 'web');
export const ID_RE = /^[a-f0-9]{32}$/;
export type StepId = 'upload' | 'ingest' | 'chunk' | 'analyze' | 'storyboard' | 'validate' | 'generate' | 'qa' | 'ready';
export type Step = { id: StepId; label: string };
export type Mode = 'mock' | 'live';
// Mock keeps its original wording. Live adds the "Understanding the story" step (the AI reads the document) and plain-language labels.
export const STEPS_MOCK: Step[] = [
  { id: 'upload', label: 'Document received' }, { id: 'ingest', label: 'Reading the document' }, { id: 'chunk', label: 'Splitting into chunks' },
  { id: 'storyboard', label: 'Planning the storyboard' }, { id: 'validate', label: 'Checking numbers and sources' },
  { id: 'generate', label: 'Building the deck' }, { id: 'qa', label: 'Testing it in a real browser' }, { id: 'ready', label: 'Deck ready' },
];
export const STEPS_LIVE: Step[] = [
  { id: 'upload', label: 'Document received' }, { id: 'ingest', label: 'Reading your document' }, { id: 'chunk', label: 'Preparing the text' },
  { id: 'analyze', label: 'Understanding the story' }, { id: 'storyboard', label: 'Designing scenes' }, { id: 'validate', label: 'Checking the facts' },
  { id: 'generate', label: 'Building the film' }, { id: 'qa', label: 'Running final checks' }, { id: 'ready', label: 'Presentation ready' },
];
export const stepsFor = (m: Mode) => (m === 'live' ? STEPS_LIVE : STEPS_MOCK);
export type JobEvent = { t: number; type: string; message: string };
export type JobState = 'queued' | 'running' | 'done' | 'failed';
export type Job = {
  id: string; state: JobState; displayName: string; sourceType: string; qaMode: 'fast' | 'full'; mode: Mode; sample: string | null;
  createdAt: number; startedAt?: number; finishedAt?: number; events: JobEvent[]; completed: StepId[]; note?: string; steps: Step[];
  error?: { title: string; message: string; detail: string };
  result?: { status: string; scenes: number; beats: number; recipes: string[]; qa: unknown; warnings: string[]; timingsMs: Record<string, number>; totalMs: number; fictional: boolean; generation: { mode: Mode; model: string | null; strategy: string | null; calls: number | null; repairs: number | null; chunks: number | null; aiMs: number | null } };
};
type Internal = Job & { dir: string };
type Engine = { runFilmDeck: (o: Record<string, unknown>) => Promise<any>; projectName: (f: string) => string; LIVE_ERRORS: Record<string, [string, string]>; NO_KEY_MESSAGE: string };

type Store = { jobs: Map<string, Internal>; queue: string[]; running: boolean; swept: boolean };
const g = globalThis as unknown as { __filmdeckJobs?: Store };
const store: Store = (g.__filmdeckJobs ||= { jobs: new Map(), queue: [], running: false, swept: false });
// Limits are fixed in code; the queue length can only be lowered/raised by the server owner (never by a request), within 1..20.
export const MAX_QUEUED = Math.min(20, Math.max(1, Number(process.env.FILMDECK_MAX_QUEUED) || 5)), MAX_KEPT = 20;

export async function engine(): Promise<Engine> {
  const href = pathToFileURL(path.join(REPO_ROOT, 'tools/lib/filmdeck.mjs')).href;
  return await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ href);
}

// Jobs of an earlier server run are unreachable (the registry is in memory), so their folders are orphans. Only folders named like job ids are touched.
function sweepOrphans() {
  if (store.swept) return; store.swept = true;
  try { for (const f of fs.readdirSync(DATA_DIR)) if (ID_RE.test(f)) fs.rmSync(path.join(DATA_DIR, f), { recursive: true, force: true }); } catch { /* no data dir yet */ }
}

export function newJob(init: { displayName: string; sourceType: string; qaMode: 'fast' | 'full'; sample: string | null; mode: Mode }): Internal {
  sweepOrphans();
  const id = crypto.randomBytes(16).toString('hex'), dir = path.join(DATA_DIR, id);
  fs.mkdirSync(path.join(dir, 'upload'), { recursive: true });
  const job: Internal = { id, state: 'queued', createdAt: Date.now(), events: [], completed: ['upload'], dir, steps: stepsFor(init.mode), ...init };
  store.jobs.set(id, job); return job;
}
export const getJob = (id: string): Internal | null => (ID_RE.test(id) ? store.jobs.get(id) || null : null);
// The queue array holds the running job first, then the waiting ones. MAX_QUEUED counts only the WAITING jobs.
export const waitingCount = () => Math.max(0, store.queue.length - (store.running ? 1 : 0));
export const queueFull = () => waitingCount() >= MAX_QUEUED;
export const uploadDir = (job: Internal) => path.join(job.dir, 'upload');
export const deckDir = (job: Internal) => path.join(job.dir, 'deck');

export function publicJob(j: Internal): Job & { currentStep: StepId | null; queuePosition: number | null; canRetry: boolean } {
  const { dir: _dir, ...pub } = j; void _dir;
  const currentStep = j.state === 'running' ? (j.steps.find(s => !j.completed.includes(s.id))?.id ?? null) : null;
  const qp = j.state === 'queued' ? store.queue.indexOf(j.id) + (store.running ? 0 : 1) : null; // 1 = next to run
  return { ...pub, currentStep, queuePosition: qp, canRetry: j.state === 'failed' && fs.existsSync(uploadDir(j)) };
}

const STEP_OF: [RegExp, StepId][] = [[/^Extracted/, 'ingest'], [/^Chunked/, 'chunk'], [/^Story understood/, 'analyze'], [/^Storyboard (loaded|generated)/, 'storyboard'], [/^Storyboard validated/, 'validate'],
  [/^Deck generated/, 'generate'], [/^Browser QA( \(|:| skipped)/, 'qa'], [/^Presentation (ready|generated)/, 'ready']];
function onEvent(j: Internal, e: { type?: string; message?: string }) {
  const message = String(e.message ?? ''); j.events.push({ t: Date.now(), type: String(e.type ?? 'info'), message: message.slice(0, 300) });
  if (j.events.length > 200) j.events.shift();
  if (e.type === 'note' || e.type === 'info') j.note = message.slice(0, 200);
  for (const [re, id] of STEP_OF) if (re.test(message) && !j.completed.includes(id)) j.completed.push(id);
}

// Plain-language failure text per stage. The raw tool output is kept as "detail", with the machine's folder names removed.
const FRIENDLY: Record<string, [string, string]> = {
  usage: ['This request could not be run', 'FilmDeck could not start this job.'],
  live: ['FilmDeck could not complete the AI analysis', 'Please try again.'],
  ingest: ['We could not read this document', 'The file may be damaged, password-protected, or a scan with no selectable text. Try exporting it again, or use a different file.'],
  chunk: ['We could not prepare this document', 'The document was read but could not be split for planning.'],
  storyboard: ['We could not plan a deck for this document', 'In this local version a deck can only be planned for the built-in sample documents. Live AI planning arrives in a later version.'],
  validate: ['The planned deck did not pass the safety checks', 'A number or source in the plan could not be tied back to the document, so nothing was built.'],
  generate: ['We could not build the deck', 'The plan was valid but the deck files could not be assembled.'],
  qa: ['The deck failed its browser test', 'The deck was built but did not pass the quality checks, so it was not published.'],
  internal: ['Something went wrong', 'An unexpected error stopped this job. Nothing was published.'],
};
function scrub(s: string) { return String(s).split(REPO_ROOT).join('<filmdeck>').replace(/\/Users\/[^\s/]+/g, '/Users/<you>').slice(-4000); }

async function execute(j: Internal) {
  j.state = 'running'; j.startedAt = Date.now();
  try {
    const eng = await engine(); const input = fs.readdirSync(uploadDir(j))[0], live = j.mode === 'live';
    const fx = live ? undefined : findFixture(eng.projectName(input)); // live mode never looks for a fixture: any supported document is eligible
    const r = await eng.runFilmDeck({ inputPath: path.join(uploadDir(j), input), outputDir: deckDir(j), name: eng.projectName(input), mode: j.mode, mockFixture: fx, qaMode: j.qaMode, fictional: !live, onEvent: (e: any) => onEvent(j, e) });
    j.finishedAt = Date.now();
    if (!r.ok) {
      if (live && r.exitCode === 3) { j.state = 'failed'; j.error = { title: "Live generation isn't configured", message: eng.NO_KEY_MESSAGE, detail: '' }; return; }
      if (live && r.stage === 'storyboard') { const [, message] = eng.LIVE_ERRORS[r.errorKind] || eng.LIVE_ERRORS.client; j.state = 'failed'; j.error = { title: STORYBOARD_TITLE[r.errorKind as string] || FRIENDLY.live[0], message, detail: '' }; return; } // provider text is never shown
      const [title, message] = FRIENDLY[r.stage] || FRIENDLY.internal; j.state = 'failed'; j.error = { title, message, detail: scrub(`${r.title || ''}\n${r.reason || ''}`) }; return;
    }
    const m = r.manifest, g = m.generation;
    j.result = { status: m.status, scenes: m.sceneCount, beats: m.beatCount, recipes: m.recipes, qa: m.qa, warnings: (m.warnings || []).slice(0, 10).map(scrub), timingsMs: m.timingsMs, totalMs: m.totalMs, fictional: !live,
      generation: { mode: j.mode, model: g.model, strategy: g.strategy, calls: g.calls ? g.calls.total : null, repairs: g.repairsUsed, chunks: m.chunkCount, aiMs: g.aiMs } };
    j.state = 'done'; fs.rmSync(uploadDir(j), { recursive: true, force: true }); // the original upload is no longer needed once the deck exists
  } catch (e) { j.finishedAt = Date.now(); j.state = 'failed'; const [title, message] = FRIENDLY.internal; j.error = { title, message, detail: scrub((e as Error).message) }; }
}
const STORYBOARD_TITLE: Record<string, string> = { auth: 'The AI service rejected the API key', rate_limit: 'The AI service is busy', server: 'The AI service had a problem', network: 'Could not reach the AI service', timeout: 'The AI service took too long',
  context: 'This document is too large for the AI', 'too-large': 'This document is too long', malformed: 'The AI answer could not be used', validation: 'The plan did not pass the fact checks', client: 'FilmDeck could not complete the AI analysis' };
export const liveAvailable = () => !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()); // a boolean only: the key itself never leaves this process
export function findFixture(name: string): string | undefined {
  for (const d of ['tests/ai/fixtures', 'tests/corpus/fixtures']) { const f = path.join(REPO_ROOT, d, name + '.json'); if (fs.existsSync(f)) return f; }
  return undefined;
}
// One place that stores an upload and queues the job (used by /api/generate and /api/retry). `name` is already the sanitised ASCII project name.
export function submit(o: { name: string; ext: string; bytes: Buffer; qaMode: 'fast' | 'full'; mode: Mode; sample: string | null }): Internal {
  const job = newJob({ displayName: o.name + '.' + o.ext, sourceType: o.ext, qaMode: o.qaMode, mode: o.mode, sample: o.sample });
  fs.writeFileSync(path.join(uploadDir(job), o.name + '.' + o.ext), o.bytes, { flag: 'wx' }); enqueue(job); return job;
}
// Retry a FAILED job with the same file and options. It is a new, user-initiated job (counts against the queue); nothing is retried automatically.
export function retryJob(id: string): Internal | 'not-found' | 'not-failed' | 'no-upload' | 'busy' {
  const old = getJob(id); if (!old) return 'not-found'; if (old.state !== 'failed') return 'not-failed'; if (queueFull()) return 'busy';
  const up = fs.existsSync(uploadDir(old)) ? fs.readdirSync(uploadDir(old))[0] : null; if (!up) return 'no-upload';
  const ext = path.extname(up).slice(1), name = up.slice(0, -(ext.length + 1));
  return submit({ name, ext, bytes: fs.readFileSync(path.join(uploadDir(old), up)), qaMode: old.qaMode, mode: old.mode, sample: old.sample });
}
// Delete a finished job's files and forget it (the user's way to remove their document and the deck).
export function deleteJob(id: string): 'ok' | 'not-found' | 'active' {
  const j = getJob(id); if (!j) return 'not-found'; if (j.state === 'queued' || j.state === 'running') return 'active';
  store.jobs.delete(j.id); fs.rmSync(j.dir, { recursive: true, force: true }); return 'ok';
}
export function enqueue(j: Internal) { store.queue.push(j.id); void pump(); }
async function pump() {
  if (store.running) return; store.running = true;
  try {
    while (store.queue.length) { const j = store.jobs.get(store.queue[0]); if (j) await execute(j); store.queue.shift(); prune(); }
  } finally { store.running = false; }
}
function prune() {
  const finished = [...store.jobs.values()].filter(j => j.state === 'done' || j.state === 'failed').sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0));
  while (finished.length > MAX_KEPT) { const o = finished.shift()!; store.jobs.delete(o.id); fs.rmSync(o.dir, { recursive: true, force: true }); }
}

// ---------- samples: the built-in fictional documents that have a stored storyboard ----------
export const SAMPLE_DIR = path.join(REPO_ROOT, 'tests/corpus/docs');
const SAMPLE_TITLES: Record<string, string> = { '01-consulting-deck.pptx': 'Consulting deck (PowerPoint)', '02-dense-corporate.pptx': 'Dense corporate update (PowerPoint)', '03-annual-report.pdf': 'Annual report (PDF)', '04-multi-column.pdf': 'Two-column article (PDF)', '05-text-heavy.docx': 'Text-heavy memo (Word)', '06-tables.docx': 'Tables report (Word)', '07-financial-report.md': 'Financial report (Markdown)', '08-marketing-case.txt': 'Marketing case (text)', '09-hr-case.docx': 'People & HR case (Word)', '10-qualitative-narrative.md': 'Qualitative narrative (Markdown)', '11-long-report.md': 'Very long report (Markdown)', '12-messy-mixed.docx': 'Messy mixed formats (Word)' };
export function listSamples() {
  try { return fs.readdirSync(SAMPLE_DIR).filter(f => SAMPLE_TITLES[f]).sort().map(f => ({ file: f, title: SAMPLE_TITLES[f], type: path.extname(f).slice(1), sizeBytes: fs.statSync(path.join(SAMPLE_DIR, f)).size })); } catch { return []; }
}
export async function liveModel() { try { return process.env.FILMDECK_MODEL || (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(path.join(REPO_ROOT, 'tools/ai/claude.mjs')).href)).DEFAULT_MODEL; } catch { return null; } }
export const UPLOAD_TYPES = ['pptx', 'docx', 'pdf', 'md', 'txt'];
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
