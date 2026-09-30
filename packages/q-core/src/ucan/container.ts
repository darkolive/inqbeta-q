/*
 * UCAN containers (ctn-v1) — several tokens carried as one thing: a text you
 * can paste, a file you can drop, a field in a receipt.
 *
 *   <one header byte><CBOR { "ctn-v1": [token bytes, …] }, maybe gzipped, maybe base64>
 *
 * CIDs are deliberately not carried: the reader hashes every token itself, so a
 * container cannot lie about which token is which.
 */
import { decode, encode, type Ipld } from './cbor';
import { base64, unbase64 } from './dagjson';
import { UcanError } from './errors';
import { readToken, type Token } from './token';

export type ContainerFormat = 'bytes' | 'bytes+gzip' | 'base64' | 'base64+gzip' | 'base64url' | 'base64url+gzip';

const HEADERS: Record<ContainerFormat, number> = {
	bytes: 0x40,
	base64: 0x42,
	base64url: 0x43,
	'bytes+gzip': 0x4d,
	'base64+gzip': 0x4f,
	'base64url+gzip': 0x50
};
const FORMATS = Object.fromEntries(Object.entries(HEADERS).map(([k, v]) => [v, k])) as Record<number, ContainerFormat>;

async function squeeze(bytes: Uint8Array, gzip: boolean, forwards: boolean): Promise<Uint8Array> {
	if (!gzip) return bytes;
	const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
		.stream()
		.pipeThrough(forwards ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
	for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
	return a.length - b.length;
}

/** Packs tokens into a container. Text formats return a string, byte formats a Uint8Array. */
export async function writeContainer(tokens: (Token | Uint8Array)[], format: ContainerFormat = 'base64url'): Promise<string | Uint8Array> {
	const unique = new Map<string, Uint8Array>();
	for (const t of tokens) {
		const b = t instanceof Uint8Array ? t : t.bytes;
		unique.set(base64(b), b);
	}
	const list = [...unique.values()].sort(compareBytes);
	const cbor = await squeeze(encode({ 'ctn-v1': list }), format.endsWith('+gzip'), true);
	const header = HEADERS[format];
	if (format.startsWith('bytes')) {
		const out = new Uint8Array(cbor.length + 1);
		out[0] = header;
		out.set(cbor, 1);
		return out;
	}
	let text = base64(cbor);
	if (format.startsWith('base64url')) text = text.replace(/\+/g, '-').replace(/\//g, '_');
	else text += '='.repeat((4 - (text.length % 4)) % 4);
	return String.fromCharCode(header) + text;
}

/** Unpacks a container into raw token bytes (not yet checked). */
export async function readContainer(input: string | Uint8Array): Promise<Uint8Array[]> {
	let header: number;
	let body: Uint8Array;
	if (typeof input === 'string') {
		const t = input.trim();
		header = t.charCodeAt(0);
		body = unbase64(t.slice(1));
	} else {
		header = input[0];
		body = input.slice(1);
	}
	const format = FORMATS[header];
	if (!format) throw new UcanError('InvalidToken', 'Not a UCAN container (unknown header).');
	if ((typeof input === 'string') === format.startsWith('bytes'))
		throw new UcanError('InvalidToken', 'The container header does not match how it was written.');
	let value: Ipld;
	try {
		value = decode(await squeeze(body, format.endsWith('+gzip'), false));
	} catch (e) {
		throw new UcanError('InvalidToken', `Unreadable container: ${(e as Error).message}`);
	}
	const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
	const list = keys.length === 1 && keys[0] === 'ctn-v1' ? (value as Record<string, Ipld>)['ctn-v1'] : null;
	if (!Array.isArray(list) || !list.every((x) => x instanceof Uint8Array))
		throw new UcanError('InvalidToken', 'A container holds { "ctn-v1": [token bytes] } and nothing else.');
	return list as Uint8Array[];
}

/** Unpacks and checks every token's signature. */
export async function readContainerTokens(input: string | Uint8Array): Promise<Token[]> {
	const out: Token[] = [];
	for (const b of await readContainer(input)) out.push(await readToken(b));
	return out;
}
