// Builds the binary fixtures (PPTX, DOCX, hand-built PDFs, corrupt files) deterministically, and prints Chromium PDFs if playwright is available.
// The built files are COMMITTED, so the tests never need this script or a browser. All content is fictional ("Northwind Foods" is made up).
// Run: node tests/ingestion/make-fixtures.mjs   (PDFs from Chromium: FILMDECK_QA_MODULES=<dir with playwright-core> node ... --pdf)
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { zip } from './zipwrite.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), FX = path.join(here, 'fixtures'); fs.mkdirSync(FX, { recursive: true });
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

// ---------- PPTX ----------
const NS_P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const ph = (id, name, type, paras) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:endParaRPr/></a:p>${paras}</p:txBody></p:sp>`.replace('<a:p><a:endParaRPr/></a:p>', '');
const para = (t, bullet) => `<a:p>${bullet ? '<a:pPr><a:buChar char="•"/></a:pPr>' : ''}<a:r><a:rPr lang="en-US"/><a:t>${esc(t)}</a:t></a:r></a:p>`;
const box = (id, paras) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${paras}</p:txBody></p:sp>`;
const tbl = rows => `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="1" cy="1"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid/>${rows.map(r => `<a:tr h="1">${r.map(c => `<a:tc><a:txBody><a:bodyPr/>${para(c)}</a:txBody></a:tc>`).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
const sldNum = `<p:sp><p:nvSpPr><p:cNvPr id="20" name="Slide Number"/><p:cNvSpPr/><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:fld id="{00000000-0000-0000-0000-000000000000}" type="slidenum"><a:t>‹#›</a:t></a:fld></a:p></p:txBody></p:sp>`;
const slide = (shapes, show) => `${XML}<p:sld ${NS_P}${show === false ? ' show="0"' : ''}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:sld>`;
const notes = t => `${XML}<p:notes ${NS_P}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${ph(2, 'Slide Image', 'sldImg', '')}${ph(3, 'Notes', 'body', para(t))}${sldNum}</p:spTree></p:cSld></p:notes>`;
const slides = [
  { xml: slide(ph(2, 'Title', 'ctrTitle', para('Northwind Foods: Q3 review')) + ph(3, 'Subtitle', 'subTitle', para('Fictional demo deck, not real data')) + sldNum), notes: 'Welcome. Everything here is made up for testing.' },
  { xml: slide(ph(2, 'Title', 'title', para('Revenue grew 18% year on year')) + ph(3, 'Content', 'body', para('Revenue reached $4.2 million in Q3') + para('Up from $3.56 million in Q3 last year') + para('Online orders were 62% of sales')) + sldNum), notes: 'Say the 18% figure slowly. Online share is 62%.' },
  { xml: slide(ph(2, 'Title', 'title', para('Regional results')) + tbl([['Region', 'Revenue ($M)', 'Growth'], ['North', '1.9', '21%'], ['South', '1.4', '12%'], ['West', '0.9', '19%']]) + sldNum) },
  { xml: slide('<p:pic><p:nvPicPr><p:cNvPr id="4" name="Chart image"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill/><p:spPr/></p:pic>' + sldNum) },
  { xml: slide(ph(2, 'Title', 'title', para('Next steps')) + box(5, para('Open 3 new stores by March 2026') + para('Hire 45 support staff', false)) + sldNum, false), notes: 'Hidden backup slide.' },
];
const pptxFiles = [
  ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>`],
  ['docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Northwind Foods Q3 review (fictional)</dc:title></cp:coreProperties>`],
  ['ppt/presentation.xml', `${XML}<p:presentation ${NS_P}><p:sldIdLst>${[5, 3, 1, 2, 4].map((n, i) => `<p:sldId id="${256 + i}" r:id="rId${n}"/>`).join('')}</p:sldIdLst></p:presentation>`], // slide order deliberately != file order
  ['ppt/_rels/presentation.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`],
];
// file slideN.xml order differs from presentation order: presentation order is [5,3,1,2,4]? -> keep readable: reorder below so slide order = natural story
const order = [1, 2, 3, 4, 5]; // natural story == file order; the presentation.xml above lists file-5 first to prove order comes from the presentation, so remap content:
const storyFile = { 1: 3, 2: 4, 3: 5, 4: 2, 5: 1 }; // file slideF holds story slide S where presentation lists rId(F) at position... see mapping
// simpler: presentation lists rIds [5,3,1,2,4]; story position k (1-based) -> file index [5,3,1,2,4][k-1]; place story slide k's xml in that file.
const posToFile = [5, 3, 1, 2, 4]; const fileXml = {}, fileNotes = {};
posToFile.forEach((f, k) => { fileXml[f] = slides[k].xml; fileNotes[f] = slides[k].notes; });
for (let f = 1; f <= 5; f++) {
  pptxFiles.push([`ppt/slides/slide${f}.xml`, fileXml[f]]);
  pptxFiles.push([`ppt/slides/_rels/slide${f}.xml.rels`, `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${fileNotes[f] ? `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${f}.xml"/>` : ''}</Relationships>`]);
  if (fileNotes[f]) pptxFiles.push([`ppt/notesSlides/notesSlide${f}.xml`, notes(fileNotes[f])]);
}
fs.writeFileSync(path.join(FX, 'deck.pptx'), zip(pptxFiles));

// ---------- DOCX ----------
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const wp = (t, style, list) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${list ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}</w:pPr><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
const wt = rows => `<w:tbl><w:tblPr/><w:tblGrid/>${rows.map(r => `<w:tr>${r.map(c => `<w:tc>${wp(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
const body = [
  wp('Northwind Foods annual summary', 'Title'), wp('This document is fictional and exists only to test FilmDeck ingestion.'),
  wp('Sales', 'Heading1'), wp('Total sales were ₹4,200 crore in FY2025, an increase of 12.5% over FY2024.'),
  wp('Sales by channel', 'Heading2'), wt([['Channel', 'Sales (₹ crore)', 'Share'], ['Retail', '2,520', '60%'], ['Online', '1,260', '30%'], ['Export', '420', '10%']]),
  wp('People', 'Heading1'), wp('Headcount reached 8,150 by 31 March 2025.'),
  wp('Hiring priorities:'), wp('Warehouse operations', null, true), wp('Customer support', null, true), wp('Data analytics', null, true),
  '<w:p><w:r><w:t>Visible </w:t></w:r><w:del><w:r><w:delText>deleted </w:delText></w:r></w:del><w:ins><w:r><w:t>inserted </w:t></w:r></w:ins><w:r><w:t>text.</w:t></w:r></w:p>',
].join('');
fs.writeFileSync(path.join(FX, 'report.docx'), zip([
  ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>`],
  ['docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Northwind Foods annual summary (fictional)</dc:title></cp:coreProperties>`],
  ['word/styles.xml', `${XML}<w:styles ${W}>${[['Title', 'Title'], ['Heading1', 'heading 1'], ['Heading2', 'heading 2']].map(([i, n]) => `<w:style w:type="paragraph" w:styleId="${i}"><w:name w:val="${n}"/></w:style>`).join('')}</w:styles>`],
  ['word/document.xml', `${XML}<w:document ${W}><w:body>${body}</w:body></w:document>`],
]));

// ---------- hand-built PDFs (uncompressed, standard fonts) ----------
function pdf(pages, { image = false } = {}) { // pages: array of content strings
  const objs = []; const add = s => objs.push(s) && objs.length;
  add('<< /Type /Catalog /Pages 2 0 R >>'); add('PLACEHOLDER'); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const c of pages) {
    const cid = objs.length + 2; kids.push(`${objs.length + 1} 0 R`);
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${image ? ' /XObject << /Im0 ' + (objs.length + 3) + ' 0 R >>' : ''} >> /Contents ${cid} 0 R >>`);
    add(`<< /Length ${Buffer.byteLength(c, 'latin1')} >>\nstream\n${c}\nendstream`);
    if (image) add('<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 4 >>\nstream\n\x00\xff\xff\x00\nendstream');
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let out = '%PDF-1.4\n', offs = []; objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const T = (font, size, x, y, s) => `BT /${font} ${size} Tf ${x} ${y} Td (${s.replace(/[()\\]/g, '\\$&')}) Tj ET`;
fs.writeFileSync(path.join(FX, 'simple.pdf'), pdf([
  [T('F2', 20, 72, 700, 'Northwind Foods briefing'), T('F1', 11, 72, 670, 'This briefing is fictional and written only to test FilmDeck.'), T('F1', 11, 72, 654, 'Customer returns fell from 9.4% to 6.1% in two quarters.')].join('\n'),
  [T('F2', 16, 72, 700, 'Cost position'), T('F1', 11, 72, 670, 'Freight cost per unit is $2.35, down from $3.10.'), T('F1', 11, 72, 640, '- Fewer damaged shipments'), T('F1', 11, 72, 626, '- Larger pallets'), T('F1', 11, 72, 612, '- Two new carriers')].join('\n'),
]));
fs.writeFileSync(path.join(FX, 'scanned.pdf'), pdf(['q 400 0 0 400 100 200 cm /Im0 Do Q'], { image: true }));
fs.writeFileSync(path.join(FX, 'corrupt.pdf'), pdf([T('F1', 11, 72, 700, 'x')]).subarray(0, 140)); // truncated mid-object
fs.writeFileSync(path.join(FX, 'corrupt.docx'), Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.from('this is not a real zip archive'.repeat(8))]));
fs.writeFileSync(path.join(FX, 'corrupt.pptx'), zip([['readme.txt', 'a zip, but not a presentation']]));
fs.writeFileSync(path.join(FX, 'empty.txt'), '');
fs.writeFileSync(path.join(FX, 'blank.md'), '\n\n   \n\n');
fs.writeFileSync(path.join(FX, 'legacy.doc'), Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0]));
fs.writeFileSync(path.join(FX, 'data.xlsx'), 'not supported');
console.log('built PPTX, DOCX, simple.pdf, scanned.pdf and corrupt fixtures in', FX);

// ---------- Chromium-printed PDFs (real producer: Type0 fonts, ToUnicode, compressed streams) ----------
if (process.argv.includes('--pdf')) {
  const { createRequire } = await import('module'); const req = createRequire(path.join(process.env.FILMDECK_QA_MODULES, 'x.js')); const { chromium } = req('playwright-core');
  const css = 'body{font-family:Arial,Helvetica,sans-serif;font-size:12pt;margin:0} h1{font-size:26pt} h2{font-size:18pt} table{border-collapse:collapse;margin:10px 0} td,th{border:1px solid #444;padding:4px 10px} .pb{page-break-after:always}';
  const pages = {
    'report.pdf': `<h1>Northwind Foods annual report</h1><p>This report is fictional and exists only to test FilmDeck ingestion. Revenue was $4.2 million in 2025, up 18% from $3.56 million.</p><h2>Highlights</h2><ul><li>Customer satisfaction reached 91 out of 100</li><li>Average delivery time fell to 2.4 days</li><li>Returns dropped 35% to 6.1%</li></ul><div class="pb"></div>
      <h1>Regional results</h1><p>The table below lists revenue by region, in millions of dollars.</p><table><tr><th>Region</th><th>Revenue ($M)</th><th>Growth</th></tr><tr><td>North</td><td>1.9</td><td>21%</td></tr><tr><td>South</td><td>1.4</td><td>12%</td></tr><tr><td>West</td><td>0.9</td><td>19%</td></tr></table><p>North remained the largest region with 45% of revenue.</p><div class="pb"></div>
      <h1>Outlook</h1><p>Management expects revenue of ₹4,200 crore equivalent next year, with 3 new stores by March 2026.</p>`,
  };
  const b = await chromium.launch(); const pg = await b.newPage();
  for (const [f, html] of Object.entries(pages)) { await pg.setContent(`<style>${css}</style>${html}`); fs.writeFileSync(path.join(FX, f), await pg.pdf({ format: 'Letter', margin: { top: '1in', bottom: '1in', left: '1in', right: '1in' } })); }
  // image-only PDF (no text layer) from a real browser
  await pg.setContent('<img style="width:300px;height:200px" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">'); fs.writeFileSync(path.join(FX, 'scanned-chromium.pdf'), await pg.pdf({ format: 'Letter' }));
  await b.close(); console.log('built Chromium PDFs');
}
