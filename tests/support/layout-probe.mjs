// Deterministic bounding-box layout checks, evaluated inside the page for the active scene (no computer vision, no screenshots).
// ERRORS (fail QA): text outside the 1920x1080 stage; text clipped by its own or an ancestor's overflow; a recipe text zone that is too wide
// or wraps into too many lines. WARNINGS (reported, never fail): text outside the safe area, very large text, SVG graphics beyond the stage,
// and heavy overlap between two text elements. Geometry is measured in stage pixels (the stage may be scaled by the viewport).
// zones: [{ selector, role, maxLines, maxWidth }] declared by the recipe (engine/recipes/*.mjs `capabilities.textZones`).
export const SAFE = { x1: 110, x2: 1810, y1: 60, y2: 1000 };
export function probeScene({ zones, safe }) {
  const stage = document.getElementById('stage'), root = document.querySelector('.slide.on');
  const out = { errors: [], warnings: [], texts: 0 }; if (!stage || !root) { out.errors.push({ kind: 'no-scene', msg: 'no active scene' }); return out; }
  const sr = stage.getBoundingClientRect(), k = sr.width / 1920;
  const box = el => { const r = el.getBoundingClientRect(); return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k }; };
  // extent of the element's OWN text (not its box: a centred block is as wide as its container, its text is not)
  const textRects = el => { const rs = []; for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) { const g = document.createRange(); g.selectNodeContents(n); for (const r of g.getClientRects()) if (r.width > 0 && r.height > 0) rs.push(r); } return rs; };
  const tbox = el => { const rs = textRects(el); if (!rs.length) return box(el); const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top)), r2 = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom)); const lines = new Set(rs.map(r => Math.round(r.top / 6))).size; let y = (t - sr.top) / k, h = (b - t) / k; const lh = parseFloat(getComputedStyle(el).lineHeight);
    if (lh && h > lh * lines) { y += (h - lh * lines) / 2; h = lh * lines; } // glyph boxes are taller than a tight line-height; the layout line box is what a mask clips
    return { x: (l - sr.left) / k, y, w: (r2 - l) / k, h, lines }; };
  const eff = el => { let o = 1; for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= parseFloat(cs.opacity); } return o; };
  const ownText = el => { let t = ''; for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue; return t.trim(); };
  const desc = el => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} "${(ownText(el) || el.textContent.trim()).slice(0, 28)}"`;
  const items = [];
  for (const el of root.querySelectorAll('*')) {
    if (!ownText(el) || el.closest('canvas')) continue;
    const o = eff(el); if (o < 0.3) continue; const b = tbox(el); if (b.w < 1 || b.h < 1) continue;
    items.push({ el, b, d: desc(el) });
  }
  out.texts = items.length;
  const T = 3;
  for (const { el, b, d } of items) {
    if (b.x < -T || b.y < -T || b.x + b.w > 1920 + T || b.y + b.h > 1080 + T) { out.errors.push({ kind: 'outside-stage', msg: `${d} extends beyond the stage (${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)})` }); continue; }
    if (b.x < safe.x1 - T || b.x + b.w > safe.x2 + T || b.y < safe.y1 - T || b.y + b.h > safe.y2 + T) out.warnings.push({ kind: 'outside-safe-area', msg: `${d} is outside the safe area (${Math.round(b.x)},${Math.round(b.y)} to ${Math.round(b.x + b.w)},${Math.round(b.y + b.h)})` });
    if (b.h > 700 || b.w > 1700) out.warnings.push({ kind: 'oversized-text', msg: `${d} is very large (${Math.round(b.w)}x${Math.round(b.h)})` });
    for (let a = el; a && a !== root.parentElement; a = a.parentElement) { // clipped by overflow
      const cs = getComputedStyle(a); if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      if (a === el && a.scrollWidth !== undefined && (a.scrollWidth > a.clientWidth + 2 || a.scrollHeight > a.clientHeight + 2) && a.clientWidth > 0) { out.errors.push({ kind: 'clipped-text', msg: `${d} overflows its own box (scroll ${a.scrollWidth}x${a.scrollHeight} > client ${a.clientWidth}x${a.clientHeight})` }); break; }
      if (a === el || a === document.body) continue; const ab = box(a); if (ab.w < 1 || ab.h < 1) continue;
      const inter = !(b.x >= ab.x + ab.w || b.x + b.w <= ab.x || b.y >= ab.y + ab.h || b.y + b.h <= ab.y);
      if (inter && (b.x < ab.x - 2 || b.y < ab.y - 2 || b.x + b.w > ab.x + ab.w + 2 || b.y + b.h > ab.y + ab.h + 2)) { out.errors.push({ kind: 'clipped-text', msg: `${d} is cut off by a container with overflow hidden` }); break; }
    }
  }
  // svg graphics beyond the stage: warning only (bars and rules are allowed to animate in from outside)
  for (const el of root.querySelectorAll('svg path, svg rect, svg line, svg circle')) { if (eff(el) < 0.3) continue; const b = box(el); if (b.w < 1 && b.h < 1) continue; if (b.x < -40 || b.y < -40 || b.x + b.w > 1960 || b.y + b.h > 1120) out.warnings.push({ kind: 'graphic-outside-stage', msg: `${el.tagName.toLowerCase()} extends well beyond the stage` }); }
  // overlap between text elements that are not nested in each other
  let ov = 0;
  for (let i = 0; i < items.length && ov < 8; i++) for (let j = i + 1; j < items.length && ov < 8; j++) {
    const A = items[i], B = items[j]; if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
    const w = Math.min(A.b.x + A.b.w, B.b.x + B.b.w) - Math.max(A.b.x, B.b.x), h = Math.min(A.b.y + A.b.h, B.b.y + B.b.h) - Math.max(A.b.y, B.b.y);
    if (w > 4 && h > 4 && w * h > 0.35 * Math.min(A.b.w * A.b.h, B.b.w * B.b.h)) { out.warnings.push({ kind: 'possible-overlap', msg: `${A.d} overlaps ${B.d}` }); ov++; }
  }
  // recipe text zones (text fit)
  for (const z of zones || []) for (const el of root.querySelectorAll(z.selector)) {
    if (eff(el) < 0.3) continue; const hasText = [el, ...el.querySelectorAll('*')].some(e => ownText(e)); if (!hasText) continue; const b = tbox(el); if (b.w < 1) continue; const d = `${z.role} (${desc(el)})`;
    // zone elements may hold nested spans (e.g. a heading with a <b> label): measure the union of all text inside
    const els = [el, ...el.querySelectorAll('*')].filter(e => ownText(e)); const rects = els.flatMap(textRects);
    const w = rects.length ? (Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left))) / k : b.w;
    const cl = []; for (const r of [...rects].sort((a, c) => a.top - c.top)) { const mid = (r.top + r.bottom) / 2, hit = cl.find(c => mid >= c.top && mid <= c.bottom); if (hit) { hit.top = Math.min(hit.top, r.top); hit.bottom = Math.max(hit.bottom, r.bottom); } else cl.push({ top: r.top, bottom: r.bottom }); }
    const L = cl.length || 1;
    if (z.maxWidth && w > z.maxWidth + 4) out.errors.push({ kind: 'text-fit-width', msg: `${d} is ${Math.round(w)}px wide, limit ${z.maxWidth}` });
    if (z.maxLines && L > z.maxLines) out.errors.push({ kind: 'text-fit-lines', msg: `${d} wraps to ${L} lines, limit ${z.maxLines}` });
  }
  return out;
}
