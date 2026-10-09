// Builds decks/<name> into tests/parity/build/<name>.html using the shared assembler (tools/build-deck.mjs).
// usage: node build.mjs <deck-name> [out-dir]
import path from 'path'; import { fileURLToPath } from 'url'; import { buildDeck } from '../../tools/build-deck.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const name = process.argv[2], out = process.argv[3] || path.join(root, 'tests/parity/build');
const r = buildDeck(path.join(root, 'decks', name), path.join(out, `${name}.html`)); console.log('built', r.outFile, r.bytes, 'bytes');
