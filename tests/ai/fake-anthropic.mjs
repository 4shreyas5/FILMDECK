// A local stand-in for the Anthropic Messages API, used ONLY to test FilmDeck's live code path (transport, prompts, repair feedback, errors,
// call counting). It is a script, not a model: nothing it returns says anything about how real Claude behaves.
import http from 'http';
export async function startFake(handler) {
  const seen = [];
  const server = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', async () => {
    let body = null; try { body = JSON.parse(b); } catch {}
    const rec = { url: req.url, headers: req.headers, body, system: body?.system?.[0]?.text || '', user: body?.messages?.[0]?.content || '', n: seen.length + 1 }; seen.push(rec);
    const r = await handler(rec) || {};
    if (r.hang) return; // never answers (timeout tests)
    if (r.destroy) return req.socket.destroy();
    res.writeHead(r.status || 200, { 'content-type': 'application/json', ...(r.headers || {}) });
    if (r.raw !== undefined) return res.end(r.raw);
    if (r.error) return res.end(JSON.stringify({ type: 'error', error: { type: 'x', message: r.error } }));
    res.end(JSON.stringify({ model: r.model || 'fake-model-1', content: [{ type: 'text', text: r.text }], stop_reason: r.stopReason || 'end_turn', usage: { input_tokens: r.inTok ?? 1000, output_tokens: r.outTok ?? 500, cache_read_input_tokens: 0 } }));
  }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, seen, close: () => { server.closeAllConnections?.(); server.close(); } };
}
// MAP-step responder: builds a plausible answer lexically from the blocks in the prompt (first sentence with a number per block, up to 3 blocks).
export function lexicalMapAnswer(user) {
  const inner = user.split(/<<<SOURCE \w+ BEGIN>>>/)[1].split(/<<<SOURCE \w+ END>>>/)[0];
  const blocks = [...inner.matchAll(/\[([a-z0-9-]+)\] \([^\n]*\)\n([\s\S]*?)(?=\n\n\[[a-z0-9-]+\] \(|$)/g)].map(m => ({ id: m[1], text: m[2] }));
  const facts = [];
  for (const b of blocks) { if (facts.length >= 3) break; const m = b.text.match(/[^.!?\n]*?(\d[\d,.]*\d%?|\d%?)[^.!?\n]*[.!?]?/); if (m) { const q = m[0].trim(); const d = q.match(/\d[\d,.]*\d%?|\d%?/)[0]; facts.push({ sourceRef: b.id, display: d, quote: q.slice(0, 280), note: 'a number from this part' }); } }
  return JSON.stringify({ summary: `This part covers ${blocks.length} blocks of the document and develops its argument.`, facts });
}
