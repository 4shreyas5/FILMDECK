import { text, factRef, tone, scaleSchema, scaleErrors } from './_lib.mjs';
const X0 = 620, XW = 1110;
export default {
  id: 'range-bar-chart',
  name: 'Range bar chart on one scale, gap bracket, verdict',
  source: 'Velcure scene 3',
  letterbox: false,
  titleRequired: true,
  inputsSchema: {
    type: 'object', additionalProperties: false, required: ['scale', 'rows', 'verdict'],
    properties: {
      scale: scaleSchema, axisLabel: text(40),
      rows: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['label', 'value'], properties: { label: text(24), value: factRef, tone } } },
      gap: { type: 'object', additionalProperties: false, required: ['from', 'to', 'value'], properties: {
        from: { type: 'object', additionalProperties: false, required: ['row', 'edge'], properties: { row: { type: 'integer', minimum: 0, maximum: 3 }, edge: { enum: ['lo', 'hi'] } } },
        to: { type: 'object', additionalProperties: false, required: ['row', 'edge'], properties: { row: { type: 'integer', minimum: 0, maximum: 3 }, edge: { enum: ['lo', 'hi'] } } },
        value: factRef, prefix: text(20) } },
      cards: { type: 'array', maxItems: 2, items: { type: 'object', additionalProperties: false, required: ['head', 'text'], properties: { head: text(28), text: text(80), tone } } },
      verdict: { type: 'object', additionalProperties: false, required: ['kicker', 'word', 'sub'], properties: { kicker: text(30), word: text(14), sub: text(60) } }
    }
  },
  factSlots: { 'rows[].value': 'number-or-range', 'gap.value': 'number' },
  beatCount: i => 2 + ((i.rows.length > 1 || i.gap) ? 1 : 0) + ((i.cards && i.cards.length) ? 1 : 0) + 1,
  normalize(i) { i.scale.unit ??= ''; i.scale.step ??= i.scale.majorStep; i.axisLabel ??= ''; if (i.gap) i.gap.prefix ??= 'GAP OF'; i.cards ??= []; i.rows.forEach(r => { r.tone ??= 'accent'; }); i.cards.forEach(c => { c.tone ??= 'negative'; }); },
  check(i) {
    const s = i.scale, e = scaleErrors(s, 'scale');
    if ((s.max - s.min) / s.step > 12) e.push('scale: too many grid steps (max 12)');
    const X = v => X0 + (v - s.min) / (s.max - s.min) * XW;
    i.rows.forEach((r, k) => {
      const f = r.value;
      if (f.lo < s.min || f.hi > s.max) e.push(`rows[${k}]: fact "${f.id}" lies outside scale ${s.min}..${s.max}`);
      if (X(f.hi) + 18 + f.display.length * 24 > 1810) e.push(`rows[${k}]: value label for "${f.id}" would run past x=1810; raise scale.max`);
    });
    if (i.gap) {
      const { from, to } = i.gap;
      if (from.row >= i.rows.length || to.row >= i.rows.length) e.push('gap: row index out of range');
      else if (Math.abs(from.row - to.row) !== 1) e.push('gap: from and to must be on adjacent rows');
      else {
        const edge = x => i.rows[x.row].value[x.edge], d = Math.abs(edge(to) - edge(from));
        if (Math.abs(i.gap.value.v - d) > 1e-9) e.push(`gap: fact "${i.gap.value.id}" is ${i.gap.value.v} but the drawn gap between the two edges is ${d}`);
      }
    }
    return e;
  },
  capabilities: {
    purpose: 'Compare 1 to 4 values or ranges on one shared scale, optionally with a gap bracket and cards, ending on a verdict word.',
    requiresFacts: true, supports: { items: { min: 1, max: 4, of: 'bar rows' }, cards: { min: 0, max: 2 } },
    inputTypes: ['fact-ref (number or range)', 'scale', 'text'], knownLimitations: ['one shared scale for all rows', 'gap bracket only between adjacent rows and must equal the drawn distance', 'at most 12 grid steps', 'value labels must fit left of x=1810 (raise scale.max)'],
    textZones: [{ selector: '.__C__-cd .h', role: 'card heading', maxLines: 1, maxWidth: 580 }, { selector: '.__C__-cd .p', role: 'card text', maxLines: 3, maxWidth: 580 }, { selector: '.__C__-v .b', role: 'verdict word', maxLines: 1, maxWidth: 1700 }, { selector: '.__C__-v .s', role: 'verdict sub', maxLines: 2, maxWidth: 1560 }, { selector: 'text.__C__-rl', role: 'row label', maxLines: 1, maxWidth: 480 }]
  }
};
