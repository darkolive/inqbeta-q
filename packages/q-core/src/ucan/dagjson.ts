/*
 * DAG-JSON — the readable twin of DAG-CBOR. Links are {"/": "<cid>"} and bytes
 * are {"/": {"bytes": "<unpadded base64>"}}. Used to read the spec's test files
 * and to show a token to a person; tokens are never signed in this form.
 */
import { CID } from './cid';
import type { Ipld } from './cbor';

function b64(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/=+$/, '');
}

function unb64(text: string): Uint8Array {
	const clean = text.replace(/-/g, '+').replace(/_/g, '/');
	const s = atob(clean + '='.repeat((4 - (clean.length % 4)) % 4));
	return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function fromDagJson(value: unknown): Ipld {
	if (value === null || typeof value !== 'object') return value as Ipld;
	if (Array.isArray(value)) return value.map(fromDagJson);
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj);
	if (keys.length === 1 && keys[0] === '/') {
		const inner = obj['/'];
		if (typeof inner === 'string') return CID.parse(inner);
		if (inner && typeof inner === 'object' && typeof (inner as { bytes?: unknown }).bytes === 'string')
			return unb64((inner as { bytes: string }).bytes);
	}
	const out: Record<string, Ipld> = {};
	for (const k of keys) out[k] = fromDagJson(obj[k]);
	return out;
}

export function toDagJson(value: Ipld | undefined): unknown {
	if (value instanceof CID) return { '/': value.toString() };
	if (value instanceof Uint8Array) return { '/': { bytes: b64(value) } };
	if (typeof value === 'bigint') return value.toString();
	if (Array.isArray(value)) return value.map(toDagJson);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = toDagJson(v);
		return out;
	}
	return value;
}

export { b64 as base64, unb64 as unbase64 };
