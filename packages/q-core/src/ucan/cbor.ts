/*
 * DAG-CBOR — the byte form every UCAN is written in.
 *
 * UCAN signs bytes, not objects, so two programs must turn the same token into
 * the same bytes. DAG-CBOR is the strict subset of CBOR that guarantees it:
 * shortest integer forms, 64-bit floats only, definite lengths, string map keys
 * sorted length-first, and CIDs as tag 42. Only that subset is written, and only
 * that subset is read — anything else is refused rather than "fixed", because a
 * token that is re-encoded on the way in would no longer be the token that was
 * signed.
 *
 * The reader also hands back where each top-level item started and ended, so a
 * signature is always checked over the exact bytes that arrived.
 */
import { CID } from './cid';

/** Any value DAG-CBOR can hold. Byte strings are Uint8Array; links are CID. */
export type Ipld =
	| null
	| boolean
	| number
	| bigint
	| string
	| Uint8Array
	| CID
	| Ipld[]
	| { [key: string]: Ipld };

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder('utf-8', { fatal: true });

/** DAG-CBOR key order: shorter first, then bytewise. */
export function compareKeys(a: string, b: string): number {
	const x = utf8.encode(a);
	const y = utf8.encode(b);
	if (x.length !== y.length) return x.length - y.length;
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
	return 0;
}

class Writer {
	private chunks: number[] = [];
	head(major: number, n: number | bigint) {
		const m = major << 5;
		const v = BigInt(n);
		if (v < 24n) this.chunks.push(m | Number(v));
		else if (v < 0x100n) this.chunks.push(m | 24, Number(v));
		else if (v < 0x10000n) this.chunks.push(m | 25, Number(v >> 8n), Number(v & 0xffn));
		else if (v < 0x100000000n) {
			this.chunks.push(m | 26);
			for (let s = 24n; s >= 0n; s -= 8n) this.chunks.push(Number((v >> s) & 0xffn));
		} else {
			this.chunks.push(m | 27);
			for (let s = 56n; s >= 0n; s -= 8n) this.chunks.push(Number((v >> s) & 0xffn));
		}
	}
	raw(bytes: Uint8Array) {
		for (const b of bytes) this.chunks.push(b);
	}
	bytes() {
		return Uint8Array.from(this.chunks);
	}
}

function write(w: Writer, value: Ipld | undefined): void {
	if (value === null) return void w.raw(Uint8Array.of(0xf6));
	if (value === true) return void w.raw(Uint8Array.of(0xf5));
	if (value === false) return void w.raw(Uint8Array.of(0xf4));
	if (typeof value === 'bigint') {
		if (value >= 0n) w.head(0, value);
		else w.head(1, -1n - value);
		return;
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new Error('DAG-CBOR cannot hold NaN or Infinity.');
		if (Number.isInteger(value)) {
			if (!Number.isSafeInteger(value)) throw new Error('Integers beyond 2^53 must be given as bigint.');
			if (value >= 0) w.head(0, value);
			else w.head(1, -1 - value);
			return;
		}
		const buf = new DataView(new ArrayBuffer(9));
		buf.setUint8(0, 0xfb);
		buf.setFloat64(1, value);
		return void w.raw(new Uint8Array(buf.buffer));
	}
	if (typeof value === 'string') {
		const b = utf8.encode(value);
		w.head(3, b.length);
		return void w.raw(b);
	}
	if (value instanceof Uint8Array) {
		w.head(2, value.length);
		return void w.raw(value);
	}
	if (value instanceof CID) {
		w.head(6, 42);
		w.head(2, value.bytes.length + 1);
		w.raw(Uint8Array.of(0));
		return void w.raw(value.bytes);
	}
	if (Array.isArray(value)) {
		w.head(4, value.length);
		for (const item of value) write(w, item);
		return;
	}
	if (typeof value === 'object') {
		const entries = Object.entries(value).filter(([, v]) => v !== undefined);
		entries.sort(([a], [b]) => compareKeys(a, b));
		w.head(5, entries.length);
		for (const [k, v] of entries) {
			write(w, k);
			write(w, v);
		}
		return;
	}
	throw new Error(`DAG-CBOR cannot hold a ${typeof value}.`);
}

/** Encodes a value as DAG-CBOR. Object fields set to `undefined` are left out. */
export function encode(value: Ipld | Record<string, unknown>): Uint8Array {
	const w = new Writer();
	write(w, value as Ipld);
	return w.bytes();
}

class Reader {
	pos = 0;
	readonly data: Uint8Array;
	constructor(data: Uint8Array) {
		this.data = data;
	}

	private byte(): number {
		if (this.pos >= this.data.length) throw new Error('DAG-CBOR ended early.');
		return this.data[this.pos++];
	}
	private take(n: number): Uint8Array {
		if (this.pos + n > this.data.length) throw new Error('DAG-CBOR ended early.');
		const out = this.data.slice(this.pos, this.pos + n);
		this.pos += n;
		return out;
	}
	private arg(info: number): bigint {
		if (info < 24) return BigInt(info);
		let size: number;
		if (info === 24) size = 1;
		else if (info === 25) size = 2;
		else if (info === 26) size = 4;
		else if (info === 27) size = 8;
		else throw new Error('DAG-CBOR does not allow indefinite lengths.');
		let v = 0n;
		for (const b of this.take(size)) v = (v << 8n) | BigInt(b);
		const min = size === 1 ? 24n : size === 2 ? 0x100n : size === 4 ? 0x10000n : 0x100000000n;
		if (v < min) throw new Error('DAG-CBOR requires the shortest integer form.');
		return v;
	}
	private length(info: number): number {
		const n = this.arg(info);
		if (n > BigInt(this.data.length)) throw new Error('DAG-CBOR length is larger than the data.');
		return Number(n);
	}

	read(depth = 0): Ipld {
		if (depth > 256) throw new Error('DAG-CBOR is nested too deeply.');
		const first = this.byte();
		const major = first >> 5;
		const info = first & 0x1f;
		switch (major) {
			case 0:
			case 1: {
				const n = this.arg(info);
				const v = major === 0 ? n : -1n - n;
				return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v;
			}
			case 2:
				return this.take(this.length(info));
			case 3:
				return fromUtf8.decode(this.take(this.length(info)));
			case 4: {
				const n = this.length(info);
				const out: Ipld[] = [];
				for (let i = 0; i < n; i++) out.push(this.read(depth + 1));
				return out;
			}
			case 5: {
				const n = this.length(info);
				const out: Record<string, Ipld> = {};
				let previous: string | undefined;
				for (let i = 0; i < n; i++) {
					const key = this.read(depth + 1);
					if (typeof key !== 'string') throw new Error('DAG-CBOR map keys must be strings.');
					if (previous !== undefined && compareKeys(previous, key) >= 0)
						throw new Error('DAG-CBOR map keys must be sorted and unique.');
					previous = key;
					Object.defineProperty(out, key, { value: this.read(depth + 1), enumerable: true, writable: true, configurable: true });
				}
				return out;
			}
			case 6: {
				const tag = this.arg(info);
				if (tag !== 42n) throw new Error('DAG-CBOR allows only tag 42 (a CID).');
				const inner = this.read(depth + 1);
				if (!(inner instanceof Uint8Array) || inner[0] !== 0) throw new Error('A CID tag must hold 0x00 + CID bytes.');
				return CID.fromBytes(inner.slice(1));
			}
			case 7: {
				if (info === 20) return false;
				if (info === 21) return true;
				if (info === 22) return null;
				if (info === 27) {
					const view = new DataView(this.take(8).buffer);
					const f = view.getFloat64(0);
					if (!Number.isFinite(f)) throw new Error('DAG-CBOR cannot hold NaN or Infinity.');
					return f;
				}
				throw new Error('DAG-CBOR allows only 64-bit floats, true, false and null.');
			}
		}
		throw new Error('Unreadable DAG-CBOR.');
	}
}

/** Decodes one DAG-CBOR value; the whole input must be used. */
export function decode(bytes: Uint8Array): Ipld {
	const r = new Reader(bytes);
	const v = r.read();
	if (r.pos !== bytes.length) throw new Error('Extra bytes after the DAG-CBOR value.');
	return v;
}

/**
 * Decodes a DAG-CBOR array and also returns each element's exact bytes — so a
 * signature can be checked over what arrived, not over a re-encoding.
 */
export function decodeArrayWithSpans(bytes: Uint8Array): { items: Ipld[]; spans: Uint8Array[] } {
	const r = new Reader(bytes);
	const first = bytes[0];
	if (first === undefined || first >> 5 !== 4) throw new Error('Expected a DAG-CBOR array.');
	const count = first & 0x1f;
	if (count >= 24) throw new Error('Expected a short DAG-CBOR array.');
	r.pos = 1;
	const items: Ipld[] = [];
	const spans: Uint8Array[] = [];
	for (let i = 0; i < count; i++) {
		const start = r.pos;
		items.push(r.read(1));
		spans.push(bytes.slice(start, r.pos));
	}
	if (r.pos !== bytes.length) throw new Error('Extra bytes after the DAG-CBOR value.');
	return { items, spans };
}
