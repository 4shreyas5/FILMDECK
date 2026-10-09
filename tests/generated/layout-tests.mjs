// Proves the layout QA actually catches problems: starts from a good generated deck, applies deliberate CSS damage, and requires fast QA to FAIL
// on the matching check (and to pass on the untouched deck). Needs playwright-core (FILMDECK_QA_MODULES). About 1 minute per case.
// Run: node tests/generated/layout-tests.mjs [--only <n>]
import fs from 'fs'; import os from 'os'; import path from 'path'; import { fileURLToPath } from 'url'; import { spawnSync } from 'child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), node = process.execPath;
let bad = 0; const t = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok || !d ? '' : '  (' + String(d).slice(0, 300) + ')'}`); if (!ok) bad++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-layout-'));
const gen = name => { const d = path.join(tmp, name); const r = spawnSync(node, [path.join(root, 'tools/generate-deck.mjs'), path.join(root, 'examples/generated-demo/storyboard.json'), '--out', d, '--no-qa'], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); return d; };
const qa = d => { const r = spawnSync(node, [path.join(root, 'tests/generated/qa.mjs'), d, '--mode=fast'], { encoding: 'utf8', maxBuffer: 1 << 26, env: process.env }); let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(d, 'qa-report.json'), 'utf8')); } catch {} return { status: r.status, rep }; };
const damage = (d, css) => { fs.appendFileSync(path.join(d, 'scenes.css'), '\n' + css + '\n'); const b = spawnSync(node, [path.join(root, 'tools/build-deck.mjs'), d, path.join(d, 'index.html'), '--offline'], { encoding: 'utf8' }); if (b.status !== 0) throw new Error(b.stderr); };
const failedNames = q => (q.rep ? q.rep.results.filter(x => !x.ok).map(x => x.name + ' ' + x.detail) : ['no report']).join(' || ');
const cases = [
  ['untouched deck passes fast QA with no layout warnings', null, q => q.status === 0 && q.rep.passed && q.rep.layoutWarnings === 0],
  ['text pushed beyond the stage edge is a hard failure (7c)', '.s2-cap{left:1500px !important;right:auto !important;white-space:nowrap !important}', q => q.status !== 0 && /7c layout[^|]*outside the stage|extends beyond the stage/.test(failedNames(q))],
  ['text cut off by a container with overflow hidden is a hard failure (7c)', '.s4-pil{overflow:hidden !important;height:90px !important}', q => q.status !== 0 && /7c layout/.test(failedNames(q)) && /cut off|overflows/.test(failedNames(q))],
  ['a headline far wider than its declared zone fails text fit (7d)', '.s5-h .b{font-size:520px !important}', q => q.status !== 0 && /7d text fit/.test(failedNames(q))],
  ['text that wraps beyond the zone line limit fails text fit (7d)', '.s4-pil li{font-size:88px !important}', q => q.status !== 0 && /7[cd]/.test(failedNames(q))],
  ['text outside the safe area but inside the stage is only a WARNING', '.s2-cap{left:40px !important;right:auto !important;text-align:left !important}', q => q.status === 0 && q.rep.passed && q.rep.layoutWarnings > 0 && q.rep.warnings.some(w => /outside-safe-area/.test(w))],
];
const only = process.argv.includes('--only') ? Number(process.argv[process.argv.indexOf('--only') + 1]) : null;
cases.forEach(([name, css, check], i) => { if (only !== null && only !== i) return; const d = gen('c' + i); if (css) damage(d, css); const q = qa(d); t(name, check(q), failedNames(q) + ' status=' + q.status); });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `\n${bad} FAILED` : '\nALL LAYOUT TESTS PASSED'); process.exit(bad ? 1 : 0);
