// Deterministic tests of the source ingestion layer. No network, no AI, no browser. Run: node tests/ingestion/ingestion-tests.mjs
import fs from 'fs'; import os from 'os'; import path from 'path'; import { fileURLToPath } from 'url'; import { spawn } from 'child_process'; import zlib from 'zlib';
import { ingestFile, ingestBuffer, detectType, IngestError } from '../../tools/ingest/index.mjs';
import { checkSchema } from '../../tools/schema-lite.mjs';
import { normalizedToSrc, renderPrompt, checkNormalized } from '../../tools/source-to-prompt.mjs';
import { prepareSource, runPipeline, mockCaller, gate } from '../../tools/ai/storyboard-lib.mjs';
import { zip } from './zipwrite.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), FX = f => path.join(root, 'tests/ingestion/fixtures', f);
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/source.schema.json'), 'utf8'));
const run = (a, env = process.env) => new Promise(r => { const c = spawn('node', a, { env, cwd: root }); let o = '', e = ''; c.stdout.on('data', d => o += d); c.stderr.on('data', d => e += d); c.on('close', status => r({ status, stdout: o, stderr: e })); });
let bad = 0; const t = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  (' + detail + ')'}`); if (!ok) bad++; };
const throws = (f, code) => { try { f(); return { threw: false }; } catch (e) { return { threw: true, code: e.code, msg: e.message, isIngest: e instanceof IngestError }; } };
const ing = (f, o) => ingestFile(FX(f), o); const byId = (d, id) => d.sections.find(s => s.id === id);
const textOf = d => d.sections.map(s => s.text).join('\n');
const nums = s => (s.match(/\d[\d,.]*\d|\d/g) || []);

// ---- detection ----
t('type detection by extension (case-insensitive)', detectType('a.PDF') === 'pdf' && detectType('a.pptx') === 'pptx' && detectType('a.docx') === 'docx' && detectType('a.txt') === 'text' && detectType('a.md') === 'markdown' && detectType('a.Markdown') === 'markdown');
t('unknown extensions are not detected', detectType('a.xlsx') === null && detectType('a') === null && detectType('a.doc') === null);

// ---- every fixture: schema, unique ids, locations ----
const good = ['simple.md', 'notes.txt', 'many-numbers.md', 'tables.md', 'headings-lists.md', 'simple.pdf', 'report.pdf', 'deck.pptx', 'report.docx'];
for (const f of good) {
  const d = ing(f); const errs = checkSchema(schema, d); const ids = d.sections.map(s => s.id);
  t(`${f}: matches source.schema.json`, errs.length === 0, errs.slice(0, 2).join('; '));
  t(`${f}: section ids unique and every section has a location`, new Set(ids).size === ids.length && d.sections.every(s => s.location && s.location.id && s.location.kind && s.location.number >= 1));
}
t('ingestion is deterministic (same bytes -> identical JSON)', JSON.stringify(ing('report.pdf')) === JSON.stringify(ing('report.pdf')) && JSON.stringify(ing('deck.pptx')) === JSON.stringify(ing('deck.pptx')));

// ---- markdown ----
{
  const d = ing('simple.md');
  t('markdown: front matter gives title and fictional flag', d.document.title === 'Northwind Foods pricing note' && d.document.fictional === true && d.document.type === 'markdown');
  t('markdown: headings keep level and path', byId(d, 'p1').type === 'heading' && byId(d, 'p1').level === 1 && byId(d, 'p4').type === 'heading' && byId(d, 'p4').level === 2 && byId(d, 'p5').headingPath.join('>') === 'Pricing note>Why it matters');
  t('markdown: ids are p1..pN in document order', d.sections.map(s => s.id).join() === 'p1,p2,p3,p4,p5');
  t('markdown: location.line is the line in the original file', byId(d, 'p1').location.line === 5 && byId(d, 'p3').location.line === 9, JSON.stringify(d.sections.map(s => s.location.line)));
  t('markdown: numbers kept exactly', textOf(d).includes('4.5%') && textOf(d).includes('$12.80') && textOf(d).includes('1,250,000'));
}
{
  const d = ing('headings-lists.md');
  t('markdown: bullet list is one list section with items', (() => { const l = d.sections.find(s => s.type === 'list' && !s.ordered); return l && l.items.join('|') === 'Reduce returns to 6%|Cut freight cost by $0.75|Open 3 stores'; })());
  t('markdown: ordered list is flagged ordered and list numbers are not added to the text', (() => { const l = d.sections.find(s => s.type === 'list' && s.ordered); return l && l.items.length === 3 && !/\b1\b/.test(l.text); })());
  t('markdown: heading hierarchy preserved (h1/h2/h3 paths)', byId(d, 'p5').headingPath.join('>') === 'Handbook (fictional)>Part A>A1 Goals' && d.sections.at(-1).headingPath.join('>') === 'Handbook (fictional)>Part B');
}
{
  const d = ing('tables.md'); const tb = d.sections.filter(s => s.type === 'table');
  t('markdown: pipe tables become structured tables', tb.length === 2 && tb[0].headers.join() === 'Region,Revenue ($M),Growth' && tb[0].rows.length === 3 && tb[0].rows[1].join() === 'South,1.4,12%');
  t('markdown: table text keeps header row and cell values', tb[0].text.split('\n')[0] === 'Region | Revenue ($M) | Growth' && tb[0].text.includes('West | 0.9 | 19%'));
  t('markdown: text after a table is a separate section', d.sections.some(s => s.type === 'paragraph' && s.text === 'Closing remark after the table.'));
}

// ---- plain text ----
{
  const d = ing('notes.txt'); const ps = d.sections;
  t('text: split into paragraphs p1..pN', ps.map(s => s.id).join() === 'p1,p2,p3,p4' && d.document.type === 'text');
  t('text: CRLF, tabs, repeated spaces and blank lines normalised', ps[1].text === 'Customers complained about late deliveries\nin 14 of 90 stores.' && ps[2].text === 'The team agreed to recieve weekly reports.', JSON.stringify(ps.map(s => s.text)));
  t('text: spelling and numbers are NOT corrected or changed', ps[2].text.includes('recieve') && ps[3].text.includes('12/03/2025') && ps[1].text.includes('14 of 90'));
  t('text: paragraph location is its number', ps.every((s, i) => s.location.kind === 'paragraph' && s.location.number === i + 1));
}

// ---- PDF ----
{
  const d = ing('report.pdf');
  t('pdf: page count and page numbers preserved', d.document.pageCount === 3 && [...new Set(d.sections.map(s => s.location.number))].join() === '1,2,3' && d.sections.every(s => s.location.kind === 'page' && s.id.startsWith(s.location.id + '-')));
  t('pdf: section ids and location ids are page-N-bK / page-N', byId(d, 'page-2-b3') && byId(d, 'page-2-b3').location.id === 'page-2');
  t('pdf: headings detected with level and carried as headingPath', byId(d, 'page-1-b1').type === 'heading' && byId(d, 'page-1-b1').level === 1 && byId(d, 'page-1-b3').type === 'heading' && byId(d, 'page-1-b3').level === 2 && byId(d, 'page-1-b4').headingPath.join('>') === 'Northwind Foods annual report>Highlights');
  t('pdf: bullets become a list', byId(d, 'page-1-b4').type === 'list' && byId(d, 'page-1-b4').items.length === 3);
  const tb = byId(d, 'page-2-b3');
  t('pdf: table is structured (headers + rows)', tb.type === 'table' && tb.headers.join() === 'Region,Revenue ($M),Growth' && tb.rows.map(r => r.join('/')).join() === 'North/1.9/21%,South/1.4/12%,West/0.9/19%', JSON.stringify(tb));
  t('pdf: numbers and currency kept exactly (incl. rupee sign)', textOf(d).includes('$4.2 million') && textOf(d).includes('18%') && textOf(d).includes('$3.56 million') && textOf(d).includes('₹4,200 crore') && textOf(d).includes('March 2026'));
  t('pdf: no invented numbers (all digits trace to the fixture text)', (() => { const want = '4.2 2025 18 3.56 91 100 2.4 35 6.1 1.9 21 1.4 12 0.9 19 45 4,200 3 2026'.split(' '); const got = nums(textOf(d)); return got.every(n => want.includes(n)); })(), nums(textOf(d)).join(' '));
  t('pdf: document title from the headline when the file has no title', d.document.title === 'Northwind Foods annual report');
  const s = ing('simple.pdf');
  t('pdf (hand-built, standard fonts): text, lists and headings', s.document.pageCount === 2 && byId(s, 'page-2-b3').type === 'list' && byId(s, 'page-1-b1').type === 'heading' && textOf(s).includes('9.4% to 6.1%') && textOf(s).includes('$2.35') && textOf(s).includes('$3.10'));
}

// ---- PDF structure variants (synthetic, built in the test) ----
{
  const build = () => {
    const content = zlib.deflateSync(Buffer.from('BT /F1 12 Tf 72 700 Td [(Hel) -20 (lo) -300 (world) -300 <3432> (%)] TJ ET\nBT /F1 12 Tf 72 680 Td (Second line 3.14) Tj ET', 'latin1'));
    const inner = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
    let offs = '', body = ''; inner.forEach((o, i) => { offs += `${i + 1} ${body.length} `; body += o + '\n'; });
    const stm = zlib.deflateSync(Buffer.from(offs + body, 'latin1'));
    const parts = [Buffer.from('%PDF-1.5\n'), Buffer.from(`6 0 obj\n<< /Type /ObjStm /N 4 /First ${offs.length} /Filter /FlateDecode /Length ${stm.length} >>\nstream\n`), stm, Buffer.from('\nendstream\nendobj\n'),
      Buffer.from(`5 0 obj\n<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n`), content, Buffer.from('\nendstream\nendobj\n'), Buffer.from('7 0 obj\n<< /Type /XRef /Size 8 /Root 1 0 R /W [1 2 1] /Length 0 >>\nstream\n\nendstream\nendobj\nstartxref\n0\n%%EOF\n')];
    return Buffer.concat(parts);
  };
  const d = ingestBuffer(build(), 'objstm.pdf');
  t('pdf: object streams, compressed content, hex strings and TJ kerning', d.sections.length >= 1 && textOf(d).startsWith('Hello world 42%') , JSON.stringify(textOf(d)));
  t('pdf: second line kept with its decimal number', textOf(d).includes('Second line 3.14'), JSON.stringify(textOf(d)));
  const hex = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length 0 /Filter /ASCIIHexDecode >>\nstream\n' + Buffer.from('BT /F1 12 Tf 72 700 Td (Hex ok 7%) Tj ET').toString('hex') + '>\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n', 'latin1');
  t('pdf: ASCIIHex-encoded content stream', textOf(ingestBuffer(hex, 'hex.pdf')).includes('Hex ok 7%'));
  const cid = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /DescendantFonts [<< /Subtype /CIDFontType2 /BaseFont /X /DW 500 >>] >>\nendobj\n5 0 obj\n<< /Length 40 >>\nstream\nBT /F1 12 Tf 72 700 Td <00010002> Tj ET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n', 'latin1');
  const r = throws(() => ingestBuffer(cid, 'cid.pdf'));
  t('pdf: CID font without ToUnicode is refused rather than guessed', r.threw && r.code === 'no-text' && /no Unicode mapping/.test(r.msg), r.msg);
  const big = Buffer.from('%PDF-1.4\n' + '1 0 obj\n<< /Type /Catalog /Pages 1 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n', 'latin1');
  t('pdf: self-referencing page tree terminates with a clear error', ['corrupt', 'no-text'].includes(throws(() => ingestBuffer(big, 'loop.pdf')).code));
}

// ---- PDF decompression bomb ----
{
  const bomb = zlib.deflateSync(Buffer.alloc(100 * 1024 * 1024, 32));
  const pdfb = Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Filter /FlateDecode /Length ' + bomb.length + ' >>\nstream\n', 'latin1'), bomb, Buffer.from('\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n')]);
  const r = throws(() => ingestBuffer(pdfb, 'bomb.pdf')); t('PDF stream that inflates beyond 64 MB is refused, not expanded', r.threw && r.code === 'corrupt', JSON.stringify(r));
}

// ---- PPTX ----
{
  const d = ing('deck.pptx');
  t('pptx: slide order follows the presentation, not the file names', byId(d, 'slide-1-title').text === 'Northwind Foods: Q3 review' && byId(d, 'slide-5-title').text === 'Next steps' && d.document.slideCount === 5);
  t('pptx: slide numbers preserved in location', d.sections.every(s => s.location.kind === 'slide' && s.id.startsWith(s.location.id)) && byId(d, 'slide-2-title').location.number === 2);
  t('pptx: titles are headings; body bullets are a list', byId(d, 'slide-2-title').type === 'heading' && byId(d, 'slide-2-b1').type === 'list' && byId(d, 'slide-2-b1').items.length === 3);
  t('pptx: speaker notes kept with their slide', byId(d, 'slide-2-notes').type === 'notes' && byId(d, 'slide-2-notes').text.includes('18%') && byId(d, 'slide-2-notes').location.number === 2 && byId(d, 'slide-1-notes').text.startsWith('Welcome'));
  t('pptx: tables structured', byId(d, 'slide-3-b1').type === 'table' && byId(d, 'slide-3-b1').rows.length === 3 && byId(d, 'slide-3-b1').headers[1] === 'Revenue ($M)');
  t('pptx: slide-number placeholder digits/fields are not content', !textOf(d).includes('‹#›') && !d.sections.some(s => /^\d+$/.test(s.text)));
  t('pptx: image-only slide produces a warning, not invented text', d.warnings.some(w => w.includes('slide 4')) && !d.sections.some(s => s.location.number === 4));
  t('pptx: hidden slide is flagged', byId(d, 'slide-5-b1').location.hidden === true && !byId(d, 'slide-2-b1').location.hidden);
  t('pptx: numbers exact', textOf(d).includes('$3.56 million') && textOf(d).includes('62%') && textOf(d).includes('March 2026') && textOf(d).includes('45 support staff'));
  t('pptx: slide sections carry the slide title as headingPath', byId(d, 'slide-2-b1').headingPath[0] === 'Revenue grew 18% year on year');
  t('pptx: document title from core properties', d.document.title === 'Northwind Foods Q3 review (fictional)');
}

// ---- DOCX ----
{
  const d = ing('report.docx');
  t('docx: headings keep level and path', byId(d, 'p3').type === 'heading' && byId(d, 'p3').level === 1 && byId(d, 'p5').level === 2 && byId(d, 'p6').headingPath.join('>') === 'Sales>Sales by channel', JSON.stringify(byId(d, 'p6').headingPath));
  t('docx: table structured and in document order', byId(d, 'p6').type === 'table' && byId(d, 'p6').headers.join() === 'Channel,Sales (₹ crore),Share' && byId(d, 'p6').rows[0].length === 3 && byId(d, 'p6').rows[0][1] === '2,520' && d.sections.findIndex(s => s.id === 'p6') > d.sections.findIndex(s => s.id === 'p5'));
  t('docx: list items grouped', byId(d, 'p10').type === 'list' && byId(d, 'p10').items.join() === 'Warehouse operations,Customer support,Data analytics');
  t('docx: tracked deletions excluded, insertions kept', byId(d, 'p11').text === 'Visible inserted text.');
  t('docx: numbers exact (₹, commas, decimals, dates)', textOf(d).includes('₹4,200 crore') && textOf(d).includes('12.5%') && textOf(d).includes('8,150') && textOf(d).includes('31 March 2025'));
  t('docx: paragraph numbers recorded as location', d.sections.every((s, i) => s.location.kind === 'paragraph' && s.location.number === i + 1) && d.document.title === 'Northwind Foods annual summary (fictional)');
}

// ---- numbers & normalisation ----
{
  const d = ing('many-numbers.md'); const all = textOf(d);
  const must = ['₹4,200 crore', '12.5%', '₹3,733 crore', '38.5%', '40%', '7.25%', '12/03/2025', '31 March 2025', 'Q3 FY2025', '3.5x', '1:4', '8,150', '1,234,567.89', '0.045', '555-0142', 'INC-20931', '2.4.1', '-4 to 38', '+6.0%', '(2.5%)'];
  t('numbers: every number-like token survives byte for byte', must.every(m => all.includes(m)), must.filter(m => !all.includes(m)).join(' | '));
  const buf = Buffer.from('Price is  ₹ 4,200 crore,\t12.50%​ and 1 000.\r\n\r\n\r\n\r\nNext   line.', 'utf8');
  const n = ingestBuffer(buf, 'x.txt');
  t('normalisation: unicode spaces/tabs/zero-width/CRLF cleaned, digits and words untouched', n.sections[0].text === 'Price is ₹ 4,200 crore, 12.50% and 1 000.' && n.sections[1].text === 'Next line.', JSON.stringify(n.sections.map(s => s.text)));
}

// ---- failure behaviour ----
{
  const e = (f, code, label) => { const r = throws(() => ing(f)); t(`${label}: fails clearly (${code})`, r.threw && r.isIngest && r.code === code && r.msg.length > 10, JSON.stringify(r)); return r; };
  e('empty.txt', 'empty', 'empty file'); e('blank.md', 'empty', 'whitespace-only markdown');
  e('data.xlsx', 'unsupported', 'unsupported extension'); const lg = e('legacy.doc', 'unsupported', 'legacy .doc extension'); t('legacy message tells the user what to do', /PPTX, DOCX or PDF/.test(lg.msg));
  e('corrupt.pdf', 'corrupt', 'truncated PDF'); e('corrupt.docx', 'corrupt', 'corrupt DOCX (PK header, not a zip)'); e('corrupt.pptx', 'corrupt', 'zip that is not a presentation');
  const sc = e('scanned.pdf', 'no-text', 'scanned/image-only PDF (hand-built)'); t('scanned message says OCR is not performed', /OCR/.test(sc.msg));
  e('scanned-chromium.pdf', 'no-text', 'image-only PDF from a real PDF writer');
  t('old binary Office content under a .docx name is explained', (() => { const r = throws(() => ingestBuffer(fs.readFileSync(FX('legacy.doc')), 'x.docx')); return r.threw && r.code === 'corrupt' && /binary or password-protected/.test(r.msg); })());
  t('not-a-PDF content under a .pdf name fails', throws(() => ingestBuffer(Buffer.from('hello world, definitely not a pdf'), 'x.pdf')).code === 'corrupt');
  t('binary data under a .txt name fails instead of producing garbage', throws(() => ingestBuffer(Buffer.from([0x68, 0, 0x69, 0, 0, 1, 2]), 'x.txt')).code === 'corrupt');
  const enc = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 9 0 R >>\n%%EOF');
  t('encrypted PDF is refused', throws(() => ingestBuffer(enc, 'x.pdf')).code === 'encrypted');
  const noDoc = zip([['word/other.xml', '<a/>']]);
  t('zip without word/document.xml is not a DOCX', throws(() => ingestBuffer(noDoc, 'x.docx')).code === 'corrupt');
}

// ---- security: documents are data ----
{
  const md = '# <script>alert(1)</script>\n\n<img src=x onerror=alert(2)> and [click](javascript:alert(3))\n\n```js\nrequire("child_process").exec("touch /tmp/pwned")\n```\n';
  const d = ingestBuffer(Buffer.from(md), 'evil.md');
  t('markup and code in a document stay inert text', d.sections[0].text === '<script>alert(1)</script>' && d.sections[1].text.includes('onerror=alert(2)') && d.sections[2].text.includes('child_process') && !fs.existsSync('/tmp/pwned'));
  t('output is plain JSON data (round-trips, no functions)', JSON.stringify(JSON.parse(JSON.stringify(d))) === JSON.stringify(d));
  const bomb = zip([['word/document.xml', Buffer.alloc(80 * 1024 * 1024, 32)]], { rawSizeOverride: 80 * 1024 * 1024 });
  const r = throws(() => ingestBuffer(bomb, 'x.docx'));
  t('zip-bomb style archive is rejected, not expanded', r.threw && r.code === 'corrupt' && /too large|expands/.test(r.msg), r.msg);
  const macro = zip([['word/document.xml', '<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Plain text</w:t></w:r></w:p></w:body></w:document>'], ['word/vbaProject.bin', 'MACRO']]);
  t('docx macros are never read or run', ingestBuffer(macro, 'm.docx').sections.map(s => s.text).join() === 'Plain text');
  const xxe = zip([['word/document.xml', '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>a &x; b</w:t></w:r></w:p></w:body></w:document>']]);
  const xr = throws(() => ingestBuffer(xxe, 'x.docx')); const xt = xr.threw ? '' : ingestBuffer(xxe, 'x.docx').sections[0].text;
  t('XML external entities are not expanded', !/root:/.test(xt), xt);
}

// ---- source-to-prompt adapter ----
{
  const d = ing('deck.pptx', { fictional: true }); const p = renderPrompt(d); const p2 = renderPrompt(ing('deck.pptx', { fictional: true }));
  t('prompt: deterministic', p === p2);
  t('prompt: labelled blocks with location and verbatim text', p.includes('[slide-2-title] (slide 2 · heading)\nRevenue grew 18% year on year') && p.includes('[slide-3-b1] (slide 3 · table (first row = column headers))\nRegion | Revenue ($M) | Growth\nNorth | 1.9 | 21%'));
  t('prompt: speaker notes labelled as such', p.includes('[slide-2-notes] (slide 2 · speaker notes)\nSay the 18% figure slowly.'));
  t('prompt: fictional flag carried', p.includes('FICTIONAL: yes') && renderPrompt(ing('deck.pptx')).includes('FICTIONAL: no'));
  t('prompt: every section text appears verbatim', d.sections.every(s => p.includes(s.text)));
  const src = normalizedToSrc(d);
  t('adapter yields blocks keyed by section id', src.blocks.length === d.sections.length && src.blocks[0].id === 'slide-1-title');
  t('too-long source is refused, never summarised', throws(() => normalizedToSrc(d, { maxChars: 100 })).msg?.includes('Split the document') === true);
  t('invalid normalized source rejected', throws(() => checkNormalized({ sourceVersion: 1, document: {}, sections: [] })).threw);
}

// ---- ingestion -> existing storyboard pipeline (mock fixture, not an AI result) ----
{
  const d = ing('deck.pptx', { fictional: true }); const src = normalizedToSrc(d);
  const res = await runPipeline({ src, call: mockCaller(path.join(root, 'tests/ai/fixtures/deck.json')) });
  t('ingested pptx -> mock storyboard passes validator and grounding gates first pass', res.valid && res.firstPassValid && res.storyboard.scenes.length === 5);
  t('storyboard sources point at real slide/section ids', res.storyboard.sources.every(s => src.blocks.some(b => b.id === s.id)));
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'tests/ai/fixtures/deck.json'), 'utf8')).responses[0];
  const wrongBlock = JSON.parse(raw); wrongBlock.facts.find(f => f.id === 'online').sourceRef = 'slide-2-title';
  const g1 = gate(JSON.stringify(wrongBlock), src);
  t('fact citing a slide block that does not contain its number is rejected', g1.errors.some(e => e.category === 'ungrounded-fact' && /62/.test(e.message)));
  const fake = JSON.parse(raw); fake.sources[0].id = 'slide-9-title'; const g2 = gate(JSON.stringify(fake), src);
  t('source id that is not a section of the document is rejected', g2.errors.some(e => /slide-9-title/.test(e.message)));
  const noteFact = JSON.parse(raw); noteFact.facts.push({ id: 'n-note', kind: 'number', value: 99, display: '99%', unit: '%', sourceRef: 'slide-2-notes' });
  t('a number absent from the cited speaker notes is rejected', gate(JSON.stringify(noteFact), src).errors.some(e => e.category === 'ungrounded-fact'));
  // no-number source still produces no facts
  const nn = ingestBuffer(Buffer.from('Intro words only.\n\nSecond paragraph, no digits at all.'), 'words.txt');
  t('a document with no numbers yields sections with no digits', nn.sections.every(s => !/\d/.test(s.text)));
}

// ---- CLIs ----
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-ing-')); const out = path.join(tmp, 'a/b/out.json');
  let r = await run(['tools/ingest-source.mjs', FX('report.docx'), '--out', out]);
  t('ingest-source CLI: exit 0, writes valid JSON into a new folder', r.status === 0 && fs.existsSync(out) && checkSchema(schema, JSON.parse(fs.readFileSync(out, 'utf8'))).length === 0, r.stderr);
  const out2 = path.join(tmp, 'bad.json'); r = await run(['tools/ingest-source.mjs', FX('scanned.pdf'), '--out', out2]);
  t('ingest-source CLI: scanned PDF exits 1 with a clear message and writes no file', r.status === 1 && /no-text/.test(r.stderr) && /OCR/.test(r.stderr) && !fs.existsSync(out2), r.stderr);
  r = await run(['tools/ingest-source.mjs', FX('data.xlsx'), '--out', out2]); t('ingest-source CLI: unsupported extension exits 1', r.status === 1 && /unsupported/.test(r.stderr) && !fs.existsSync(out2));
  r = await run(['tools/ingest-source.mjs', path.join(tmp, 'nope.pdf'), '--out', out2]); t('ingest-source CLI: missing file exits 1', r.status === 1 && /not found/.test(r.stderr));
  r = await run(['tools/ingest-source.mjs']); t('ingest-source CLI: no arguments exits 2 with usage', r.status === 2 && /usage/.test(r.stderr));
  // normalized json -> prompt text
  r = await run(['tools/source-to-prompt.mjs', out]); t('source-to-prompt CLI prints labelled blocks', r.status === 0 && r.stdout.includes('[p3] (paragraph 3 · heading)'.replace('p3', 'p3')) , r.stdout.slice(0, 200));
  // generate-storyboard (mock) from the three input modes
  const sbOut = path.join(tmp, 'sb.json');
  r = await run(['tools/generate-storyboard.mjs', FX('deck.pptx'), '--fictional', '--mock', '--fixture', path.join(root, 'tests/ai/fixtures/deck.json'), '--out', sbOut]);
  t('generate-storyboard accepts a .pptx directly (mock)', r.status === 0 && /MODE: MOCK/.test(r.stdout) && fs.existsSync(sbOut), r.stderr);
  const norm = path.join(tmp, 'deck-norm.json'); await run(['tools/ingest-source.mjs', FX('deck.pptx'), '--fictional', '--out', norm]);
  const sb2 = path.join(tmp, 'sb2.json'); r = await run(['tools/generate-storyboard.mjs', norm, '--mock', '--fixture', path.join(root, 'tests/ai/fixtures/deck.json'), '--out', sb2]);
  t('generate-storyboard accepts normalized source JSON (mock)', r.status === 0 && fs.readFileSync(sb2, 'utf8') === fs.readFileSync(sbOut, 'utf8'), r.stderr);
  r = await run(['tools/generate-storyboard.mjs', path.join(root, 'examples/ai-inputs/01-saas-churn.md'), '--mock', '--out', path.join(tmp, 'sb3.json')]);
  t('existing plain-text/markdown workflow unchanged (mock, input 01)', r.status === 0 && /attempt 0 \(generate\): VALID/.test(r.stdout), r.stdout + r.stderr);
  r = await run(['tools/generate-storyboard.mjs', FX('scanned.pdf'), '--mock', '--out', path.join(tmp, 'sb4.json')]);
  t('generate-storyboard reports ingestion failure (exit 1, no file)', r.status === 1 && /INPUT FAILED/.test(r.stderr) && !fs.existsSync(path.join(tmp, 'sb4.json')));
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(bad ? `\n${bad} FAILED` : '\nALL INGESTION TESTS PASSED'); process.exit(bad ? 1 : 0);
