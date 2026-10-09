import { text, factRef, tone } from './_lib.mjs';
const side = { type: 'object', additionalProperties: false, required: ['heading', 'metrics'], properties: {
  heading: text(22), tone,
  metrics: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['label', 'value'], properties: { label: text(30), value: factRef } } } } };
export default {
  id: 'comparison',
  name: 'Comparison: two options side by side, matching metrics, then a verdict line',
  source: 'Velcure scene 2 before/now rows and scene 4 blanket vs targeted (layout language: two columns, tone colours, display numerals)',
  letterbox: false,
  titleRequired: true,
  inputsSchema: {
    type: 'object', additionalProperties: false, required: ['left', 'right', 'verdict'],
    properties: { left: side, right: side, verdict: text(70) }
  },
  factSlots: { 'left.metrics[].value': 'number-or-range', 'right.metrics[].value': 'number-or-range' },
  beatCount: () => 3,
  normalize(i) { i.left.tone ??= 'secondary'; i.right.tone ??= 'accent'; },
  check(i) {
    const e = [];
    if (i.left.metrics.length !== i.right.metrics.length) e.push(`left and right must have the same number of metrics (${i.left.metrics.length} vs ${i.right.metrics.length})`);
    for (const [s, side] of [['left', i.left], ['right', i.right]]) side.metrics.forEach((m, k) => { if (m.value.display.length > 14) e.push(`${s}.metrics[${k}]: display "${m.value.display}" is longer than 14 characters`); });
    return e;
  },
  capabilities: {
    purpose: 'Put two options, groups or periods against each other on the same 1 to 3 metrics.',
    requiresFacts: true, supports: { items: { min: 1, max: 3, of: 'metrics per side (both sides equal)' } },
    inputTypes: ['fact-ref (number or range)', 'text'], knownLimitations: ['exactly two sides', 'both sides need the same number of metrics', 'no automatic winner or difference: put a derived fact in a separate scene if needed', 'value display longer than 14 characters is rejected'],
    textZones: [{ selector: '.__C__-p .h', role: 'side heading', maxLines: 1, maxWidth: 720 }, { selector: '.__C__-p .k', role: 'metric label', maxLines: 1, maxWidth: 720 }, { selector: '.__C__-p .v', role: 'metric value', maxLines: 1, maxWidth: 720 }, { selector: '.__C__-vd', role: 'verdict', maxLines: 1, maxWidth: 1560 }]
  }
};
