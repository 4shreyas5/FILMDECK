#!/usr/bin/env node
// One-time setup of the browser-test tooling: installs playwright-core into .qa-env/ (git-ignored, NOT a dependency of FilmDeck itself) and downloads
// its Chromium. Afterwards every test finds it automatically; no environment variable is needed. Needs internet once.
import fs from 'fs'; import path from 'path'; import { spawnSync } from 'child_process'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), dir = path.join(root, '.qa-env'), VERSION = '1.63.0';
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'filmdeck-qa-env', private: true, dependencies: { 'playwright-core': VERSION } }, null, 2) + '\n');
let r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' }); if (r.status !== 0) process.exit(r.status || 1);
r = spawnSync(process.execPath, [path.join(dir, 'node_modules/playwright-core/cli.js'), 'install', 'chromium'], { cwd: dir, stdio: 'inherit' }); if (r.status !== 0) process.exit(r.status || 1);
console.log('\nQA tooling ready in .qa-env. Browser tests and QA now work without setting FILMDECK_QA_MODULES.');
