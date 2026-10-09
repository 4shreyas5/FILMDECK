import { text } from './_lib.mjs';
export default {
  id: 'strike-three-moves-checklist',
  name: 'Headline with strike-through, three moves, checklist',
  source: 'Velcure scene 8',
  letterbox: false,
  titleRequired: false,
  inputsSchema: {
    type: 'object', additionalProperties: false, required: ['headlineLead', 'headlineStruck', 'sub', 'moves', 'checklist'],
    properties: {
      headlineLead: text(20), headlineStruck: text(14),
      sub: { type: 'object', additionalProperties: false, required: ['lead', 'accent'], properties: { lead: text(30), accent: text(40) } },
      moves: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['head', 'text'], properties: { head: text(18), text: text(90) } } },
      checklist: { type: 'array', minItems: 3, maxItems: 5, items: text(80) }
    }
  },
  factSlots: {},
  beatCount: () => 4,
  normalize() {},
  structuralLabels: i => i.moves.map((_, k) => `MOVE 0${k + 1}`), // generated index labels, not facts
  check: () => [],
  capabilities: {
    purpose: 'Reject a bad approach (struck-through headline), propose three moves and tick off a checklist.',
    requiresFacts: false, supports: { items: { min: 3, max: 3, of: 'moves' }, checklist: { min: 3, max: 5 } },
    inputTypes: ['text'], knownLimitations: ['exactly three moves', 'text only', 'fixed 4 beats'],
    textZones: [{ selector: '.__C__-h .a', role: 'headline lead', maxLines: 1, maxWidth: 1700 }, { selector: '.__C__-h .b', role: 'struck headline', maxLines: 1, maxWidth: 1700 }, { selector: '.__C__-s', role: 'sub line', maxLines: 2, maxWidth: 1560 }, { selector: '.__C__-cols .h', role: 'move heading', maxLines: 1, maxWidth: 480 }, { selector: '.__C__-cols .p', role: 'move text', maxLines: 4, maxWidth: 480 }, { selector: '.__C__-list .it span', role: 'checklist item', maxLines: 2, maxWidth: 1400 }]
  }
};
