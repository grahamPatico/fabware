// Minimal ZIP (PKZIP 2.0) emitter — store method only, no compression.
// Enough for a SCS upload bundle (cuts/*.dxf + bom.csv + README.md +
// drawings/*.pdf) where the goal is simple bundling, not size reduction.
//
// Why no compression: DEFLATE in JavaScript is 1+ MB of code; SCS doesn't
// require zip compression and a typical project's bundle is < 100 KB
// uncompressed anyway.
//
// Format reference: https://en.wikipedia.org/wiki/ZIP_(file_format)

export interface ZipEntry {
  /** Path inside the archive, forward slashes. e.g. "cuts/base.dxf" */
  path: string;
  /** Raw contents. */
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimeDate(d: Date): { time: number; date: number } {
  // DOS time: hh (5) | mm (6) | ss/2 (5)
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  // DOS date: (year-1980) (7) | mm (4) | dd (5)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function writeU16(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
}
function writeU32(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const now = new Date();
  const dt = dosTimeDate(now);
  const enc = new TextEncoder();

  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  const records: Array<{ crc: number; size: number; offset: number; nameBytes: Uint8Array }> = [];

  let offset = 0;
  for (const e of entries) {
    const nameBytes = enc.encode(e.path);
    const crc = crc32(e.data);
    const size = e.data.length;

    // Local file header (30 bytes + name)
    const local = new Uint8Array(30 + nameBytes.length);
    writeU32(local, 0, 0x04034b50);     // signature PK\x03\x04
    writeU16(local, 4, 20);             // version needed (2.0)
    writeU16(local, 6, 0);              // flags
    writeU16(local, 8, 0);              // method (0 = store)
    writeU16(local, 10, dt.time);
    writeU16(local, 12, dt.date);
    writeU32(local, 14, crc);
    writeU32(local, 18, size);          // compressed size = uncompressed (store)
    writeU32(local, 22, size);
    writeU16(local, 26, nameBytes.length);
    writeU16(local, 28, 0);              // extra length
    local.set(nameBytes, 30);
    localChunks.push(local);
    localChunks.push(e.data);

    records.push({ crc, size, offset, nameBytes });
    offset += local.length + size;
  }

  // Central directory
  let centralSize = 0;
  for (const r of records) {
    const cd = new Uint8Array(46 + r.nameBytes.length);
    writeU32(cd, 0, 0x02014b50);  // central directory header PK\x01\x02
    writeU16(cd, 4, 20);          // version made by
    writeU16(cd, 6, 20);          // version needed
    writeU16(cd, 8, 0);           // flags
    writeU16(cd, 10, 0);          // method
    writeU16(cd, 12, dt.time);
    writeU16(cd, 14, dt.date);
    writeU32(cd, 16, r.crc);
    writeU32(cd, 20, r.size);
    writeU32(cd, 24, r.size);
    writeU16(cd, 28, r.nameBytes.length);
    writeU16(cd, 30, 0);          // extra length
    writeU16(cd, 32, 0);          // comment length
    writeU16(cd, 34, 0);          // disk number
    writeU16(cd, 36, 0);          // internal attr
    writeU32(cd, 38, 0);          // external attr
    writeU32(cd, 42, r.offset);
    cd.set(r.nameBytes, 46);
    centralChunks.push(cd);
    centralSize += cd.length;
  }

  // End of central directory record
  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, 0x06054b50);    // EOCD signature PK\x05\x06
  writeU16(eocd, 4, 0);             // disk number
  writeU16(eocd, 6, 0);             // disk where CD starts
  writeU16(eocd, 8, records.length); // entries on this disk
  writeU16(eocd, 10, records.length); // total entries
  writeU32(eocd, 12, centralSize);
  writeU32(eocd, 16, offset);       // CD offset
  writeU16(eocd, 20, 0);            // comment length

  // Concat
  let totalLen = 0;
  for (const c of localChunks) totalLen += c.length;
  for (const c of centralChunks) totalLen += c.length;
  totalLen += eocd.length;
  const out = new Uint8Array(totalLen);
  let p = 0;
  for (const c of localChunks) { out.set(c, p); p += c.length; }
  for (const c of centralChunks) { out.set(c, p); p += c.length; }
  out.set(eocd, p);
  return out;
}

export function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
