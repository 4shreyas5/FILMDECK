'use client';
import { useRef, useState } from 'react'; import { useRouter } from 'next/navigation';
type Sample = { file: string; title: string; type: string; sizeBytes: number };
type ApiError = { title: string; message: string };
const fmt = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const OK_EXT = ['pptx', 'docx', 'pdf', 'md', 'txt'], MAX = 25 * 1024 * 1024;
export default function UploadForm({ samples, live }: { samples: Sample[]; live: { available: boolean; model: string | null } }) {
  const router = useRouter(); const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null), [over, setOver] = useState(false), [qa, setQa] = useState<'fast' | 'full'>('fast'), [mode, setMode] = useState<'mock' | 'live'>('mock');
  const [busy, setBusy] = useState(false), [err, setErr] = useState<ApiError | null>(null);
  // Cheap checks before uploading; the server repeats all of them and is the authority.
  const pick = (f: File | undefined | null) => {
    setErr(null); if (!f) return setFile(null);
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    if (!OK_EXT.includes(ext)) { setFile(null); return setErr({ title: 'Unsupported file type', message: `FilmDeck reads .pptx, .docx, .pdf, .md and .txt files. "${f.name.slice(0, 60)}" is not one of them.` }); }
    if (f.size > MAX) { setFile(null); return setErr({ title: 'File too large', message: `Files can be up to 25 MB. This one is ${fmt(f.size)}.` }); }
    if (f.size === 0) { setFile(null); return setErr({ title: 'Empty file', message: 'That file is empty.' }); }
    setFile(f);
  };
  async function submit(extra: { sample?: string }) {
    setErr(null); setBusy(true);
    try {
      const fd = new FormData(); fd.set('qa', qa); fd.set('mode', mode); if (extra.sample) fd.set('sample', extra.sample); else if (file) fd.set('file', file);
      const r = await fetch('/api/generate', { method: 'POST', body: fd }); const j = await r.json().catch(() => null);
      if (!r.ok || !j?.id) { setErr(j?.error || { title: 'Upload failed', message: 'The server did not accept this upload. Please try again.' }); setBusy(false); return; }
      router.push('/job/' + j.id);
    } catch { setErr({ title: 'Cannot reach FilmDeck', message: 'The local server is not responding. Is it still running? Start it again with "npm start" in the web folder.' }); setBusy(false); }
  }
  const noPlan = err?.title === 'No prepared deck plan for this document';
  return (<div className="card">
    <section aria-labelledby="h-doc">
      <h2 className="sec-h" id="h-doc"><i>01</i>Your document</h2>
      <input ref={input} data-testid="file-input" type="file" hidden accept=".pptx,.docx,.pdf,.md,.txt" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {file ? (<div className="chosen" data-testid="chosen"><div><div className="fname" data-testid="file-name">{file.name}</div><div className="muted">{fmt(file.size)} · ready</div></div>
          <div className="btns"><button type="button" className="btn-s" data-testid="replace" onClick={() => input.current?.click()}>Replace</button><button type="button" className="btn-s" data-testid="remove" onClick={() => setFile(null)}>Remove</button></div></div>)
        : (<div className={'drop' + (over ? ' over' : '')} data-testid="dropzone" role="button" tabIndex={0} aria-label="Choose a document or drop it here"
            onClick={() => input.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
            onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}>
            <div className="big">Drop a document here</div><div className="muted">or click to choose · .pptx .docx .pdf .md .txt · up to 25 MB</div></div>)}
      {/* kept in the DOM so a drop onto the zone after a file is chosen still works */}
      {file && <div className="muted" style={{ marginTop: 8 }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>You can also drop another file here to replace it.</div>}
    </section>
    <fieldset className="choice" data-testid="mode-choice"><legend className="sec-h"><i>02</i>How should the story be written?</legend>
      <label className={mode === 'mock' ? 'on' : ''}><input type="radio" name="mode" value="mock" checked={mode === 'mock'} onChange={() => setMode('mock')} /><b>Mock<span className="pill mock">no AI</span></b><span>Uses prepared local storyboards. No API key required.</span></label>
      <label className={(mode === 'live' ? 'on-live ' : '') + (live.available ? '' : 'off')} data-testid="live-option"><input type="radio" name="mode" value="live" checked={mode === 'live'} disabled={!live.available} onChange={() => setMode('live')} /><b>Live<span className="pill live">Claude</span></b>
        <span>Uses Claude to analyze your document and design the presentation.</span></label>
    </fieldset>
    {!live.available && <p className="note" data-testid="live-unavailable">Live generation isn&apos;t configured on this machine. To enable it, the person running this server sets <b>ANTHROPIC_API_KEY</b> in the server&apos;s environment and restarts it. The browser never sees or asks for the key.</p>}
    {mode === 'mock'
      ? <p className="note" data-testid="mode-note"><b>Mock mode.</b> Builds a deck only for the 12 sample documents below (each has a prepared storyboard). No AI is used and your document goes nowhere. Any other document needs Live mode.</p>
      : <p className="note live" data-testid="mode-note"><b>Live mode{live.model ? ` (${live.model})` : ''}.</b> The text of your document is sent to Anthropic for analysis, takes a few minutes and uses API credit. Any supported document works. Every number is checked against a quote from it.</p>}
    <fieldset className="choice" data-testid="qa-choice"><legend className="sec-h"><i>03</i>Quality check</legend>
      <label className={qa === 'fast' ? 'on' : ''}><input type="radio" name="qa" value="fast" checked={qa === 'fast'} onChange={() => setQa('fast')} /><b>Fast</b><span>About 1 minute. Plays every scene and beat in a real browser. Best while experimenting.</span></label>
      <label className={qa === 'full' ? 'on' : ''}><input type="radio" name="qa" value="full" checked={qa === 'full'} onChange={() => setQa('full')} /><b>Full</b><span>About 3 minutes. Adds keyboard, mouse, screen-size and motion tests. Use for a deck you will present.</span></label>
    </fieldset>
    {err && <div className="err" role="alert" data-testid="error"><b>{err.title}</b><span>{err.message}</span>
      {noPlan && live.available && <div className="rec"><button type="button" className="btn-s" onClick={() => { setMode('live'); setErr(null); }}>Switch to Live mode</button></div>}</div>}
    <button className="go" data-testid="generate" disabled={!file || busy} onClick={() => submit({})}>{busy ? 'Uploading…' : 'Generate presentation'}</button>
    {samples.length > 0 && (<section className="samples" aria-labelledby="h-samples"><h2 className="sec-h" id="h-samples">No document handy? Try a sample</h2><p className="muted">Fictional documents that ship with FilmDeck. They use the mode and quality check chosen above{mode === 'live' ? ' (Live uses API credit)' : ''}.</p><div className="grid">
      {samples.map(s => (<button key={s.file} className="sample" data-testid={'sample-' + s.file} disabled={busy} onClick={() => submit({ sample: s.file })}><b>{s.title}</b><span>{s.type.toUpperCase()} · {fmt(s.sizeBytes)} · fictional</span></button>))}
    </div></section>)}
  </div>);
}
