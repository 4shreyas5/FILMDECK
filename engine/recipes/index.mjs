// Parameterised recipes. Each entry: metadata + inputs schema (<id>.mjs) and templates (<id>.scene.js / .scene.css).
import gauge from './gauge-needle.mjs'; import range from './range-bar-chart.mjs'; import pillars from './pillars-roof.mjs';
import strike from './strike-three-moves-checklist.mjs'; import close from './minimal-close.mjs';
import bigNumber from './big-number.mjs'; import comparison from './comparison.mjs'; import iconRows from './icon-rows-ranked-bars.mjs';
export const recipes = Object.fromEntries([gauge, range, pillars, strike, close, iconRows, bigNumber, comparison].map(r => [r.id, r]));
