/*
 * CIDs — content addresses in the multiformats way.
 *
 * A CIDv1 is: version 1, what kind of bytes it points at (the codec), and a
 * multihash of those bytes. UCAN names every token by the CID of its DAG-CBOR
 * bytes; Q's locked files are named by SHA-256 already, so the same digest
 * becomes a `raw` CID without hashing anything again.
 *
 * UCAN writes its CIDs in base58btc (they start `zdpu`); IPFS tools and the
 * spec's own test files use base32 (`bafy…`, `bafk…`). Both are read.
 */
import { base58, unbase58 } from '../did';
import { readVarint, varint } from './varint';

export const CODEC = { raw: 0x55, dagCbor: 0x71 } as const;
const SHA2_256 = 0x12;

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

function base32(bytes: Uint8Array): string {
	let out = '';
	let bits = 0;
	let value = 0;
	for (const b of bytes) {
		value = (value << 8) | b;
		bits += 8;
		while (bits >= 5) {
			out += B32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += B32[(value << (5 - bits)) & 31];
	return out;
}

function unbase32(text: string): Uint8Array {
	const out: number[] = [];
	let bits = 0;
	let value = 0;
	for (const c of text.toLowerCase()) {
		const i = B32.indexOf(c);
		if (i < 0) throw new Error('Not base32.');
		value = (value << 5) | i;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}
	return Uint8Array.from(out);
}

export class CID {
	readonly bytes: Uint8Array;
	private constructor(bytes: Uint8Array) {
		this.bytes = bytes;
	}

	/** Checks the shape (v1, SHA-256) and wraps the bytes. */
	static fromBytes(bytes: Uint8Array): CID {
		const [version, a] = readVarint(bytes, 0);
		if (version !== 1) throw new Error('Only CIDv1 is read.');
		const [, b] = readVarint(bytes, a);
		const [hash, c] = readVarint(bytes, b);
		const [size, d] = readVarint(bytes, c);
		if (hash !== SHA2_256 || size !== 32) throw new Error('Only SHA-256 CIDs are read.');
		if (bytes.length !== d + 32) throw new Error('A CID has the wrong length.');
		return new CID(Uint8Array.from(bytes));
	}

	static fromDigest(codec: number, digest: Uint8Array): CID {
		if (digest.length !== 32) throw new Error('A SHA-256 digest is 32 bytes.');
		return new CID(Uint8Array.from([...varint(1), ...varint(codec), SHA2_256, 32, ...digest]));
	}

	static async of(bytes: Uint8Array, codec: number = CODEC.dagCbor): Promise<CID> {
		const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
		return CID.fromDigest(codec, digest);
	}

	static parse(text: string): CID {
		const t = text.trim();
		if (t.startsWith('b')) return CID.fromBytes(unbase32(t.slice(1)));
		if (t.startsWith('z')) return CID.fromBytes(unbase58(t.slice(1)));
		throw new Error('A CID must be base32 (b…) or base58btc (z…).');
	}

	get codec(): number {
		const [, a] = readVarint(this.bytes, 0);
		return readVarint(this.bytes, a)[0];
	}

	get digest(): Uint8Array {
		return this.bytes.slice(this.bytes.length - 32);
	}

	/** The digest as lowercase hex — the same text Q's file names use. */
	get hex(): string {
		return [...this.digest].map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	equals(other: CID | null | undefined): boolean {
		if (!other || other.bytes.length !== this.bytes.length) return false;
		return this.bytes.every((b, i) => b === other.bytes[i]);
	}

	/** base58btc — how UCAN writes CIDs (`zdpu…`). */
	toString(): string {
		return 'z' + base58(this.bytes);
	}

	/** base32 — how IPFS tools write CIDs (`bafy…`). */
	toBase32(): string {
		return 'b' + base32(this.bytes);
	}

	toJSON() {
		return { '/': this.toString() };
	}
}

/** The CID of a Q locked file, from the hex in its name: `content://sha256/<hex>` → `bafkrei…`. */
export function cidFromHex(hex: string): CID {
	if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('Expected 64 hex characters.');
	const digest = new Uint8Array(32);
	for (let i = 0; i < 32; i++) digest[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return CID.fromDigest(CODEC.raw, digest);
}
