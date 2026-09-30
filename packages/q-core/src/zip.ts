/*
 * A zip, written by hand, storing only.
 *
 * Q has no dependencies and this is not the place to start: a store-only zip is
 * eighty lines, and compression would do nothing anyway. Everything in a vault
 * is already encrypted, and ciphertext does not compress — a deflate pass would
 * spend time to make the file very slightly larger.
 *
 * WHY A ZIP AT ALL. On a browser with no way to write to a folder, the only
 * road out is a download. One download per receipt would put a hundred files in
 * somebody's Downloads and ask them to sort it out. One zip is a vault you can
 * put back where it came from.
 *
 * Store-only means every byte of every file appears in the archive exactly as
 * it went in, so a person who does not trust this code can open the zip with
 * anything and see the same .dsv files.
 */

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

export interface ZipEntry {
	name: string;
	bytes: Uint8Array;
	/** When the file was last written. Defaults to now. */
	at?: Date;
}

/* CRC-32, table built once. The zip format requires it per entry. */
const TABLE = (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[i] = c >>> 0;
	}
	return t;
})();

export function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/* MS-DOS date and time, which is what a zip carries. Two seconds' resolution. */
function dosTime(d: Date): { time: number; date: number } {
	return {
		time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
		date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
	};
}

class Writer {
	private parts: Uint8Array[] = [];
	length = 0;

	push(bytes: Uint8Array) {
		this.parts.push(bytes);
		this.length += bytes.length;
	}

	u16(n: number) {
		const b = new Uint8Array(2);
		new DataView(b.buffer).setUint16(0, n & 0xffff, true);
		this.push(b);
	}

	u32(n: number) {
		const b = new Uint8Array(4);
		new DataView(b.buffer).setUint32(0, n >>> 0, true);
		this.push(b);
	}

	done(): Uint8Array {
		const out = new Uint8Array(this.length);
		let at = 0;
		for (const p of this.parts) {
			out.set(p, at);
			at += p.length;
		}
		return out;
	}
}

/** Build a zip holding these files, uncompressed. */
export function zip(entries: ZipEntry[]): Uint8Array {
	const enc = new TextEncoder();
	const w = new Writer();
	const central: { name: Uint8Array; crc: number; size: number; offset: number; time: number; date: number }[] = [];

	for (const entry of entries) {
		const name = enc.encode(entry.name);
		const { time, date } = dosTime(entry.at ?? new Date());
		const crc = crc32(entry.bytes);
		const offset = w.length;

		w.u32(LOCAL);
		w.u16(20); // version needed
		w.u16(0); // flags
		w.u16(0); // method: stored
		w.u16(time);
		w.u16(date);
		w.u32(crc);
		w.u32(entry.bytes.length); // compressed
		w.u32(entry.bytes.length); // uncompressed
		w.u16(name.length);
		w.u16(0); // extra
		w.push(name);
		w.push(entry.bytes);

		central.push({ name, crc, size: entry.bytes.length, offset, time, date });
	}

	const startOfCentral = w.length;
	for (const c of central) {
		w.u32(CENTRAL);
		w.u16(20); // version made by
		w.u16(20); // version needed
		w.u16(0); // flags
		w.u16(0); // method
		w.u16(c.time);
		w.u16(c.date);
		w.u32(c.crc);
		w.u32(c.size);
		w.u32(c.size);
		w.u16(c.name.length);
		w.u16(0); // extra
		w.u16(0); // comment
		w.u16(0); // disk
		w.u16(0); // internal attrs
		w.u32(0); // external attrs
		w.u32(c.offset);
		w.push(c.name);
	}
	const centralSize = w.length - startOfCentral;

	w.u32(END);
	w.u16(0); // this disk
	w.u16(0); // disk with central directory
	w.u16(central.length);
	w.u16(central.length);
	w.u32(centralSize);
	w.u32(startOfCentral);
	w.u16(0); // comment

	return w.done();
}

/*
 * Reading one back — for "Restore from a backup".
 *
 * Reads the central directory, so it opens what zip() writes and also what a
 * person's own tool writes if they unzipped a backup and zipped it again: a
 * stored entry is copied, a deflated one goes through the browser's own
 * DecompressionStream. Anything else is refused by name rather than guessed.
 */
export async function unzip(archive: Uint8Array): Promise<ZipEntry[]> {
	const v = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
	let end = -1;
	for (let i = archive.length - 22; i >= Math.max(0, archive.length - 22 - 0xffff); i--) {
		if (v.getUint32(i, true) === END) {
			end = i;
			break;
		}
	}
	if (end < 0) throw new Error('That is not a zip file.');
	const count = v.getUint16(end + 10, true);
	let at = v.getUint32(end + 16, true);
	const dec = new TextDecoder();
	const out: ZipEntry[] = [];
	for (let n = 0; n < count; n++) {
		if (v.getUint32(at, true) !== CENTRAL) throw new Error('The zip is damaged.');
		const method = v.getUint16(at + 10, true);
		const time = v.getUint16(at + 12, true);
		const date = v.getUint16(at + 14, true);
		const crc = v.getUint32(at + 16, true);
		const packed = v.getUint32(at + 20, true);
		const nameLen = v.getUint16(at + 28, true);
		const extraLen = v.getUint16(at + 30, true);
		const commentLen = v.getUint16(at + 32, true);
		const local = v.getUint32(at + 42, true);
		const name = dec.decode(archive.subarray(at + 46, at + 46 + nameLen));
		at += 46 + nameLen + extraLen + commentLen;
		if (name.endsWith('/')) continue;
		if (v.getUint32(local, true) !== LOCAL) throw new Error(`The zip is damaged at ${name}.`);
		const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
		const raw = archive.subarray(start, start + packed);
		let bytes: Uint8Array;
		if (method === 0) bytes = raw.slice();
		else if (method === 8) bytes = await inflate(raw);
		else throw new Error(`${name} is packed in a way this cannot open.`);
		if (crc32(bytes) !== crc) throw new Error(`${name} does not match its checksum.`);
		out.push({
			name,
			bytes,
			at: new Date(1980 + (date >> 9), ((date >> 5) & 0xf) - 1, date & 0x1f, time >> 11, (time >> 5) & 0x3f, (time & 0x1f) * 2)
		});
	}
	return out;
}

async function inflate(raw: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([raw.slice() as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}
