// PPTX -> sections per slide (title, body blocks, tables, speaker notes). Slide number = position in the presentation's slide order.
import { readZip } from './zip.mjs'; import { parseXml, kid, kids, find } from './xml.mjs';
import { normText, normLine, tableText, newDoc, IngestError } from './common.mjs';
const SKIP_PH = new Set(['sldNum', 'dt']);
function paraText(p) { // a:p -> text; slide-number fields are auto-generated digits, not content, so they are skipped
  let s = ''; for (const c of p.children) {
    if (c.name === 'a:r') s += find(c, 'a:t').map(t => t.children.map(x => x.text || '').join('')).join('');
    else if (c.name === 'a:br') s += '\n';
    else if (c.name === 'a:fld' && !/slidenum/i.test(c.attrs.type || '')) s += find(c, 'a:t').map(t => t.children.map(x => x.text || '').join('')).join('');
  } return s;
}
const isBullet = p => { const pr = kid(p, 'a:pPr'); return !!(pr && (kid(pr, 'a:buChar') || kid(pr, 'a:buAutoNum'))); };
const rel = (zip, part) => { const rp = part.replace(/([^/]+)$/, '_rels/$1.rels'); const m = new Map(); if (zip.has(rp)) find(parseXml(zip.text(rp)), 'Relationship').forEach(r => m.set(r.attrs.Id, { target: r.attrs.Target, type: r.attrs.Type })); return m; };
const resolve = (base, t) => { if (t.startsWith('/')) return t.slice(1); const parts = base.split('/').slice(0, -1); for (const seg of t.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); } return parts.join('/'); };
function shapesOf(tree, out = []) { for (const c of tree.children) { if (c.name === 'p:sp' || c.name === 'p:graphicFrame') out.push(c); else if (c.name === 'p:grpSp') shapesOf(c, out); } return out; }
export function ingestPptx(buf, { name }) {
  const zip = readZip(buf);
  if (!zip.has('ppt/presentation.xml')) throw new IngestError('corrupt', 'not a PPTX presentation (ppt/presentation.xml is missing)');
  const pres = parseXml(zip.text('ppt/presentation.xml')), prels = rel(zip, 'ppt/presentation.xml');
  const slides = find(pres, 'p:sldId').map(s => prels.get(s.attrs['r:id'])).filter(Boolean).map(r => resolve('ppt/presentation.xml', r.target));
  if (!slides.length) throw new IngestError('empty', 'the presentation has no slides');
  const doc = newDoc({ name, type: 'pptx' }); doc.document.slideCount = slides.length;
  if (zip.has('docProps/core.xml')) { const t = find(parseXml(zip.text('docProps/core.xml')), 'dc:title')[0]; if (t) doc.document.title = normLine(t.children.map(c => c.text || '').join('')); }
  slides.forEach((part, idx) => {
    const num = idx + 1; const root = parseXml(zip.text(part)); const sld = kid(root, 'p:sld');
    const loc = { id: `slide-${num}`, kind: 'slide', number: num, ...(sld?.attrs.show === '0' ? { hidden: true } : {}) };
    const tree = find(sld, 'p:spTree')[0]; if (!tree) return; let b = 0; const secs = []; let title = '';
    const add = (id, sec) => secs.push({ id, ...sec, location: loc });
    for (const sh of shapesOf(tree)) {
      if (sh.name === 'p:graphicFrame') {
        const tbl = find(sh, 'a:tbl')[0]; if (!tbl) continue;
        const rows = kids(tbl, 'a:tr').map(tr => kids(tr, 'a:tc').map(tc => normLine(find(tc, 'a:p').map(paraText).join(' '))));
        if (!rows.length || rows.every(r => r.every(c => !c))) continue; const [headers, ...rest] = rows;
        add(`slide-${num}-b${++b}`, { type: 'table', text: tableText(headers, rest), headers, rows: rest }); continue;
      }
      const ph = find(kid(sh, 'p:nvSpPr'), 'p:ph')[0]; const pt = ph?.attrs.type || (ph ? 'body' : '');
      if (SKIP_PH.has(pt)) continue;
      const tx = kid(sh, 'p:txBody'); if (!tx) continue;
      const paras = kids(tx, 'a:p').map(p => ({ p, text: normText(paraText(p)) })).filter(x => x.text);
      if (!paras.length) continue;
      if ((pt === 'title' || pt === 'ctrTitle') && !title) { title = normLine(paras.map(x => x.text).join(' ')); add(`slide-${num}-title`, { type: 'heading', level: 1, text: title }); continue; }
      const bodyLike = ph && ['body', 'obj'].includes(pt) && paras.length > 1;
      let run = null; const flush = () => { if (!run) return; if (run.list) add(`slide-${num}-b${++b}`, { type: 'list', text: run.items.map(x => '- ' + x).join('\n'), items: run.items, ordered: false }); else add(`slide-${num}-b${++b}`, { type: 'paragraph', text: run.items.join('\n') }); run = null; };
      for (const { p, text } of paras) {
        const li = isBullet(p) || (bodyLike && !kid(kid(p, 'a:pPr'), 'a:buNone'));
        if (!run || run.list !== li) { flush(); run = { list: li, items: [] }; } run.items.push(li ? normLine(text) : text);
      }
      flush();
    }
    // speaker notes
    const nrel = [...rel(zip, part).values()].find(r => /notesSlide$/.test(r.type));
    if (nrel) {
      const nroot = parseXml(zip.text(resolve(part, nrel.target)));
      const txt = shapesOf(find(nroot, 'p:spTree')[0]).filter(sh => { const ph = find(kid(sh, 'p:nvSpPr'), 'p:ph')[0]; return ph && ph.attrs.type === 'body'; })
        .map(sh => kids(kid(sh, 'p:txBody'), 'a:p').map(paraText).join('\n')).join('\n');
      const t = normText(txt); if (t) add(`slide-${num}-notes`, { type: 'notes', text: t });
    }
    if (!secs.length) doc.warnings.push(`slide ${num} has no extractable text (image-only slide?)`);
    for (const s of secs) doc.sections.push({ ...s, ...(title && s.id !== `slide-${num}-title` ? { headingPath: [title] } : {}) });
  });
  if (!doc.sections.length) throw new IngestError('no-text', 'the presentation contains no extractable text');
  if (!doc.document.title) doc.document.title = doc.sections.find(s => s.type === 'heading')?.text || '';
  return doc;
}
