import { text } from './_lib.mjs';
export default {
  id: 'minimal-close',
  name: 'Minimal close or open: serif lines, giant word with sheen',
  source: 'Velcure scene 9 (same structure as MBA scene 10)',
  letterbox: true,
  titleRequired: false,
  inputsSchema: {
    type: 'object', additionalProperties: false, required: ['line1', 'line2', 'bigWord'],
    properties: {
      variant: { enum: ['open', 'close'] }, line1: text(40), line2: text(90), emphasis: text(40), bigWord: text(16), caption: text(60), thanks: text(30)
    }
  },
  factSlots: {},
  beatCount: () => 3,
  normalize(i) { i.variant ??= 'close'; i.emphasis ??= ''; i.caption ??= ''; i.thanks ??= ''; },
  check(i) { return i.emphasis && !i.line2.includes(i.emphasis) ? ['emphasis must be a substring of line2'] : []; },
  capabilities: {
    purpose: 'Open or close the deck with two serif lines and one giant word.',
    requiresFacts: false, supports: { items: { min: 0, max: 0 } },
    inputTypes: ['text'], knownLimitations: ['text only', 'fixed 3 beats', 'the giant word must be 16 characters or fewer'],
    textZones: [{ selector: '.__C__-l1', role: 'line 1', maxLines: 1, maxWidth: 1400 }, { selector: '.__C__-l2', role: 'line 2', maxLines: 2, maxWidth: 1400 }, { selector: '.__C__-big', role: 'giant word', maxLines: 1, maxWidth: 1700 }, { selector: '.__C__-k', role: 'caption', maxLines: 1, maxWidth: 1700 }, { selector: '.__C__-ty', role: 'thanks', maxLines: 1, maxWidth: 1700 }]
  }
};
