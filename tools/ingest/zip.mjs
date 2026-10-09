// Minimal ZIP reader (central directory + raw deflate) using only node:zlib. Used for PPTX/DOCX.
// Treats the archive as untrusted: caps entry count and decompressed size (zip-bomb guard); never writes entries to disk.
import zlib from 'zlib';
export class IngestError extends Error { constructor(code, message) { super(message); this.code = code; } }
const MAX_ENTRIES = 5000, MAX_ENTRY = 64 * 1024 * 1024, MAX_TOTAL = 256 * 1024 * 1024;
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new IngestError('corrupt', 'not a valid ZIP container (end-of-central-directory record not found)');
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES) throw new IngestError('corrupt', `ZIP has ${count} entries (limit ${MAX_ENTRIES})`);
  const entries = new Map(); let total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new IngestError('corrupt', 'ZIP central directory is damaged');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl); p += 46 + nl + el + cl;
    if (usize > MAX_ENTRY) throw new IngestError('corrupt', `ZIP entry "${name}" is too large`);
    total += usize; if (total > MAX_TOTAL) throw new IngestError('corrupt', 'ZIP expands beyond the allowed size');
    entries.set(name, { name, method, csize, usize, off });
  }
  return {
    names: () => [...entries.keys()],
    has: n => entries.has(n),
    read(n) {
      const e = entries.get(n); if (!e) throw new IngestError('corrupt', `missing part "${n}" in the container`);
      if (e.off + 30 > buf.length || buf.readUInt32LE(e.off) !== 0x04034b50) throw new IngestError('corrupt', `ZIP entry "${n}" is damaged`);
      const start = e.off + 30 + buf.readUInt16LE(e.off + 26) + buf.readUInt16LE(e.off + 28);
      const raw = buf.subarray(start, start + e.csize);
      try {
        if (e.method === 0) return Buffer.from(raw);
        if (e.method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: MAX_ENTRY });
      } catch (err) { throw new IngestError('corrupt', `ZIP entry "${n}" cannot be decompressed (${err.message})`); }
      throw new IngestError('corrupt', `ZIP entry "${n}" uses unsupported compression method ${e.method}`);
    },
    text(n) { return this.read(n).toString('utf8'); },
  };
}
