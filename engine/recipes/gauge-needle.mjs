import { text, factRef, tone, scaleSchema, scaleErrors } from './_lib.mjs';
export default {
  id: 'gauge-needle',
  name: 'Gauge needle, before to after',
  source: 'Velcure scene 2, beats 1 to 3',
  letterbox: false,
  titleRequired: true,
  inputsSchema: {
    type: 'object', additionalProperties: false, required: ['scale', 'before', 'after', 'labelBefore', 'labelAfter'],
    properties: {
      scale: scaleSchema, before: factRef, after: factRef,
      labelBefore: text(34), labelAfter: text(34), afterTone: tone, caption: text(60)
    }
  },
  factSlots: { before: 'number-or-range', after: 'number-or-range' },
  beatCount: () => 3,
  normalize(i) { i.scale.unit ??= ''; i.scale.minorStep ??= i.scale.majorStep; i.afterTone ??= 'negative'; i.caption ??= ''; },
  check(i) {
    const e = scaleErrors(i.scale, 'scale'); const s = i.scale;
    if ((s.max - s.min) / s.minorStep > 60) e.push('scale: too many minor ticks (max 60)');
    if ((s.max - s.min) / s.majorStep > 10) e.push('scale: too many major ticks (max 10)');
    for (const k of ['before', 'after']) { const f = i[k]; if (f.lo < s.min || f.hi > s.max) e.push(`${k}: fact "${f.id}" lies outside scale ${s.min}..${s.max}`); }
    return e;
  },
  capabilities: {
    purpose: 'Show one rate moving from a before value to an after value on a dial.',
    requiresFacts: true, supports: { items: { min: 2, max: 2, of: 'before and after values' } },
    inputTypes: ['fact-ref (number or range)', 'scale', 'text'], knownLimitations: ['one metric per scene', 'fixed 3 beats', 'scale limited to 60 minor and 10 major ticks', 'both values must lie inside the scale'],
    textZones: [{ selector: '.__C__-read .l', role: 'readout label', maxLines: 1, maxWidth: 700 }, { selector: '.__C__-read .n', role: 'readout number', maxLines: 1, maxWidth: 700 }, { selector: '.__C__-cap', role: 'caption', maxLines: 2, maxWidth: 1560 }]
  }
};
