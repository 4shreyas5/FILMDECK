import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: here },
  // The engine lives outside web/ and is loaded at runtime with a dynamic import, not bundled.
  headers: async () => [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Frame-Options', value: 'SAMEORIGIN' } ] }],
};
