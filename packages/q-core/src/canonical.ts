/*
 * Canonical JSON and SHA-256 — the two things a signature and a seal must agree on.
 *
 * Two people hashing the same object must get the same bytes, so keys are sorted,
 * there is no whitespace, and undefined fields are dropped, recursively. The
 * receipt kernel re-exports these, so there is exactly one definition.
 */
export function canonical(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, v]) => v !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let s = '';
	for (const byte of b) s += String.fromCharCode(byte);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64url(text: string): Uint8Array<ArrayBuffer> {
	const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
	const out = new Uint8Array(new ArrayBuffer(s.length));
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
	return out;
}

export async function sha256(text: string): Promise<string> {
	return b64url(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}
