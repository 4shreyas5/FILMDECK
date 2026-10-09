// Tiny XML reader for OOXML parts. Pure data: no DTD/entity expansion beyond the 5 predefined + numeric refs, nothing is executed.
// Element names keep their prefix ("a:t"). Returns { name, attrs, children[], text? } trees.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decode = s => s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
  if (e[0] === '#') { const c = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(c); } catch { return ''; } }
  return ENT[e];
});
export function parseXml(xml) {
  const root = { name: '#root', attrs: {}, children: [] }, stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.children.push({ name: '#text', text: m[1] });
    else if (m[2]) { if (stack.length > 1) stack.pop(); }
    else if (m[3]) {
      const attrs = {}; (m[4] || '').replace(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, k, a, b) => { attrs[k] = decode(a ?? b); return ''; });
      const el = { name: m[3], attrs, children: [] }; top.children.push(el); if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) top.children.push({ name: '#text', text: decode(m[6]) });
  }
  return root;
}
export const kids = (el, name) => (el ? el.children.filter(c => c.name === name) : []);
export const kid = (el, name) => kids(el, name)[0];
export function find(el, name, out = []) { if (!el || !el.children) return out; for (const c of el.children) { if (c.name === name) out.push(c); find(c, name, out); } return out; }
