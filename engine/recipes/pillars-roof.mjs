import { text, tone } from './_lib.mjs';
export default {
  id: 'pillars-roof',
  name: 'Three pillars rise, roof drops on top',
  source: 'Velcure scene 7',
  letterbox: false,
  titleRequired: true,
  inputsSchema: {
    type: 'object', additionalProperties: false, required: ['pillars', 'roofLabel'],
    properties: {
      roofLabel: text(34),
      pillars: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['heading', 'items'],
        properties: { heading: text(22), tone, items: { type: 'array', minItems: 1, maxItems: 3, items: text(60) } } } }
    }
  },
  factSlots: {},
  beatCount: () => 5,
  normalize(i) { const d = ['accent', 'secondary', 'neutral']; i.pillars.forEach((p, k) => { p.tone ??= d[k]; }); },
  structuralLabels: i => i.pillars.map((_, k) => `PILLAR 0${k + 1}`), // generated index labels, not facts
  check: () => [],
  capabilities: {
    purpose: 'Three supports under one overarching idea (a framework, a strategy, three reasons).',
    requiresFacts: false, supports: { items: { min: 3, max: 3, of: 'pillars' }, bullets: { min: 1, max: 3, of: 'items per pillar' } },
    inputTypes: ['text'], knownLimitations: ['exactly three pillars', 'text only: digits are rejected unless they are fact displays, so use another recipe for numbers', 'fixed 5 beats'],
    textZones: [{ selector: '.__C__-pil .h', role: 'pillar heading', maxLines: 1, maxWidth: 340 }, { selector: '.__C__-pil li', role: 'pillar item', maxLines: 4, maxWidth: 340 }]
  }
};
