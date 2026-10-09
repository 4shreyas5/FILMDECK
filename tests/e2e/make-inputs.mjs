// Builds the committed end-to-end inputs: the same fictional ArcDesk brief as MD, TXT, DOCX and PDF, plus the Northwind PPTX.
// DOCX needs nothing; the PDF is printed by Chromium (FILMDECK_QA_MODULES=<dir with playwright-core>). Outputs are committed.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { createRequire } from 'module';
import { zip } from '../ingestion/zipwrite.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), IN = path.join(here, 'inputs'), root = path.resolve(here, '../..');
const md = fs.readFileSync(path.join(root, 'examples/ai-inputs/01-saas-churn.md'), 'utf8');
const title = 'ArcDesk renewal problem'; const paras = md.replace(/^---[\s\S]*?\n---\n/, '').trim().split(/\n\s*\n/);
fs.writeFileSync(path.join(IN, 'arcdesk.md'), md);
fs.writeFileSync(path.join(IN, 'arcdesk.txt'), paras.join('\n\n') + '\n');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
fs.writeFileSync(path.join(IN, 'arcdesk.docx'), zip([
  ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`],
  ['docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></cp:coreProperties>`],
  ['word/document.xml', `${XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.map(p => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`]]));
fs.copyFileSync(path.join(root, 'tests/ingestion/fixtures/deck.pptx'), path.join(IN, 'northwind-q3.pptx'));
if (process.argv.includes('--pdf')) {
  const { chromium } = createRequire(path.join(process.env.FILMDECK_QA_MODULES, 'x.js'))('playwright-core');
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent(`<style>body{font-family:Arial,sans-serif;font-size:12pt} h1{font-size:26pt}</style><h1>${title}</h1>${paras.map(p => `<p>${esc(p)}</p>`).join('')}`);
  fs.writeFileSync(path.join(IN, 'arcdesk-report.pdf'), await pg.pdf({ format: 'Letter', margin: { top: '1in', bottom: '1in', left: '1in', right: '1in' } })); await b.close();
}
console.log('built e2e inputs in', IN);
