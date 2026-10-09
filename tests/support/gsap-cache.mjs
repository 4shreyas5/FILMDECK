// QA support: the decks load GSAP from cdnjs. For reliable (and offline-capable) browser QA the test browser serves that one URL
// from a local cache, filled from the CDN the first time it is reachable. The deck files themselves are untouched.
import fs from 'fs'; import os from 'os'; import path from 'path';
export const GSAP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
export const cacheFile = () => path.join(process.env.FILMDECK_CACHE || path.join(os.homedir(), '.cache', 'filmdeck'), 'gsap-3.12.5.min.js');
export async function installGsapRoute(page) {
  await page.route(GSAP_URL, async route => {
    const f = cacheFile();
    try { if (fs.existsSync(f)) return await route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(f) }); } catch {}
    try {
      const resp = await route.fetch({ timeout: 120000 }); const body = await resp.body();
      if (resp.ok() && body.length > 10000 && body.toString('utf8', 0, 400).includes('GSAP')) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); }
      return await route.fulfill({ response: resp, body });
    } catch { return route.continue(); }
  });
}
