// Small pure helpers of the unified CLI (kept separate so tests can import them without running a pipeline).
import path from 'path';
// Safe project folder name from a file name: base name only, lowercase ASCII letters/digits and single hyphens, max 40 chars.
// "../../x/MBA_Case.pptx" -> "mba-case". Never contains a path separator or dot, so it cannot leave generated/.
export function projectName(file) {
  const base = path.basename(String(file).replace(/\\/g, '/')).replace(/\.[^.]*$/, '');
  return base.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'project';
}
