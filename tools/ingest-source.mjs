#!/usr/bin/env node
// Document -> normalized source JSON. Extraction only: no AI, no network, nothing in the document is executed.
// usage: node tools/ingest-source.mjs <file.pdf|pptx|docx|txt|md> --out <normalized.json> [--fictional]
// Exit codes: 0 ok; 1 ingestion failed (message on stderr, no file written); 2 usage.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { ingestFile, IngestError } from './ingest/index.mjs'; import { checkSchema } from './schema-lite.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2); const val = n => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out'); const out = val('--out');
if (!file || !out) { console.error('usage: node tools/ingest-source.mjs <file.pdf|pptx|docx|txt|md> --out <normalized.json> [--fictional]'); process.exit(2); }
try {
  if (!fs.existsSync(file)) throw new IngestError('missing', `file not found: ${file}`);
  const doc = ingestFile(file, { fictional: args.includes('--fictional') });
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/source.schema.json'), 'utf8'));
  const errs = checkSchema(schema, doc); if (errs.length) throw new IngestError('internal', 'extractor produced an invalid source: ' + errs.slice(0, 3).join('; '));
  const ids = new Set(); for (const s of doc.sections) { if (ids.has(s.id)) throw new IngestError('internal', `duplicate section id ${s.id}`); ids.add(s.id); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  console.log(`ingested ${path.basename(file)} (${doc.document.type}): ${doc.sections.length} sections, ${doc.stats.tables} table(s), ${doc.stats.characters} characters -> ${out}`);
  doc.warnings.forEach(w => console.log('warning: ' + w));
} catch (e) {
  if (e instanceof IngestError) { console.error(`INGESTION FAILED [${e.code}]: ${e.message}`); process.exit(1); }
  console.error('INGESTION FAILED [internal]: ' + (e && e.message)); process.exit(1);
}
