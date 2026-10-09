// Side-effect import: if FILMDECK_QA_MODULES is not set, use the repo-local .qa-env created by `npm run setup:qa`.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const local = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.qa-env/node_modules');
if (!process.env.FILMDECK_QA_MODULES && fs.existsSync(path.join(local, 'playwright-core'))) process.env.FILMDECK_QA_MODULES = local;
