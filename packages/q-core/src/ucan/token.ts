/*
 * UCAN tokens — delegations ("you may") and invocations ("I am doing").
 *
 * A token is a DAG-CBOR array: [signature, { h: <varsig>, "ucan/…": payload }].
 * The signature covers the second element's exact bytes. A token's name is the
 * CID of all of its bytes.
 *
 * Q signs with the Ed25519 key it makes from your passkey, through the same
 * Signer the receipt kernel uses — it only needs one more method, signBytes.
 * No private key is handed to this module.
 */
import { b64url, canonical } from '../canonical';
import { didFromPublicKey, publicKeyFrom } from '../did';
import type { Signer } from '../seal';
import { decodeArrayWithSpans, encode, type Ipld } from './cbor';
import { CID } from './cid';
import { checkCommand } from './command';
import { UcanError } from './errors';
import { checkPolicy, type Policy } from './policy';
import { ED25519_DAG_CBOR, readVarsig } from './varsig';

/** The spec's tags. The `-rc.1` forms are still read, because go-ucan and older tokens use them. */
export const TAGS = {
	delegation: 'ucan/dlg@1.0.0',
	invocation: 'ucan/inv@1.0.0'
} as const;
const READ_TAGS: Record<string, 'delegation' | 'invocation'> = {
	'ucan/dlg@1.0.0': 'delegation',
	'ucan/dlg@1.0.0-rc.1': 'delegation',
	'ucan/inv@1.0.0': 'invocation',
	'ucan/inv@1.0.0-rc.1': 'invocation'
};

export type Meta = Record<string, Ipld>;

export interface DelegationPayload {
	iss: string;
	aud: string;
	/** `null` is a powerline: whatever the issuer can do, for any subject. */
	sub: string | null;
	cmd: string;
	pol: Policy;
	nonce: Uint8Array;
	meta?: Meta;
	nbf?: number;
	exp: number | null;
}

export interface InvocationPayload {
	iss: string;
	sub: string;
	aud?: string;
	cmd: string;
	args: Record<string, Ipld>;
	/** Delegations, root first, ending with the one issued to `iss`. */
	prf: CID[];
	meta?: Meta;
	nonce?: Uint8Array;
	exp: number | null;
	iat?: number;
	cause?: CID;
}

interface Sealed<K extends 'delegation' | 'invocation', P> {
	kind: K;
	tag: string;
	payload: P;
	/** The whole token, as signed and sent. */
	bytes: Uint8Array;
	cid: CID;
}
export type Delegation = Sealed<'delegation', DelegationPayload>;
export type Invocation = Sealed<'invocation', InvocationPayload>;
export type Token = Delegation | Invocation;

/** A Signer that can sign raw bytes — what UCAN needs. */
export interface UcanSigner extends Signer {
	signBytes(bytes: Uint8Array): Promise<Uint8Array>;
}

export function canSignBytes(s: Signer): s is UcanSigner {
	return typeof (s as Partial<UcanSigner>).signBytes === 'function';
}

/** A Signer for a plain Ed25519 key pair — for tests, scripts and the older per-browser key. */
export async function signerFromKeys(keys: CryptoKeyPair): Promise<UcanSigner> {
	const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
	return {
		did: didFromPublicKey(raw),
		publicKey: b64url(raw),
		async signCanonical(doc) {
			return b64url(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(canonical(doc))));
		},
		async signBytes(bytes) {
			return new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, bytes as Uint8Array<ArrayBuffer>));
		}
	};
}

export const now = () => Math.floor(Date.now() / 1000);

export function randomNonce(size = 12): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(size));
}

async function seal<K extends 'delegation' | 'invocation', P>(
	kind: K,
	signer: UcanSigner,
	payload: P
): Promise<Sealed<K, P>> {
	const tag = TAGS[kind];
	const sigPayload = encode({ h: ED25519_DAG_CBOR, [tag]: payload as unknown as Ipld });
	const signature = await signer.signBytes(sigPayload);
	const bytes = encode([signature, null]);
	// [sig, sigPayload] — splice the already-encoded payload in, so what is sent is what was signed.
	const head = bytes.slice(0, bytes.length - 1);
	const whole = new Uint8Array(head.length + sigPayload.length);
	whole.set(head);
	whole.set(sigPayload, head.length);
	return { kind, tag, payload, bytes: whole, cid: await CID.of(whole) };
}

function did(v: unknown, field: string): string {
	if (typeof v !== 'string' || !v.startsWith('did:')) throw new UcanError('InvalidToken', `${field} must be a DID.`);
	return v;
}

function time(v: unknown, field: string, nullable: boolean): number | null | undefined {
	if (v === undefined) {
		if (nullable) throw new UcanError('InvalidToken', `${field} is required (it may be null).`);
		return undefined;
	}
	if (v === null && nullable) return null;
	if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new UcanError('InvalidToken', `${field} must be a whole number of seconds.`);
	return v;
}

function map(v: unknown, field: string): Record<string, Ipld> | undefined {
	if (v === undefined) return undefined;
	if (!v || typeof v !== 'object' || Array.isArray(v) || v instanceof Uint8Array || v instanceof CID)
		throw new UcanError('InvalidToken', `${field} must be a map.`);
	return v as Record<string, Ipld>;
}

function bytesField(v: unknown, field: string, required: boolean): Uint8Array | undefined {
	if (v === undefined && !required) return undefined;
	if (!(v instanceof Uint8Array)) throw new UcanError('InvalidToken', `${field} must be bytes.`);
	return v;
}

const DLG_FIELDS = new Set(['iss', 'aud', 'sub', 'cmd', 'pol', 'nonce', 'meta', 'nbf', 'exp']);
const INV_FIELDS = new Set(['iss', 'sub', 'aud', 'cmd', 'args', 'prf', 'meta', 'nonce', 'exp', 'iat', 'cause']);

function strict(p: Record<string, unknown>, allowed: Set<string>) {
	for (const k of Object.keys(p)) if (!allowed.has(k)) throw new UcanError('InvalidToken', `Unknown field ${k}.`);
}

function asDelegation(p: Record<string, unknown>): DelegationPayload {
	strict(p, DLG_FIELDS);
	if (p.sub === undefined) throw new UcanError('InvalidToken', 'sub is required (it may be null).');
	return {
		iss: did(p.iss, 'iss'),
		aud: did(p.aud, 'aud'),
		sub: p.sub === null ? null : did(p.sub, 'sub'),
		cmd: checkCommand(p.cmd),
		pol: checkPolicy(p.pol),
		nonce: bytesField(p.nonce, 'nonce', true)!,
		meta: map(p.meta, 'meta'),
		nbf: time(p.nbf, 'nbf', false) ?? undefined,
		exp: time(p.exp, 'exp', true) as number | null
	};
}

function asInvocation(p: Record<string, unknown>): InvocationPayload {
	strict(p, INV_FIELDS);
	if (!Array.isArray(p.prf) || !p.prf.every((c) => c instanceof CID))
		throw new UcanError('InvalidToken', 'prf must be a list of CIDs.');
	if (p.cause !== undefined && !(p.cause instanceof CID)) throw new UcanError('InvalidToken', 'cause must be a CID.');
	return {
		iss: did(p.iss, 'iss'),
		sub: did(p.sub, 'sub'),
		aud: p.aud === undefined ? undefined : did(p.aud, 'aud'),
		cmd: checkCommand(p.cmd),
		args: map(p.args, 'args') ?? (() => { throw new UcanError('InvalidToken', 'args is required.'); })(),
		prf: p.prf as CID[],
		meta: map(p.meta, 'meta'),
		nonce: bytesField(p.nonce, 'nonce', false),
		exp: time(p.exp, 'exp', true) as number | null,
		iat: time(p.iat, 'iat', false) ?? undefined,
		cause: p.cause as CID | undefined
	};
}

function clean<T extends object>(p: T): T {
	return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Reads a token and checks its signature. Throws UcanError('InvalidSignature')
 * if the bytes were not signed by `iss`, and 'InvalidToken' if they are not a
 * well-formed UCAN at all.
 */
export async function readToken(bytes: Uint8Array): Promise<Token> {
	let items: Ipld[];
	let spans: Uint8Array[];
	try {
		({ items, spans } = decodeArrayWithSpans(bytes));
	} catch (e) {
		throw new UcanError('InvalidToken', `Not a UCAN: ${(e as Error).message}`);
	}
	const [signature, body] = items;
	if (items.length !== 2 || !(signature instanceof Uint8Array) || !body || typeof body !== 'object' || Array.isArray(body))
		throw new UcanError('InvalidToken', 'A UCAN is [signature, payload].');
	const keys = Object.keys(body);
	const tag = keys.find((k) => k.startsWith('ucan/'));
	if (keys.length !== 2 || !keys.includes('h') || !tag) throw new UcanError('InvalidToken', 'The signed part must hold only h and one ucan/… payload.');
	const kind = READ_TAGS[tag];
	if (!kind) throw new UcanError('InvalidToken', `Q does not read ${tag} tokens.`);
	const header = (body as Record<string, Ipld>).h;
	if (!(header instanceof Uint8Array)) throw new UcanError('InvalidToken', 'h must be bytes.');
	readVarsig(header);
	const raw = (body as Record<string, Ipld>)[tag];
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new UcanError('InvalidToken', 'The payload must be a map.');

	const payload = kind === 'delegation' ? asDelegation(raw as Record<string, unknown>) : asInvocation(raw as Record<string, unknown>);

	let publicKey: Uint8Array<ArrayBuffer>;
	try {
		publicKey = publicKeyFrom(payload.iss);
	} catch {
		throw new UcanError('UnsupportedSignature', `Q checks Ed25519 did:key issuers only, not ${payload.iss}.`);
	}
	const key = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']);
	const ok =
		signature.length === 64 &&
		(await crypto.subtle.verify('Ed25519', key, signature as Uint8Array<ArrayBuffer>, spans[1] as Uint8Array<ArrayBuffer>));
	if (!ok) throw new UcanError('InvalidSignature', `The ${kind} was not signed by ${payload.iss}.`);

	return { kind, tag, payload: clean(payload), bytes: Uint8Array.from(bytes), cid: await CID.of(bytes) } as Token;
}

export async function readDelegation(bytes: Uint8Array): Promise<Delegation> {
	const t = await readToken(bytes);
	if (t.kind !== 'delegation') throw new UcanError('InvalidToken', 'Expected a delegation.');
	return t;
}

export async function readInvocation(bytes: Uint8Array): Promise<Invocation> {
	const t = await readToken(bytes);
	if (t.kind !== 'invocation') throw new UcanError('InvalidToken', 'Expected an invocation.');
	return t;
}

export interface DelegateOptions {
	/** Who receives the power. */
	to: string;
	/** Whose resource it is. Defaults to the signer (a root delegation). `null` makes a powerline. */
	subject?: string | null;
	cmd: string;
	pol?: Policy;
	/** Seconds since 1970, or null for no end. Defaults to null. */
	exp?: number | null;
	nbf?: number;
	meta?: Meta;
	nonce?: Uint8Array;
}

/** "`to` may run `cmd` on `subject`, within `pol`." Signed by `signer`. */
export async function delegate(signer: UcanSigner, o: DelegateOptions): Promise<Delegation> {
	const payload = clean<DelegationPayload>({
		iss: signer.did,
		aud: did(o.to, 'to'),
		sub: o.subject === undefined ? signer.did : o.subject,
		cmd: checkCommand(o.cmd),
		pol: checkPolicy(o.pol ?? []),
		nonce: o.nonce ?? randomNonce(),
		meta: o.meta,
		nbf: o.nbf,
		exp: o.exp ?? null
	});
	return seal('delegation', signer, payload);
}

export interface InvokeOptions {
	subject: string;
	cmd: string;
	args?: Record<string, Ipld>;
	/** Delegations, root first. Tokens or their CIDs. */
	proofs?: (Delegation | CID)[];
	/** Who should carry it out, if not the subject. */
	audience?: string;
	exp?: number | null;
	meta?: Meta;
	nonce?: Uint8Array | null;
	cause?: CID;
}

/** "I, `signer`, run `cmd` on `subject` with `args`; here is why I may." */
export async function invoke(signer: UcanSigner, o: InvokeOptions): Promise<Invocation> {
	const payload = clean<InvocationPayload>({
		iss: signer.did,
		sub: did(o.subject, 'subject'),
		aud: o.audience,
		cmd: checkCommand(o.cmd),
		args: o.args ?? {},
		prf: (o.proofs ?? []).map((p) => (p instanceof CID ? p : p.cid)),
		meta: o.meta,
		nonce: o.nonce === null ? undefined : (o.nonce ?? randomNonce()),
		exp: o.exp === undefined ? now() + 300 : o.exp,
		iat: now(),
		cause: o.cause
	});
	return seal('invocation', signer, payload);
}
