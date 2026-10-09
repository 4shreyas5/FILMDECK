// Builds PPTX and DOCX files from simple descriptions (test support: used to create the fictional document corpus).
import { zip } from '../ingestion/zipwrite.mjs';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const para = (t, bullet) => `<a:p>${bullet ? '<a:pPr><a:buChar char="•"/></a:pPr>' : ''}<a:r><a:rPr lang="en-US"/><a:t>${esc(t)}</a:t></a:r></a:p>`;
const ph = (id, type, paras) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${type}"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${paras}</p:txBody></p:sp>`;
const tbl = rows => `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="1" cy="1"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid/>${rows.map(r => `<a:tr h="1">${r.map(c => `<a:tc><a:txBody><a:bodyPr/>${para(c)}</a:txBody></a:tc>`).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
const sldNum = '<p:sp><p:nvSpPr><p:cNvPr id="20" name="n"/><p:cNvSpPr/><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:fld id="{0}" type="slidenum"><a:t>‹#›</a:t></a:fld></a:p></p:txBody></p:sp>';
const wrap = (shapes, tag = 'p:sld') => `${XML}<${tag} ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></${tag}>`;
// slides: [{ title, bullets[], paras[], table[][], notes, footer }]
export function pptx(slides, title) {
  const files = [['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>`],
    ['docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title></cp:coreProperties>`],
    ['ppt/presentation.xml', `${XML}<p:presentation ${NS}><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`]];
  slides.forEach((s, i) => {
    let sh = ph(2, i === 0 ? 'ctrTitle' : 'title', para(s.title));
    if (s.bullets) sh += ph(3, 'body', s.bullets.map(b => para(b, true)).join(''));
    if (s.paras) sh += `<p:sp><p:nvSpPr><p:cNvPr id="5" name="Text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${s.paras.map(t => para(t)).join('')}</p:txBody></p:sp>`;
    if (s.table) sh += tbl(s.table);
    if (s.footer) sh += ph(21, 'ftr', para(s.footer));
    files.push([`ppt/slides/slide${i + 1}.xml`, wrap(sh + sldNum)]);
    files.push([`ppt/slides/_rels/slide${i + 1}.xml.rels`, `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${s.notes ? `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${i + 1}.xml"/>` : ''}</Relationships>`]);
    if (s.notes) files.push([`ppt/notesSlides/notesSlide${i + 1}.xml`, wrap(ph(2, 'sldImg', '') + ph(3, 'body', para(s.notes)) + sldNum, 'p:notes')]);
  });
  return zip(files);
}
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const wp = (t, style, list) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${list ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}</w:pPr><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
// blocks: {title}|{h:1..3,t}|{p}|{li}|{table:[[...]]}|{raw: xml}
export function docx(blocks, title) {
  const body = blocks.map(b => b.title ? wp(b.title, 'Title') : b.h ? wp(b.t, 'Heading' + b.h) : b.li ? wp(b.li, null, true) : b.table ? `<w:tbl><w:tblPr/><w:tblGrid/>${b.table.map(r => `<w:tr>${r.map(c => `<w:tc>${wp(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>` : b.raw ? b.raw : wp(b.p)).join('');
  return zip([['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`],
    ['docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title></cp:coreProperties>`],
    ['word/styles.xml', `${XML}<w:styles ${W}>${[['Title', 'Title'], ['Heading1', 'heading 1'], ['Heading2', 'heading 2'], ['Heading3', 'heading 3']].map(([i, n]) => `<w:style w:type="paragraph" w:styleId="${i}"><w:name w:val="${n}"/></w:style>`).join('')}</w:styles>`],
    ['word/document.xml', `${XML}<w:document ${W}><w:body>${body}</w:body></w:document>`]]);
}
