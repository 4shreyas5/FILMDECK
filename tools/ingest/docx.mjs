// DOCX -> sections in document order. Reads word/document.xml (+ styles for heading detection). No macros, no embedded objects, nothing executed.
import { readZip } from './zip.mjs'; import { parseXml, kid, kids, find } from './xml.mjs';
import { normText, normLine, tableText, newDoc, IngestError } from './common.mjs';
const runText = el => { // visible text of a paragraph: w:t, tabs, breaks. Tracked deletions (w:del) are NOT visible text and are skipped.
  let s = ''; const walk = n => { for (const c of n.children) {
    if (c.name === 'w:del' || c.name === 'w:instrText' || c.name === 'w:delText') continue;
    if (c.name === 'w:t') s += c.children.map(x => x.text || '').join('');
    else if (c.name === 'w:tab') s += ' '; else if (c.name === 'w:br' || c.name === 'w:cr') s += '\n'; else if (c.name === 'w:noBreakHyphen') s += '-';
    else if (c.children && c.name !== 'w:pPr' && c.name !== 'w:rPr') walk(c);
  } }; walk(el); return s;
};
export function ingestDocx(buf, { name }) {
  const zip = readZip(buf);
  if (!zip.has('word/document.xml')) throw new IngestError('corrupt', 'not a DOCX document (word/document.xml is missing)');
  const styles = new Map();
  if (zip.has('word/styles.xml')) for (const st of find(parseXml(zip.text('word/styles.xml')), 'w:style')) styles.set(st.attrs['w:styleId'], (kid(st, 'w:name')?.attrs['w:val'] || '').toLowerCase());
  const body = kid(kid(parseXml(zip.text('word/document.xml')), 'w:document'), 'w:body');
  if (!body) throw new IngestError('corrupt', 'word/document.xml has no body');
  const doc = newDoc({ name, type: 'docx' });
  if (zip.has('docProps/core.xml')) { const t = find(parseXml(zip.text('docProps/core.xml')), 'dc:title')[0]; if (t) doc.document.title = normLine(t.children.map(c => c.text || '').join('')); }
  let n = 0; const path = []; let list = null;
  const loc = () => ({ id: `p${n}`, kind: 'paragraph', number: n });
  const add = sec => { n++; doc.sections.push({ id: `p${n}`, ...sec, location: loc(), ...(path.length ? { headingPath: [...path.map(p => p.text)] } : {}) }); };
  const flush = () => { if (list) { add({ type: 'list', text: list.items.map(x => '- ' + x).join('\n'), items: list.items, ordered: list.ordered }); list = null; } };
  const blocks = []; const collect = el => { for (const c of el.children) { if (c.name === 'w:p' || c.name === 'w:tbl') blocks.push(c); else if (c.name === 'w:sdt') collect(kid(c, 'w:sdtContent') || { children: [] }); else if (c.name === 'w:customXml') collect(c); } };
  collect(body);
  for (const b of blocks) {
    if (b.name === 'w:tbl') {
      flush();
      const rows = kids(b, 'w:tr').map(tr => kids(tr, 'w:tc').map(tc => normLine(find(tc, 'w:p').map(runText).join(' '))));
      if (!rows.length || rows.every(r => r.every(c => !c))) continue;
      const [headers, ...rest] = rows; add({ type: 'table', text: tableText(headers, rest), headers, rows: rest });
      continue;
    }
    const ppr = kid(b, 'w:pPr'); const sid = kid(ppr, 'w:pStyle')?.attrs['w:val']; const sname = styles.get(sid) || (sid || '').toLowerCase();
    const text = normText(runText(b)); if (!text) continue;
    const hm = sname.match(/^heading\s*(\d)/) || (sid || '').toLowerCase().match(/^heading(\d)/); const ol = kid(ppr, 'w:outlineLvl')?.attrs['w:val'];
    if (hm || sname === 'title' || ol !== undefined) {
      flush(); const level = hm ? +hm[1] : sname === 'title' ? 1 : +ol + 1; while (path.length && path[path.length - 1].level >= level) path.pop();
      path.push({ level, text: normLine(text) }); add({ type: 'heading', level, text: normLine(text) }); continue;
    }
    if (kid(ppr, 'w:numPr') || /list/.test(sname)) { const ordered = /number/.test(sname); if (list && list.ordered !== ordered) flush(); (list ||= { items: [], ordered }).items.push(normLine(text)); continue; }
    flush(); add({ type: 'paragraph', text });
  }
  flush();
  if (!doc.sections.length) throw new IngestError('empty', 'the document contains no text');
  if (!doc.document.title) doc.document.title = doc.sections.find(s => s.type === 'heading')?.text || '';
  if (zip.has('word/footnotes.xml') && find(parseXml(zip.text('word/footnotes.xml')), 'w:t').length) doc.warnings.push('footnotes are not extracted');
  return doc;
}
