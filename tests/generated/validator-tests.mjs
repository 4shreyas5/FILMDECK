// Negative tests: each mutation of the demo storyboard must be rejected (or warned) by tools/validate-storyboard.mjs.
// usage: node tests/generated/validator-tests.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { validateStoryboard } from '../../tools/validate-storyboard.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = JSON.parse(fs.readFileSync(path.join(root, 'examples/generated-demo/storyboard.json'), 'utf8'));
const mut = f => { const s = JSON.parse(JSON.stringify(base)); f(s); return s; };
const sc = (s, id) => s.scenes.find(x => x.id === id), fact = (s, id) => s.facts.find(x => x.id === id);
const cases = [
  ['baseline demo is valid', s => {}, null],
  ['invented number in a title', s => { sc(s, 'problem').title = 'Churn rose by 73% this year.'; }, /number "73" is not in any fact display/],
  ['invented number in a recipe label', s => { sc(s, 'problem').inputs.caption = 'Up 40% in one year.'; }, /number "40"/],
  ['invented number in speaker notes', s => { sc(s, 'cause').beats[0].notes = 'We lose 5000 riders a year.'; }, /5000/],
  ['invented number in a card', s => { sc(s, 'cause').inputs.cards[0].text = 'Switching takes 3 minutes.'; }, /number "3"/],
  ['number in closing caption', s => { sc(s, 'closing').inputs.caption = 'SINCE 1999'; }, /1999/],
  ['fact without a source', s => { delete fact(s, 'churn-now').sourceRef; }, /needs a sourceRef/],
  ['fact with unknown source', s => { fact(s, 'churn-now').sourceRef = 'slide-99'; }, /not in sources/],
  ['recipe references unknown fact', s => { sc(s, 'problem').inputs.after = { fact: 'does-not-exist' }; }, /unknown fact/],
  ['derived fact with wrong value', s => { fact(s, 'price-gap').value = 12; }, /does not equal diff/],
  ['derived fact referencing a missing range edge', s => { fact(s, 'price-gap').derivation.of = ['rival-cut', 'our-discount.hi']; }, /is a range/],
  ['gap fact not equal to drawn gap', s => { sc(s, 'cause').inputs.gap.from.row = 0; sc(s, 'cause').inputs.gap.to.row = 1; sc(s, 'cause').inputs.gap.from.edge = 'lo'; sc(s, 'cause').inputs.gap.to.edge = 'lo'; }, /drawn gap/],
  ['value outside the declared scale', s => { fact(s, 'churn-now').value = 18; fact(s, 'churn-now').display = '18%'; }, /outside scale/],
  ['html in text', s => { sc(s, 'problem').inputs.caption = '<b>bold</b>'; }, /markup characters/],
  ['script-like text', s => { sc(s, 'problem').inputs.caption = 'run `x` now'; }, /backtick/],
  ['template placeholder', s => { sc(s, 'problem').inputs.caption = 'hello ${evil}'; }, /placeholder/],
  ['arrow function in notes', s => { sc(s, 'problem').beats[0].notes = 'x => alert(1)'; }, /arrow function/],
  ['em-dash in text', s => { sc(s, 'problem').inputs.caption = 'More riders — every month.'; }, /em-dash/],
  ['executable key (js) on a scene', s => { sc(s, 'problem').js = 'alert(1)'; }, /unknown property "js"/],
  ['html key on a scene', s => { sc(s, 'problem').html = '<div></div>'; }, /unknown property "html"/],
  ['css key on the deck', s => { s.deck.css = 'body{}'; }, /unknown property "css"/],
  ['unknown extra key inside recipe inputs', s => { sc(s, 'problem').inputs.onclick = 'x'; }, /unknown property "onclick"/],
  ['unknown recipe', s => { sc(s, 'problem').recipe = 'decision-tree'; }, /unknown or not-yet-parameterised recipe/],
  ['beat count mismatch', s => { sc(s, 'problem').beats.pop(); }, /produces 3 beats/],
  ['beat numbering', s => { sc(s, 'problem').beats[1].n = 7; }, /n must be 2/],
  ['missing required recipe input', s => { delete sc(s, 'problem').inputs.labelAfter; }, /missing required "labelAfter"/],
  ['title missing where required', s => { delete sc(s, 'problem').title; }, /needs a title/],
  ['title too long', s => { sc(s, 'problem').title = 'One two three four five six seven eight nine'; }, /longer than 8 words/],
  ['too many pillars', s => { sc(s, 'framework').inputs.pillars.push({ heading: 'X', items: ['y'] }); }, /allows at most 3/],
  ['fictional source without deck flag', s => { s.deck.fictional = false; }, /deck.fictional is not true/],
  ['fictional deck not labelled', s => { s.deck.subtitle = 'Harbor Bikes'; s.deck.intro = 'A story about riders and bikes for the board.'; }, /must say the content is fictional/],
  ['display disagrees with value (warning)', s => { fact(s, 'churn-now').display = '12%'; }, /does not contain the number 11/, 'warn'],
  ['label would not fit the chart', s => { fact(s, 'rival-cut').value.hi = 39; fact(s, 'rival-cut').display = '20–39%'; fact(s, 'price-gap').value = 10; }, /raise scale.max/],
  ['letterbox on a middle scene (warning)', s => { sc(s, 'cause').letterbox = true; }, /letterbox is meant for/, 'warn'],
  ['duplicate scene ids', s => { sc(s, 'closing').id = 'opening'; }, /duplicate scene id/],
  ['unused fact (warning)', s => { s.facts.push({ id: 'spare', kind: 'number', value: 3, display: '3', sourceRef: 'demo-brief' }); }, /not used by any scene/, 'warn'],
];
let bad = 0;
for (const [name, f, re, level = 'error'] of cases) {
  const r = validateStoryboard(mut(f)); const list = level === 'warn' ? r.warnings : r.errors;
  const ok = re === null ? r.errors.length === 0 : list.some(m => re.test(m));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || re === null ? '' : '  (got: ' + (list.concat(r.errors).slice(0, 2).join(' | ') || 'nothing') + ')'}`); if (!ok) bad++;
}
console.log(bad ? `${bad} validator test(s) FAILED` : `all ${cases.length} validator tests passed`); process.exit(bad ? 1 : 0);
