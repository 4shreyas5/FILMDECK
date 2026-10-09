// PDF text extraction without dependencies. Parses the object structure, decodes content streams, maps glyph codes to Unicode ONLY through
// the file's own ToUnicode/encoding data (never guesses), and rebuilds lines / paragraphs / headings / lists / tables from glyph positions.
// No OCR: image-only PDFs fail with a clear error. Encrypted PDFs fail. Nothing in the file is executed (JavaScript actions are never read).
import zlib from 'zlib';
import { IngestError, normLine, normText, tableText, newDoc } from './common.mjs';

// ---------- object syntax ----------
class PName { constructor(n) { this.n = n; } } class PStr { constructor(s) { this.s = s; } } class PRef { constructor(n, g) { this.n = n; this.g = g; } }
const WS = /[\0\t\n\f\r ]/, DELIM = /[()<>\[\]{}\/%]/;
function lex(s, i) { // -> [token, nextIndex]; token: number | PName | PStr | PRef-less raw | {op} | punctuation string
  for (;;) { while (i < s.length && WS.test(s[i])) i++; if (s[i] === '%') { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; } else break; }
  if (i >= s.length) return [null, i];
  const c = s[i];
  if (c === '/') { let j = i + 1; while (j < s.length && !WS.test(s[j]) && !DELIM.test(s[j])) j++; return [new PName(s.slice(i + 1, j).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))), j]; }
  if (c === '(') { let d = 1, j = i + 1, out = ''; while (j < s.length && d) { const ch = s[j];
      if (ch === '\\') { const n = s[j + 1]; j += 2;
        if (n === 'n') out += '\n'; else if (n === 'r') out += '\r'; else if (n === 't') out += '\t'; else if (n === 'b') out += '\b'; else if (n === 'f') out += '\f';
        else if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[j] || '')) o += s[j++]; out += String.fromCharCode(parseInt(o, 8) & 255); }
        else if (n === '\r') { if (s[j] === '\n') j++; } else if (n !== '\n') out += n; continue; }
      if (ch === '(') d++; else if (ch === ')') { d--; if (!d) { j++; break; } } out += ch; j++; }
    return [new PStr(out), j]; }
  if (c === '<' && s[i + 1] === '<') return ['<<', i + 2]; if (c === '>' && s[i + 1] === '>') return ['>>', i + 2];
  if (c === '<') { const j = s.indexOf('>', i); const h = s.slice(i + 1, j).replace(/\s/g, ''); let out = ''; for (let k = 0; k < h.length; k += 2) out += String.fromCharCode(parseInt((h.slice(k, k + 2) + '0').slice(0, 2), 16)); return [new PStr(out), j + 1]; }
  if (c === '[' || c === ']' || c === '{' || c === '}') return [c, i + 1];
  if (c === '>' || c === ')') return [c, i + 1];
  let j = i; while (j < s.length && !WS.test(s[j]) && !DELIM.test(s[j])) j++;
  const w = s.slice(i, j); if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) return [parseFloat(w), j];
  return [{ op: w }, j];
}
function value(s, i, depth = 0) { // parse one object value (refs "n g R" included)
  if (depth > 40) throw new IngestError('corrupt', 'PDF structure is nested too deeply');
  let [t, j] = lex(s, i);
  if (t === '[') { const arr = []; for (;;) { const [v, k] = value(s, j, depth + 1); if (v === ']' || v === undefined) { j = k; break; } arr.push(v); j = k; } return [arr, j]; }
  if (t === '<<') { const d = {}; for (;;) { const [k, a] = lex(s, j); if (k === '>>' || k === null) { j = a; break; } const [v, b] = value(s, a, depth + 1); if (k instanceof PName) d[k.n] = v; j = b; } return [d, j]; }
  if (typeof t === 'number' && Number.isInteger(t)) { // maybe "n g R"
    const [g, a] = lex(s, j); if (typeof g === 'number' && Number.isInteger(g)) { const [r, b] = lex(s, a); if (r && r.op === 'R') return [new PRef(t, g), b]; } return [t, j];
  }
  if (t === ']' || t === '>>') return [t, j];
  if (t && t.op !== undefined) { if (t.op === 'true') return [true, j]; if (t.op === 'false') return [false, j]; if (t.op === 'null') return [null, j]; return [t, j]; }
  return [t === null ? undefined : t, j];
}

// ---------- file model ----------
class Pdf {
  constructor(buf) {
    this.buf = buf; this.s = buf.toString('latin1'); this.objs = new Map(); this.cache = new Map(); this.trailers = [];
    const re = /(?:^|[\r\n\s])(\d+)\s+(\d+)\s+obj\b/g; let m;
    while ((m = re.exec(this.s))) this.objs.set(+m[1], { pos: m.index + m[0].length }); // later definitions win (incremental updates)
    for (const mm of this.s.matchAll(/trailer\s*<</g)) { const [d] = value(this.s, mm.index + 7); if (d && typeof d === 'object') this.trailers.push(d); }
    // object streams
    for (const [num] of [...this.objs]) { const o = this.get(num); if (o && o.dict && o.dict.Type instanceof PName && o.dict.Type.n === 'ObjStm') this.expandObjStm(o); if (o && o.dict && o.dict.Type instanceof PName && o.dict.Type.n === 'XRef') this.trailers.push(o.dict); }
  }
  expandObjStm(o) {
    let data; try { data = this.streamData(o).toString('latin1'); } catch { return; }
    const n = this.resolve(o.dict.N), first = this.resolve(o.dict.First); const nums = []; let p = 0;
    for (let k = 0; k < n; k++) { const [a, p1] = lex(data, p); const [b, p2] = lex(data, p1); nums.push([a, b]); p = p2; }
    nums.forEach(([num, off]) => { if (!this.objs.has(num) || this.objs.get(num).inStm) { const [v] = value(data, first + off); this.objs.set(num, { inStm: true, v }); } });
  }
  get(num) {
    if (this.cache.has(num)) return this.cache.get(num);
    const e = this.objs.get(num); if (!e) return undefined; let v;
    if (e.inStm) v = e.v; else {
      let [x, j] = value(this.s, e.pos);
      if (x && typeof x === 'object' && !Array.isArray(x) && !(x instanceof PName || x instanceof PStr || x instanceof PRef)) {
        const [kw, k] = lex(this.s, j);
        if (kw && kw.op === 'stream') { let st = k; if (this.s[st] === '\r') st++; if (this.s[st] === '\n') st++; v = { dict: x, start: st }; } else v = x;
      } else v = x;
    }
    this.cache.set(num, v); return v;
  }
  resolve(v, depth = 0) { while (v instanceof PRef && depth++ < 20) v = this.get(v.n); return v; }
  dictOf(v) { v = this.resolve(v); return v && v.dict ? v.dict : (v && typeof v === 'object' && !Array.isArray(v) ? v : null); }
  streamData(o) {
    let len = this.resolve(o.dict.Length), end;
    if (typeof len === 'number' && /^\s*endstream/.test(this.s.slice(o.start + len, o.start + len + 12))) end = o.start + len;
    else { end = this.s.indexOf('endstream', o.start); if (end < 0) throw new IngestError('corrupt', 'PDF stream is not terminated'); if (this.s[end - 1] === '\n') end--; if (this.s[end - 1] === '\r') end--; }
    let data = this.buf.subarray(o.start, end);
    let f = this.resolve(o.dict.Filter); f = f === undefined ? [] : Array.isArray(f) ? f.map(x => this.resolve(x)) : [f];
    for (const fl of f) {
      const n = fl && fl.n;
      if (n === 'FlateDecode' || n === 'Fl') { try { data = zlib.inflateSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH, maxOutputLength: 64 * 1024 * 1024 }); } catch (e) { throw new IngestError('corrupt', 'a PDF stream cannot be decompressed'); } }
      else if (n === 'ASCIIHexDecode') data = Buffer.from(data.toString('latin1').replace(/[^0-9a-fA-F]/g, ''), 'hex');
      else if (n === 'ASCII85Decode') data = a85(data.toString('latin1'));
      else throw new IngestError('unsupported', `PDF stream filter "${n}" is not supported`);
    }
    return data;
  }
}
function a85(s) { s = s.replace(/\s/g, '').replace(/^<~/, '').replace(/~>.*$/, ''); const out = []; let g = [];
  for (const ch of s) { if (ch === 'z' && !g.length) { out.push(0, 0, 0, 0); continue; } g.push(ch.charCodeAt(0) - 33); if (g.length === 5) { let v = 0; for (const x of g) v = v * 85 + x; out.push(v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); g = []; } }
  if (g.length > 1) { const n = g.length; while (g.length < 5) g.push(84); let v = 0; for (const x of g) v = v * 85 + x; const b = [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; out.push(...b.slice(0, n - 1)); } return Buffer.from(out); }

// ---------- fonts ----------
const GLYPH = (() => { const m = { space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&', quotesingle: "'", parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',', hyphen: '-', period: '.', slash: '/', colon: ':', semicolon: ';', less: '<', equal: '=', greater: '>', question: '?', at: '@', bracketleft: '[', backslash: '\\', bracketright: ']', asciicircum: '^', underscore: '_', grave: '`', braceleft: '{', bar: '|', braceright: '}', asciitilde: '~', endash: '–', emdash: '—', bullet: '•', quoteleft: '‘', quoteright: '’', quotedblleft: '“', quotedblright: '”', Euro: '€', fi: 'fi', fl: 'fl', ff: 'ff', ffi: 'ffi', ffl: 'ffl', exclamdown: '¡', questiondown: '¿', guillemotleft: '«', guillemotright: '»', quotesinglbase: '‚', quotedblbase: '„', dagger: '†', daggerdbl: '‡', onesuperior: '¹', twosuperior: '²', threesuperior: '³', onehalf: '½', onequarter: '¼', threequarters: '¾', mu: 'µ', paragraph: '¶', germandbls: 'ß', ae: 'æ', AE: 'Æ', oslash: 'ø', Oslash: 'Ø', eacute: 'é', egrave: 'è', agrave: 'à', aacute: 'á', ccedilla: 'ç', udieresis: 'ü', odieresis: 'ö', adieresis: 'ä', ntilde: 'ñ', Eacute: 'É', dotlessi: 'ı', fraction: '⁄', lessequal: '≤', greaterequal: '≥', notequal: '≠', infinity: '∞', arrowright: '→',  ellipsis: '…', trademark: '™', copyright: '©', registered: '®', degree: '°', plusminus: '±', multiply: '×', divide: '÷', sterling: '£', yen: '¥', cent: '¢', section: '§', minus: '−', rupee: '₹', nbspace: ' ', nonbreakingspace: ' ', periodcentered: '·' };
  'zero one two three four five six seven eight nine'.split(' ').forEach((n, i) => m[n] = String(i)); for (let c = 65; c < 91; c++) { m[String.fromCharCode(c)] = String.fromCharCode(c); m[String.fromCharCode(c + 32)] = String.fromCharCode(c + 32); } return m; })();
const glyphToUni = n => GLYPH[n] ?? (/^uni([0-9A-F]{4})$/.test(n) ? String.fromCharCode(parseInt(n.slice(3), 16)) : /^u([0-9A-F]{4,6})$/.test(n) ? String.fromCodePoint(parseInt(n.slice(1), 16)) : undefined);
function parseCMap(txt) {
  const map = new Map(); let codeLen = 0;
  const hexU = h => { let o = ''; for (let k = 0; k < h.length; k += 4) o += String.fromCharCode(parseInt(h.slice(k, k + 4), 16)); return o; };
  for (const m of txt.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) { const h = m[1].match(/<([0-9a-fA-F]+)>/); if (h) codeLen = Math.max(codeLen, h[1].length / 2); }
  for (const m of txt.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const p of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) map.set(parseInt(p[1], 16), hexU(p[2]));
  for (const m of txt.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const lo = parseInt(p[1], 16), hi = parseInt(p[2], 16);
      if (p[3][0] === '[') { [...p[3].matchAll(/<([0-9a-fA-F]*)>/g)].forEach((h, k) => map.set(lo + k, hexU(h[1]))); }
      else { const base = hexU(p[3].slice(1, -1)); for (let c = lo; c <= hi && c - lo < 65536; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - lo))); }
    }
  }
  return { map, codeLen };
}
function loadFont(pdf, fref) {
  const f = pdf.dictOf(fref); const font = { bold: false, codeLen: 1, widths: null, dw: 0, uni: null, map: null, unmapped: false, mw: 0 };
  if (!f) return font;
  const base = pdf.resolve(f.BaseFont); const bn = base instanceof PName ? base.n : ''; font.bold = /bold|black|heavy|semibold/i.test(bn); font.name = bn;
  const sub = pdf.resolve(f.Subtype)?.n; let desc = f;
  const toUni = pdf.resolve(f.ToUnicode); if (toUni && toUni.dict) { try { const c = parseCMap(pdf.streamData(toUni).toString('latin1')); font.uni = c.map; if (c.codeLen) font.codeLen = c.codeLen; } catch (e) { if (e instanceof IngestError && e.code === 'unsupported') throw e; } }
  if (sub === 'Type0') {
    font.codeLen = font.uni && font.codeLen ? font.codeLen : 2; const df = pdf.dictOf(pdf.resolve(f.DescendantFonts)?.[0]) || {}; desc = df;
    font.dw = typeof pdf.resolve(df.DW) === 'number' ? pdf.resolve(df.DW) : 1000; font.widths = new Map();
    const W = pdf.resolve(df.W); if (Array.isArray(W)) for (let k = 0; k < W.length;) { const a = pdf.resolve(W[k]), b = pdf.resolve(W[k + 1]); if (Array.isArray(b)) { b.forEach((w, q) => font.widths.set(a + q, pdf.resolve(w))); k += 2; } else { const w = pdf.resolve(W[k + 2]); for (let c = a; c <= b && c - a < 70000; c++) font.widths.set(c, w); k += 3; } }
    if (!font.uni) font.unmapped = true; // CID font without ToUnicode: glyph ids are not text. We refuse to guess.
  } else {
    const fc = pdf.resolve(f.FirstChar), W = pdf.resolve(f.Widths); font.widths = new Map();
    if (Array.isArray(W) && typeof fc === 'number') W.forEach((w, k) => font.widths.set(fc + k, pdf.resolve(w)));
    const fd = pdf.dictOf(f.FontDescriptor); font.mw = fd && typeof pdf.resolve(fd.MissingWidth) === 'number' ? pdf.resolve(fd.MissingWidth) : 0;
    const enc = pdf.resolve(f.Encoding); font.map = new Map();
    let baseEnc = enc instanceof PName ? enc.n : pdf.resolve(enc?.BaseEncoding)?.n;
    const diffs = enc && !(enc instanceof PName) ? pdf.dictOf(enc)?.Differences : null;
    const embedded = fd && (fd.FontFile || fd.FontFile2 || fd.FontFile3);
    if (!font.uni && !baseEnc && !diffs && embedded && fd.FontFile) { // Type 1 program: its clear-text header carries the built-in encoding ("dup 65 /A put")
      try { const ff = pdf.resolve(fd.FontFile); const head = pdf.streamData(ff).toString('latin1').slice(0, Math.min(40000, pdf.resolve(ff.dict.Length1) || 40000));
        for (const m of head.matchAll(/dup\s+(\d+)\s*\/(\S+)\s+put/g)) { const u = glyphToUni(m[2]); font.map.set(+m[1], u === undefined ? null : u); } font.builtin = font.map.size > 0; } catch (e) { if (e.code === 'unsupported') throw e; }
    }
    if (!font.uni && !baseEnc && !diffs && !font.builtin && (sub === 'Type3' || embedded)) font.unmapped = true; // symbolic/embedded font with no way to read it
    font.baseEnc = baseEnc;
    if (Array.isArray(pdf.resolve(diffs))) { let code = 0; for (const e of pdf.resolve(diffs)) { const r = pdf.resolve(e); if (typeof r === 'number') code = r; else if (r instanceof PName) { const u = glyphToUni(r.n); if (u !== undefined) font.map.set(code, u); else if (!font.uni) font.map.set(code, null); code++; } } }
  }
  return font;
}
const MAC = new TextDecoder('macintosh'), WIN = new TextDecoder('windows-1252');
function codeToText(font, code) {
  if (font.uni && font.uni.has(code)) return font.uni.get(code);
  if (font.unmapped) return null;
  if (font.codeLen === 1) {
    if (font.map && font.map.has(code)) return font.map.get(code);
    if (code === 0) return null;
    return font.baseEnc === 'MacRomanEncoding' ? MAC.decode(Uint8Array.of(code)) : font.baseEnc === 'WinAnsiEncoding' ? WIN.decode(Uint8Array.of(code)) : (code < 128 ? String.fromCharCode(code) : WIN.decode(Uint8Array.of(code)));
  }
  return null;
}
// Widths (1/1000 em, chars 32..126) of the standard Helvetica / Times-Roman AFM metrics, used ONLY for gap detection when a non-embedded font has no /Widths.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const TIMES = [250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541];
const stdWidth = (name, ch) => { const c = ch.charCodeAt(0); if (/courier|mono/i.test(name)) return 0.6; if (c < 32 || c > 126) return 0.55; return (/times|serif|roman|georgia|palatino|garamond/i.test(name) && !/sans/i.test(name) ? TIMES : HELV)[c - 32] / 1000; };
const APPROX = c => ' ,.:;\'|!'.includes(c) ? 0.27 : /[ijlI1ft()\[\]]/.test(c) ? 0.3 : /[mwMW@%]/.test(c) ? 0.85 : /[A-Z]/.test(c) ? 0.68 : 0.54;
function glyphWidth(font, code, ch) { // in em
  if (font.widths && font.widths.size) { const w = font.widths.get(code); if (typeof w === 'number') return w / 1000; if (font.dw) return font.dw / 1000; if (font.mw) return font.mw / 1000; }
  return font.widths && font.widths.size ? APPROX(ch || 'a') : (ch && ch.length === 1 ? stdWidth(font.name || '', ch) : APPROX(ch || 'a'));
}

// ---------- content stream interpreter ----------
const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
function runContent(pdf, data, resources, ctm0, out, fontCache, depth = 0) {
  const s = data.toString('latin1'); let i = 0; const st = []; const gs = []; let ctm = ctm0.slice();
  let tm = [1, 0, 0, 1, 0, 0], tlm = tm, font = null, fsz = 0, tc = 0, tw = 0, th = 1, tl = 0, rise = 0, fname = '';
  const fonts = pdf.dictOf(resources?.Font) || {};
  const setFont = n => { const r = fonts[n]; const key = r instanceof PRef ? 'r' + r.n : null; if (key && fontCache.has(key)) return fontCache.get(key); const fo = loadFont(pdf, r); if (key) fontCache.set(key, fo); return fo; };
  const show = str => {
    if (!font) return; const raw = str.s; let text = '', adv = 0; const x0 = mul(tm, ctm); let bad = 0, total = 0;
    for (let k = 0; k < raw.length;) {
      let code = raw.charCodeAt(k++); const L = font.codeLen; for (let q = 1; q < L && k < raw.length; q++) code = code * 256 + raw.charCodeAt(k++);
      const ch = codeToText(font, code); total++; if (ch === null || ch === undefined) { bad++; text += '\uFFFD'; } else text += ch;
      const w = glyphWidth(font, code, ch || 'a'); adv += (w * fsz + tc + (L === 1 && code === 32 ? tw : 0)) * th;
    }
    if (bad === total) text = ''; // wholly unreadable run: left out
    const sx = Math.hypot(ctm[0], ctm[1]) * Math.hypot(tm[0], tm[1]), sy = Math.hypot(tm[2], tm[3]) * Math.hypot(ctm[2], ctm[3]);
    const p = mul([1, 0, 0, 1, 0, rise], x0); // glyph origin in page space
    tm = mul([1, 0, 0, 1, adv, 0], tm);
    const end = mul(tm, ctm);
    out.items.push({ x: p[4], y: p[5], x2: end[4], size: Math.abs(fsz * sy), text, bold: font.bold, total, bad, fname });
  };
  const num = (k, d = 0) => (typeof st[st.length - k] === 'number' ? st[st.length - k] : d);
  while (i < s.length) {
    const [t, j] = lex(s, i); i = j; if (t === null) break;
    if (!(t && t.op !== undefined && typeof t === 'object' && !(t instanceof PName))) {
      if (t === '[') { const arr = []; let q = i; for (;;) { const [v, k] = value(s, q); q = k; if (v === ']' || v === undefined) break; arr.push(v); } i = q; st.push(arr); }
      else if (t === '<<') { let q = i - 2; const [v, k] = value(s, q); i = k; st.push(v); }
      else st.push(t); if (st.length > 200) st.shift(); continue;
    }
    const op = t.op;
    switch (op) {
      case 'q': gs.push({ ctm: ctm.slice() }); break; case 'Q': if (gs.length) ctm = gs.pop().ctm; break;
      case 'cm': ctm = mul([num(6), num(5), num(4), num(3), num(2), num(1)], ctm); break;
      case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
      case 'Tf': { const n = st[st.length - 2]; if (n instanceof PName) { fname = n.n; font = setFont(n.n); } fsz = num(1); break; }
      case 'Tc': tc = num(1); break; case 'Tw': tw = num(1); break; case 'Tz': th = num(1, 100) / 100; break; case 'TL': tl = num(1); break; case 'Ts': rise = num(1); break;
      case 'Td': tlm = mul([1, 0, 0, 1, num(2), num(1)], tlm); tm = tlm; break;
      case 'TD': tl = -num(1); tlm = mul([1, 0, 0, 1, num(2), num(1)], tlm); tm = tlm; break;
      case 'Tm': tm = [num(6), num(5), num(4), num(3), num(2), num(1)]; tlm = tm; break;
      case 'T*': tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; break;
      case 'Tj': if (st[st.length - 1] instanceof PStr) show(st[st.length - 1]); break;
      case "'": tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; if (st[st.length - 1] instanceof PStr) show(st[st.length - 1]); break;
      case '"': tw = num(3); tc = num(2); tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; if (st[st.length - 1] instanceof PStr) show(st[st.length - 1]); break;
      case 'TJ': { const a = st[st.length - 1]; if (Array.isArray(a)) for (const e of a) { if (e instanceof PStr) show(e); else if (typeof e === 'number') tm = mul([1, 0, 0, 1, -e / 1000 * fsz * th, 0], tm); } break; }
      case 'Do': { const n = st[st.length - 1]; if (n instanceof PName && depth < 6) { const xo = pdf.resolve(pdf.dictOf(resources?.XObject)?.[n.n]); if (xo && xo.dict && pdf.resolve(xo.dict.Subtype)?.n === 'Form') {
          const mx = (pdf.resolve(xo.dict.Matrix) || [1, 0, 0, 1, 0, 0]).map(v => pdf.resolve(v)); const res = pdf.dictOf(xo.dict.Resources) || resources;
          try { runContent(pdf, pdf.streamData(xo), res, mul(mx, ctm), out, fontCache, depth + 1); } catch (e) { if (!(e instanceof IngestError) || e.code === 'unsupported') { if (e.code === 'unsupported') throw e; } } } } break; }
      case 'BI': { const m = /[\s]ID[\s]/g; m.lastIndex = i; const a = m.exec(s); if (!a) { i = s.length; break; } const e = /[\s]EI(?=[\s]|$)/g; e.lastIndex = a.index + a[0].length; const b = e.exec(s); i = b ? b.index + b[0].length : s.length; break; }
    }
    st.length = 0;
  }
}

// ---------- layout ----------
const BUL = /^([•‣◦▪▫●○\-–—·*]|\d{1,3}[.)])\s+/;
function buildLines(items) {
  items = items.filter(it => it.text.trim().length || it.bad); if (!items.length) return [];
  items.sort((a, b) => b.y - a.y || a.x - b.x); const lines = [];
  for (const it of items) { const L = lines.find(l => Math.abs(l.y - it.y) <= Math.max(0.35 * Math.min(l.size, it.size || l.size), 0.8)); if (L) { L.items.push(it); L.size = Math.max(L.size, it.size); } else lines.push({ y: it.y, size: it.size || 10, items: [it] }); }
  lines.sort((a, b) => b.y - a.y);
  for (const L of lines) {
    L.items.sort((a, b) => a.x - b.x); const cells = []; let cur = null;
    for (const it of L.items) {
      if (!it.text) continue;
      const gap = cur ? it.x - cur.x2 : 0;
      if (cur && gap < -it.size * 0.5) { cells.push(cur); cur = null; } // overlapping runs (e.g. overstrike) start a fresh cell
      if (!cur) { cur = { x: it.x, x2: it.x2, text: it.text, bold: it.bold, size: it.size }; continue; }
      if (gap > L.size * 1.2) { cells.push(cur); cur = { x: it.x, x2: it.x2, text: it.text, bold: it.bold, size: it.size }; continue; }
      const needSpace = gap > L.size * 0.18 && !/\s$/.test(cur.text) && !/^\s/.test(it.text);
      cur.text += (needSpace ? ' ' : '') + it.text; cur.x2 = it.x2; cur.bold = cur.bold && it.bold;
    }
    if (cur) cells.push(cur);
    L.cells = cells.map(c => ({ ...c, text: normLine(c.text) })).filter(c => c.text); L.x = L.cells[0]?.x ?? 0; L.text = L.cells.map(c => c.text).join(' ');
    L.bold = L.cells.length > 0 && L.cells.every(c => c.bold);
  }
  return lines.filter(l => l.cells.length);
}
function pageBlocks(lines, bodySize) {
  const blocks = []; let i = 0;
  const colsOf = L => L.cells.map(c => (c.x + c.x2) / 2);
  const flow = lines.filter(l => l.cells.length < 2); // lines that are not table rows
  const left = Math.min(...flow.map(l => l.x), Infinity), right = Math.max(...flow.map(l => l.cells[l.cells.length - 1].x2), -Infinity);
  const full = l => l.cells[l.cells.length - 1].x2 >= right - 6 * l.size; // reaches the right margin => the text wrapped here
  const indented = l => l.cells.length < 2 && l.x >= left + 0.8 * l.size;
  while (i < lines.length) {
    const L = lines[i];
    if (L.cells.length >= 2) { // table candidate: run of lines with >= 2 cells
      let j = i; while (j < lines.length && lines[j].cells.length >= 2 && (j === i || lines[j - 1].y - lines[j].y < lines[j - 1].size * 2.6)) j++;
      if (j - i >= 2) {
        const head = lines[i], centers = colsOf(head), rows = [];
        for (let k = i; k < j; k++) { const row = new Array(centers.length).fill(''); for (const c of lines[k].cells) { const cx = (c.x + c.x2) / 2; let b = 0; centers.forEach((ct, q) => { if (Math.abs(ct - cx) < Math.abs(centers[b] - cx)) b = q; }); row[b] = (row[b] ? row[b] + ' ' : '') + c.text; } rows.push(row); }
        const [headers, ...rest] = rows; blocks.push({ type: 'table', headers, rows: rest, text: tableText(headers, rest), size: head.size }); i = j; continue;
      }
    }
    const marked = BUL.test(L.text), next = lines[i + 1];
    const unmarked = !marked && indented(L) && !full(L) && next && indented(next) && Math.abs(next.x - L.x) < 2 && L.y - next.y <= L.size * 1.9; // list drawn with vector bullets (no marker glyph in the text layer)
    if (marked || unmarked) {
      const items = []; let k = i, prevFull = false; const textX = L.x;
      for (; k < lines.length; k++) {
        const l = lines[k]; if (k > i && l.cells.length >= 2) break; if (k > i && lines[k - 1].y - l.y > lines[k - 1].size * 1.9) break;
        if (marked) { if (BUL.test(l.text)) items.push(l.text.replace(BUL, '')); else if (items.length && l.x > textX + 2) items[items.length - 1] += ' ' + l.text; else break; }
        else { if (!indented(l) || (!prevFull && Math.abs(l.x - L.x) > 2)) break; if (items.length && prevFull) items[items.length - 1] += ' ' + l.text; else items.push(l.text); prevFull = full(l); }
      }
      blocks.push({ type: 'list', items, text: items.map(x => '- ' + x).join('\n'), ordered: marked && /^\d/.test(L.text), size: L.size }); i = Math.max(k, i + 1); continue;
    }
    // paragraph / heading: join lines only when the previous line wrapped at the right margin (never glue separate short lines together)
    let k = i, text = L.text; const sz = L.size;
    while (k + 1 < lines.length && full(lines[k]) && lines[k + 1].cells.length < 2 && !BUL.test(lines[k + 1].text) && lines[k].y - lines[k + 1].y <= sz * 1.65 && Math.abs(lines[k + 1].size - sz) < 0.5 && lines[k + 1].bold === L.bold && indented(lines[k + 1]) === indented(L)) { k++; text += ' ' + lines[k].text; }
    const heading = text.length <= 140 && (sz >= bodySize * 1.18 || (L.bold && sz >= bodySize * 0.99 && k === i && text.length <= 90 && !/[.!?;,]$/.test(text)));
    blocks.push({ type: heading ? 'heading' : 'paragraph', text: normLine(text), size: sz }); i = k + 1;
  }
  return blocks;
}

// ---------- entry ----------
export function ingestPdf(buf, { name }) {
  if (!buf.subarray(0, 1024).toString('latin1').includes('%PDF-')) throw new IngestError('corrupt', 'not a PDF file (no %PDF header)');
  const pdf = new Pdf(buf);
  if (pdf.trailers.some(t => t.Encrypt)) throw new IngestError('encrypted', 'the PDF is encrypted; it cannot be read');
  if (!pdf.objs.size) throw new IngestError('corrupt', 'the PDF contains no objects (damaged or truncated file)');
  let root; for (const t of pdf.trailers.slice().reverse()) { root = pdf.dictOf(t.Root); if (root) break; }
  if (!root) for (const [n] of pdf.objs) { const o = pdf.dictOf(pdf.get(n)); if (o && pdf.resolve(o.Type)?.n === 'Catalog') { root = o; break; } }
  if (!root) throw new IngestError('corrupt', 'the PDF has no document catalog (damaged file)');
  const pages = []; const seen = new Set();
  const walk = (node, inherited, depth = 0) => {
    const d = pdf.dictOf(node); if (!d || depth > 40 || seen.has(d)) return; seen.add(d);
    const inh = { Resources: d.Resources ?? inherited.Resources };
    const kidsA = pdf.resolve(d.Kids);
    if (Array.isArray(kidsA)) kidsA.forEach(k => walk(k, inh, depth + 1)); else pages.push({ d, resources: pdf.dictOf(inh.Resources) || {} });
  };
  walk(root.Pages, {});
  if (!pages.length) throw new IngestError('corrupt', 'the PDF has no pages');
  const doc = newDoc({ name, type: 'pdf' }); doc.document.pageCount = pages.length;
  const info = pdf.dictOf(pdf.trailers.slice().reverse().map(t => t.Info).find(Boolean)); const it = info && pdf.resolve(info.Title);
  if (it instanceof PStr) doc.document.title = normLine(it.s.startsWith('\xFE\xFF') ? Buffer.from(it.s.slice(2), 'latin1').swap16().toString('utf16le') : it.s);
  const fontCache = new Map(); const perPage = []; const sizeChars = new Map(); let glyphTotal = 0, glyphBad = 0;
  pages.forEach(({ d, resources }, idx) => {
    const out = { items: [] }; let c = pdf.resolve(d.Contents); c = Array.isArray(c) ? c.map(x => pdf.resolve(x)) : c ? [c] : [];
    const data = Buffer.concat(c.filter(x => x && x.dict).flatMap(x => [pdf.streamData(x), Buffer.from('\n')]));
    runContent(pdf, data, resources, [1, 0, 0, 1, 0, 0], out, fontCache);
    for (const x of out.items) { glyphTotal += x.total; glyphBad += x.bad; if (x.text.trim()) sizeChars.set(Math.round(x.size * 2) / 2, (sizeChars.get(Math.round(x.size * 2) / 2) || 0) + x.text.length); }
    perPage.push(out.items);
  });
    const readable = perPage.flat().filter(x => x.text.trim()).length;
  if (!readable) throw new IngestError('no-text', glyphBad ? 'the PDF text uses fonts with no Unicode mapping, so it cannot be read reliably; no text was guessed' : 'the PDF has no extractable text (scanned or image-only?). FilmDeck does not run OCR; supply a text-based PDF');
  let bodySize = 10, best = 0; for (const [sz, n] of sizeChars) if (n > best) { best = n; bodySize = sz; }
  const headSizes = [...new Set(perPage.flat().map(x => Math.round(x.size * 2) / 2))].filter(z => z >= bodySize * 1.18).sort((a, b) => b - a);
  perPage.forEach((items, idx) => {
    const num = idx + 1, loc = { id: `page-${num}`, kind: 'page', number: num };
    const blocks = pageBlocks(buildLines(items), bodySize);
    if (!blocks.length) { (doc.document.pagesWithoutText ||= []).push(num); const bad = items.reduce((n, x) => n + x.bad, 0); doc.warnings.push(bad ? `page ${num}: its text uses fonts with no readable Unicode mapping (${bad} glyphs); nothing was guessed` : `page ${num} has no extractable text`); return; }
    blocks.forEach((b, k) => {
      const sec = { id: `page-${num}-b${k + 1}`, type: b.type, ...(b.type === 'heading' ? { level: Math.min(3, Math.max(1, headSizes.findIndex(z => z <= b.size + 0.01) + 1 || 3)) } : {}), text: b.text };
      if (b.type === 'table') { sec.headers = b.headers; sec.rows = b.rows; } if (b.type === 'list') { sec.items = b.items; sec.ordered = b.ordered; }
      doc.sections.push({ ...sec, location: loc });
    });
  });
  if (glyphBad) doc.warnings.push(`${glyphBad} of ${glyphTotal} glyphs had no Unicode mapping; those inside otherwise readable text are shown as U+FFFD (not guessed)`);
  if (!doc.document.title) doc.document.title = doc.sections.find(s => s.type === 'heading')?.text || '';
  // heading path = nearest preceding heading of a shallower level on the same document
  const path = []; for (const s of doc.sections) { if (s.type === 'heading') { while (path.length && path[path.length - 1].level >= s.level) path.pop(); path.push({ level: s.level, text: s.text }); } if (path.length) s.headingPath = path.map(p => p.text); }
  return doc;
}
