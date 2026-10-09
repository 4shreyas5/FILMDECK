'use client';
import { useEffect, useRef, useState } from 'react'; import { useRouter } from 'next/navigation';
type Step = { id: string; label: string };
type Gen = { mode: string; model: string | null; strategy: string | null; calls: number | null; repairs: number | null; chunks: number | null; aiMs: number | null };
type Job = { mode: 'mock' | 'live'; steps: Step[]; note?: string; canRetry: boolean; id: string; state: 'queued' | 'running' | 'done' | 'failed'; displayName: string; qaMode: string; createdAt: number; startedAt?: number; finishedAt?: number; completed: string[]; currentStep: string | null; queuePosition: number | null;
  events: { t: number; type: string; message: string }[]; error?: { title: string; message: string; detail: string };
  result?: { status: string; scenes: number; beats: number; recipes: string[]; generation: Gen; qa: any; warnings: string[]; timingsMs: Record<string, number>; totalMs: number } };
const secs = (ms: number) => (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s';
export default function JobView({ id }: { id: string }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null), [missing, setMissing] = useState<string | null>(null), [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false), [actErr, setActErr] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try { const r = await fetch('/api/status/' + id, { cache: 'no-store' });
        if (r.status === 404) { setMissing((await r.json()).error?.message || 'Job not found.'); return; }
        const j: Job = await r.json(); if (stop) return; setJob(j); if (j.state === 'done' || j.state === 'failed') return;
      } catch { /* server briefly busy: keep trying */ }
      timer = setTimeout(tick, 700);
    };
    tick(); const clock = setInterval(() => setNow(Date.now()), 500); return () => { stop = true; clearTimeout(timer); clearInterval(clock); };
  }, [id]);
  async function retry() {
    setBusy(true); setActErr(null);
    try { const r = await fetch('/api/retry/' + id, { method: 'POST' }); const j = await r.json().catch(() => null); if (!r.ok || !j?.id) { setActErr(j?.error?.message || 'Could not start again. Please upload the document again.'); setBusy(false); return; } router.push('/job/' + j.id); }
    catch { setActErr('The local server is not responding.'); setBusy(false); }
  }
  async function remove() {
    if (!window.confirm('Delete this presentation and the uploaded document from this computer? This cannot be undone.')) return;
    setBusy(true); const r = await fetch('/api/status/' + id, { method: 'DELETE' }).catch(() => null); if (r && r.ok) router.push('/'); else { setActErr('Could not delete the files.'); setBusy(false); }
  }
  if (missing) return (<div className="card"><div className="err" data-testid="error"><b>This job was not found</b><span>{missing}</span><div className="rec"><a className="go link" href="/">Start a new presentation</a></div></div></div>);
  if (!job) return (<div className="card" aria-busy="true" data-testid="loading"><div className="skeleton" style={{ width: '40%' }} /><div className="skeleton" /><div className="skeleton" style={{ width: '70%' }} /><span className="muted">Loading…</span></div>);
  const elapsed = (job.finishedAt || now) - (job.startedAt || job.createdAt), live = job.mode === 'live';
  const failedStep = job.state === 'failed' ? job.steps.find(x => !job.completed.includes(x.id))?.id : null;
  return (<div className="card" data-testid="job" data-state={job.state}>
    <div className="jobhead"><div><div className="muted">{job.qaMode === 'full' ? 'Full' : 'Fast'} quality check · <span data-testid="job-mode">{live ? 'live mode (Claude)' : 'mock mode'}</span></div><h1 className="fname">{job.displayName}</h1></div>
      <div className="timer" data-testid="elapsed" aria-label="Elapsed time">{job.state === 'queued' ? `Waiting${job.queuePosition ? ' · position ' + job.queuePosition : ''}` : secs(Math.max(0, elapsed))}</div></div>
    {job.state === 'queued' && <p className="note">Another presentation is being built. FilmDeck runs one at a time so each gets the whole computer. This one starts automatically.</p>}
    <ol className="steps" data-testid="steps" aria-live="polite">{job.steps.map(s => {
      const done = job.completed.includes(s.id) || job.state === 'done', cur = job.state === 'running' && job.currentStep === s.id, bad = failedStep === s.id;
      return (<li key={s.id} data-step={s.id} data-status={done ? 'done' : cur ? 'active' : bad ? 'failed' : 'todo'} className={done ? 'done' : cur ? 'active' : bad ? 'failed' : ''}><i>{done ? '✓' : bad ? '✕' : ''}</i>{s.label}{cur && live && job.note ? <small className="note" data-testid="step-note">{job.note}</small> : null}</li>);
    })}</ol>
    {job.state === 'failed' && job.error && (<div className="err" role="alert" data-testid="error"><b>{job.error.title}</b><span>{job.error.message}</span>
      {job.error.detail && <details><summary>Technical details</summary><pre>{job.error.detail}</pre></details>}
      <div className="rec">{job.canRetry && <button className="go" data-testid="retry" disabled={busy} onClick={retry}>Try again</button>}<a className="ghost link" href="/">Try another document</a></div>
      {actErr && <span role="alert">{actErr}</span>}</div>)}
    {job.state !== 'failed' && <details className="log"><summary>Activity log</summary><ul data-testid="log">{job.events.map((e, i) => <li key={i} className={e.type}>{e.message}</li>)}</ul></details>}
    {job.state === 'done' && job.result && (<section data-testid="result" aria-labelledby="h-ready">
      <div className="ready"><h2 id="h-ready">Your presentation is ready</h2>
        <div className="facts"><span><b>{job.result.scenes}</b> scenes</span><span><b>{job.result.beats}</b> beats</span>
          <span data-testid="qa-result"><b>{job.result.qa?.passed ? 'Passed' : job.result.qa?.skipped ? 'Skipped' : 'Failed'}</b> {job.result.qa?.checks ? `${job.result.qa.checks.passed}/${job.result.qa.checks.total} checks (${job.result.qa.mode})` : 'browser checks'}</span>
          <span>built in <b>{secs(job.result.totalMs)}</b></span></div>
        {job.result.generation.mode === 'live'
          ? <p className="muted" data-testid="gen-note">Planned by Claude from your document; every number was checked against a quote from it. Please still read the deck before you present it. Works offline: nothing is loaded from the internet.</p>
          : <p className="muted">Storyboard from a stored sample plan, not AI-generated. Fictional demo content. Works offline: nothing is loaded from the internet.</p>}
        <dl className="gen" data-testid="gen-info"><dt>Document</dt><dd data-testid="gen-doc">{job.displayName}</dd><dt>Generation mode</dt><dd data-testid="gen-mode">{job.result.generation.mode === 'live' ? 'Live' : 'Mock'}</dd>
          {job.result.generation.model && <><dt>Model</dt><dd data-testid="gen-model">{job.result.generation.model}</dd></>}
          {job.result.generation.mode === 'live' && <><dt>Claude calls</dt><dd>{job.result.generation.calls}{job.result.generation.repairs ? ` (${job.result.generation.repairs} correction${job.result.generation.repairs === 1 ? '' : 's'})` : ''}</dd>
          <dt>Planning time</dt><dd>{job.result.generation.aiMs != null ? secs(job.result.generation.aiMs) : ''}</dd></>}</dl></div>
      <div className="player"><iframe ref={frame} data-testid="deck-frame" title="Generated FilmDeck presentation" src={`/deck/${job.id}`} sandbox="allow-scripts" allow="fullscreen" onLoad={() => frame.current?.focus()} />
        <div className="hint">Press Begin, then use → or Space for the next beat and ← to go back. F toggles full screen, H shows all shortcuts.</div>
        <div className="hint-small">Presentations are designed for a wide screen. On a phone, use <b>Open full window</b> (and rotate the phone) for the real view.</div></div>
      <div className="actions"><a className="go link" data-testid="open-deck" href={`/deck/${job.id}`} target="_blank" rel="noopener noreferrer">Open full window</a>
        <a className="ghost link" data-testid="download-deck" href={`/deck/${job.id}?download=1`}>Download HTML file</a><a className="ghost link" data-testid="another" href="/">Make another</a>
        <button className="btn-s danger" data-testid="delete" disabled={busy} onClick={remove}>Delete files</button></div>
      {actErr && <p className="note warn" role="alert">{actErr}</p>}
      {job.result.warnings.length > 0 && <details className="log"><summary>{job.result.warnings.length} note(s)</summary><ul>{job.result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
    </section>)}
  </div>);
}
