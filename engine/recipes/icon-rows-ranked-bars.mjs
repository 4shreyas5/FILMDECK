import { text, factRef, tone } from './_lib.mjs';
export default {
  id: 'icon-rows-ranked-bars',
  name: 'Icon rows (before and now) then ranked bars',
  source: 'Velcure scene 2, beats 4 to 5 (icon rows) and the "functions impacted" bars',
  letterbox: false,
  titleRequired: true,
  inputsSchema: {
    type: 'object', additionalProperties: false, required: ['rows', 'ranked'],
    properties: {
      rows: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'object', additionalProperties: false, required: ['head', 'text', 'count'], properties: { head: text(14), text: text(40), count: factRef, tone } } },
      icon: { enum: ['person', 'block'] }, // what one icon stands for: 'person' only when the counts ARE people; otherwise the neutral 'block' (the default)
      stamp: text(30),
      ranked: { type: 'object', additionalProperties: false, required: ['kicker', 'items'], properties: {
        kicker: text(30), note: text(70),
        items: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['label', 'value', 'tag'], properties: { label: text(14), value: factRef, tag: text(30) } } } } }
    }
  },
  factSlots: { 'rows[].count': 'number-or-range', 'ranked.items[].value': 'number-or-range' },
  beatCount: () => 3,
  normalize(i) { i.icon ??= 'block'; i.stamp ??= ''; i.ranked.note ??= ''; i.rows.forEach((r, k) => { r.tone ??= k === 0 ? 'neutral' : 'negative'; }); },
  check(i) {
    const e = [];
    i.rows.forEach((r, k) => { if (r.count.hi < 1 || r.count.hi > 20 || r.count.hi !== Math.round(r.count.hi) || r.count.lo !== Math.round(r.count.lo)) e.push(`rows[${k}]: count fact "${r.count.id}" must be whole numbers from 1 to 20 (one icon per unit); use another recipe for large counts`); });
    const v = i.ranked.items.map(x => x.value.hi);
    for (let k = 1; k < v.length; k++) if (v[k] > v[k - 1]) e.push('ranked.items must be listed from highest to lowest value');
    if (v[0] <= 0) e.push('ranked.items: the highest value must be positive');
    i.ranked.items.forEach((x, k) => { if (x.value.display.length > 8) e.push(`ranked.items[${k}]: display "${x.value.display}" is longer than 8 characters`); });
    return e;
  },
  capabilities: {
    purpose: 'Show a change in a count with rows of unit icons (people or neutral blocks), then rank categories by size.',
    requiresFacts: true, supports: { items: { min: 2, max: 3, of: 'ranked bars' }, rows: 2 },
    inputTypes: ['fact-ref (whole-number counts 1 to 20 for icon rows)', 'fact-ref (number or range) for bars', 'text'],
    knownLimitations: ['icon "person" draws people (use it only when the counts ARE people, as in the Velcure reference); the default icon "block" is a neutral unit mark for anything else (centres, stores, tickets)', 'exactly two icon rows', 'icon counts must be whole numbers 1 to 20 (a range shows the uncertain icons hollow)', 'ranked items must be given in descending order', 'bar length is proportional to the fact value; rank numbers are not drawn (they would be unsourced digits)'],
    textZones: [{ selector: '.__C__-row .h', role: 'row caption', maxLines: 1, maxWidth: 1560 }, { selector: '.__C__-x', role: 'stamp', maxLines: 1, maxWidth: 1560 }, { selector: '.__C__-fk', role: 'ranked kicker', maxLines: 1, maxWidth: 1560 }, { selector: '.__C__-f .lb', role: 'bar label', maxLines: 1, maxWidth: 620 }, { selector: '.__C__-f .tg', role: 'bar tag', maxLines: 1, maxWidth: 900 }, { selector: '.__C__-f .vv', role: 'bar value', maxLines: 1, maxWidth: 300 }, { selector: '.__C__-src', role: 'note', maxLines: 2, maxWidth: 1560 }]
  }
};
