// ingestFile(path) -> normalized source. Detects the format from the extension, then verifies the content really is that format.
import fs from 'fs'; import path from 'path';
import { IngestError, slug } from './common.mjs'; import { ingestText } from './text.mjs'; import { ingestDocx } from './docx.mjs'; import { ingestPptx } from './pptx.mjs'; import { ingestPdf } from './pdf.mjs';
export { IngestError };
export const FORMATS = { '.pdf': 'pdf', '.pptx': 'pptx', '.docx': 'docx', '.txt': 'text', '.md': 'markdown', '.markdown': 'markdown' };
export const MAX_BYTES = 100 * 1024 * 1024;
export const detectType = file => FORMATS[path.extname(file).toLowerCase()] || null;
export function ingestBuffer(buf, name, opts = {}) {
  const type = detectType(name);
  if (!type) throw new IngestError('unsupported', `unsupported file type "${path.extname(name) || name}". Supported: ${Object.keys(FORMATS).join(' ')}` + (/\.(ppt|doc|xls|xlsx|rtf|odt|key|pages)$/i.test(name) ? ' (legacy/other Office formats must be saved as PPTX, DOCX or PDF first)' : ''));
  if (!buf.length) throw new IngestError('empty', 'the file is empty');
  if (buf.length > MAX_BYTES) throw new IngestError('too-large', `file is larger than ${MAX_BYTES / 1048576} MB`);
  const head = buf.subarray(0, 8);
  if ((type === 'pptx' || type === 'docx') && !(head[0] === 0x50 && head[1] === 0x4b)) {
    throw new IngestError('corrupt', head.readUInt32BE(0) === 0xD0CF11E0 ? `this ${type.toUpperCase()} is an old binary or password-protected Office file, not an Open XML file; save it unprotected as ${type.toUpperCase()}` : `not a valid ${type.toUpperCase()} file (it is not a ZIP container)`);
  }
  const base = path.basename(name); const o = { name: base, type };
  const doc = type === 'pdf' ? ingestPdf(buf, o) : type === 'pptx' ? ingestPptx(buf, o) : type === 'docx' ? ingestDocx(buf, o) : ingestText(buf, o);
  doc.document.id = slug(base);
  if (opts.fictional) doc.document.fictional = true;
  doc.stats = { sections: doc.sections.length, characters: doc.sections.reduce((n, s) => n + s.text.length, 0), tables: doc.sections.filter(s => s.type === 'table').length };
  return doc;
}
export const ingestFile = (file, opts) => ingestBuffer(fs.readFileSync(file), file, opts);
