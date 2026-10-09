import { text, factRef, tone } from './_lib.mjs';
export default {
  id: 'big-number',
  name: 'Big number (KPI): one hero figure counts up, with context and an optional comparison',
  source: 'Velcure scene 1 counter and scene 2 readout, MBA scene 10 giant-word timing (composite; no single reference scene)',
  letterbox: false,
  titleRequired: true,
  inputsSchema: {
    type: 'object', additionalProperties: false, required: ['label', 'value', 'context'],
    properties: {
      label: text(40), value: factRef, context: text(90), tone,
      compare: { type: 'object', additionalProperties: false, required: ['label', 'value'], properties: { label: text(24), value: factRef } }
    }
  },
  factSlots: { value: 'number-or-range', 'compare.value': 'number-or-range' },
  beatCount: () => 3,
  normalize(i) { i.tone ??= 'accent'; },
  check(i) {
    const e = [];
    if (i.value.display.length > 12) e.push(`value: display "${i.value.display}" is longer than 12 characters; the hero number would not fit`);
    if (i.compare && i.compare.value.display.length > 16) e.push(`compare: display "${i.compare.value.display}" is longer than 16 characters`);
    return e;
  },
  capabilities: {
    purpose: 'Make one figure the whole point of the scene (a headline KPI), optionally against a previous value.',
    requiresFacts: true, supports: { items: { min: 1, max: 1, of: 'hero figure' } },
    inputTypes: ['fact-ref (number or range)', 'text'], knownLimitations: ['one figure per scene', 'the count-up animates the first number of the display; ranges are revealed without counting', 'display text longer than 12 characters is rejected'],
    textZones: [{ selector: '.__C__-l', role: 'label', maxLines: 1, maxWidth: 1560 }, { selector: '.__C__-n', role: 'hero number', maxLines: 1, maxWidth: 1700 }, { selector: '.__C__-c', role: 'context', maxLines: 2, maxWidth: 1560 }, { selector: '.__C__-f', role: 'comparison', maxLines: 1, maxWidth: 1560 }]
  }
};
