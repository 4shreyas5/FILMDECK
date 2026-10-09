// Minimal Anthropic Messages API client (the only provider boundary). No SDK, no dependencies.
// Key: ANTHROPIC_API_KEY (environment only, never logged or stored). Model: FILMDECK_MODEL or the default below.
// ANTHROPIC_BASE_URL exists so the transport can be tested against a local fake server.
//
// Call budget: one callClaude() makes at most 1 + retries HTTP attempts (default 3). Only transient failures are retried (429, 5xx, network
// errors); a timeout, an auth error or any other 4xx is final. The storyboard pipeline adds its own bounded repair rounds on top (see docs/LIVE-AI.md).
export const DEFAULT_MODEL = 'claude-opus-5-5';
export const REQUEST_TIMEOUT_MS = 300000; // one non-streaming request; a full storyboard is a few thousand output tokens
export class MissingKeyError extends Error { constructor() { super('ANTHROPIC_API_KEY is not set. Live mode needs it in the environment; use --mock for offline fixture runs.'); this.name = 'MissingKeyError'; } }

// kind: auth | rate_limit | context | client | server | network | timeout. The message is safe to log; the provider's own text stays in `.detail`
// (truncated, never shown to end users, never contains the key).
export class ClaudeError extends Error {
  constructor(kind, message, { status = null, detail = '', httpAttempts = 1 } = {}) { super(message); this.name = 'ClaudeError'; this.kind = kind; this.status = status; this.detail = detail; this.httpAttempts = httpAttempts; }
}
export function hasKey() { return !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()); }
const redact = (s, key) => (key ? String(s).split(key).join('[key]') : String(s));
const kindOf = (status, msg) => status === 401 || status === 403 ? 'auth' : status === 429 ? 'rate_limit' : status >= 500 || status === 408 || status === 409 ? 'server'
  : status === 413 || (status === 400 && /too long|too many tokens|context|exceed/i.test(msg)) ? 'context' : 'client';
const RETRYABLE = new Set(['rate_limit', 'server', 'network']);

// system: string (sent as one cacheable block). messages: [{role, content}]. Returns { text, usage, stopReason, model, httpAttempts }.
export async function callClaude({ system, messages, maxTokens = 16000, model = process.env.FILMDECK_MODEL || DEFAULT_MODEL, retries = 2, timeoutMs = Number(process.env.FILMDECK_REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS }) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key || !key.trim()) throw new MissingKeyError();
  const url = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '') + '/v1/messages';
  const delay = Number(process.env.FILMDECK_RETRY_DELAY_MS ?? 1500);
  const body = JSON.stringify({ model, max_tokens: maxTokens, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages });
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let wait = delay * (attempt + 1);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body, signal: AbortSignal.timeout(timeoutMs) });
      const raw = await res.text(); let json; try { json = JSON.parse(raw); } catch { json = null; }
      if (res.ok && json) {
        const text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        return { text, usage: json.usage || {}, stopReason: json.stop_reason, model: json.model || model, httpAttempts: attempt + 1 };
      }
      const msg = redact(json?.error?.message || raw.slice(0, 300), key).slice(0, 300), kind = res.ok ? 'server' : kindOf(res.status, msg);
      last = new ClaudeError(kind, `Anthropic API ${res.status}${res.ok ? ' (unreadable response)' : ''}`, { status: res.status, detail: msg, httpAttempts: attempt + 1 });
      const ra = Number(res.headers.get('retry-after')); if (ra > 0) wait = Math.min(ra * 1000, 30000);
    } catch (e) {
      if (e instanceof ClaudeError) throw e;
      if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new ClaudeError('timeout', `Anthropic API did not answer within ${Math.round(timeoutMs / 1000)}s`, { httpAttempts: attempt + 1 });
      last = new ClaudeError('network', 'Anthropic API unreachable', { detail: redact(e?.cause?.code || e?.message || '', key).slice(0, 200), httpAttempts: attempt + 1 });
    }
    if (!RETRYABLE.has(last.kind)) throw last;
    if (attempt < retries) await new Promise(r => setTimeout(r, wait));
  }
  last.httpAttempts = retries + 1; throw last;
}
