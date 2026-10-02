/*
 * Receipts — the signed records in your folder, kept apart from ordinary files.
 *
 * Darren, 2026-09-17: "a section that is receipts, which is different to files."
 *
 * A receipt here is anything that carries a signature and says what happened:
 *   · DoStudy receipts and chains (course records, sealed notes), reads,
 *     founding records and membership credentials;
 *   · link receipts (KeyLink JSON, from before UCAN);
 *   · UCAN tokens in ucan/ — permissions given or held, device links, link
 *     requests, revocations, system requests, council approvals.
 *
 * Each is checked here as far as Q can check it offline: every signature, and
 * for a chain that each step follows from the last. Whether a course's content
 * matches what was signed is answered on the site that reads it (Verify).
 */
import { canonical, sha256 } from '@inqbeta/q-core/canonical';
import { publicKeyFrom, toDid } from '@inqbeta/q-core/did';
import type { FolderItem } from '@inqbeta/q-core/folder';
import { checkLink, isLink, LINK_COMMAND, type Link } from '@inqbeta/q-core/links';
import { COMMANDS } from '@inqbeta/q-core/permissions';
import { checkCallChain, isCallChain } from '@inqbeta/q-core/calls';
import { checkReceipt } from '@inqbeta/q-core/seal';
import { REVOKE_COMMAND, toDagJson, type KnownRevocation, type Token } from '@inqbeta/q-core/ucan/index';

export type ReceiptGroup = 'courses' | 'links' | 'permissions' | 'people' | 'other';
export type Holds = 'yes' | 'no' | 'partly';

export interface ReceiptEntry {
	id: string;
	group: ReceiptGroup;
	/** What sort of record, in words. */
	what: string;
	title: string;
	description?: string;
	/** ISO. */
	at: string;
	signers: string[];
	holds: Holds;
	says: string;
	/** Where it is kept, for "on disk". */
	where: string;
	/** For showing and saving a copy. */
	item?: FolderItem;
	token?: Token;
	json?: unknown;
}

const enc = new TextEncoder();

async function verifySig(publicKey: string, message: string, signature: string): Promise<boolean> {
	try {
		const key = await crypto.subtle.importKey('raw', publicKeyFrom(publicKey), { name: 'Ed25519' }, false, ['verify']);
		const sig = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
		return await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, enc.encode(message));
	} catch {
		return false;
	}
}

const didOf = (k: string | undefined) => {
	try {
		return k ? toDid(k) : '';
	} catch {
		return '';
	}
};

type Sig = { by?: string; publicKey?: string; signature?: string };
type KernelReceipt = {
	schema?: string;
	courseId?: string;
	event?: string;
	at?: string;
	previousHash?: string | null;
	author?: { name?: string; publicKey?: string };
	signatures?: Sig[];
	body?: unknown;
	authority?: string;
} & Record<string, unknown>;

/** Every signature on every step, and each step following from the last. */
async function checkChain(chain: KernelReceipt[]): Promise<{ holds: Holds; says: string; signers: string[] }> {
	const signers = new Set<string>();
	for (let i = 0; i < chain.length; i++) {
		const { signatures, body: _b, ...rest } = chain[i];
		void _b;
		if (!signatures?.length) return { holds: 'no', says: `Step ${i + 1} is not signed.`, signers: [...signers] };
		const payload = canonical(rest);
		for (const s of signatures) {
			if (!s.publicKey || !s.signature || !(await verifySig(s.publicKey, payload, s.signature)))
				return { holds: 'no', says: `A signature on step ${i + 1} does not match — it was changed after signing.`, signers: [...signers] };
			signers.add(didOf(s.publicKey) || s.by || 'someone');
		}
		if (i === 0 ? chain[0].previousHash != null : chain[i].previousHash !== (await sha256(canonical((({ signatures: _s, body: _c, ...r }) => r)(chain[i - 1])))))
			return { holds: 'no', says: `Step ${i + 1} does not follow from the step before.`, signers: [...signers] };
	}
	return {
		holds: 'partly',
		says: `${chain.length === 1 ? 'Signed' : `${chain.length} steps, each following from the last, all signed`}, unchanged since. The content is checked where it is read (Verify).`,
		signers: [...signers]
	};
}

const DAY = (iso?: string) => iso ?? '';

/** The signed records inside one JSON file, or [] if it holds none. */
export async function receiptsInJson(json: unknown, item: FolderItem): Promise<ReceiptEntry[]> {
	if (!json || typeof json !== 'object') return [];
	const where = item.diskPath;
	const o = json as Record<string, unknown>;
	const out: ReceiptEntry[] = [];

	/* Someone you linked up with (ADR-Q-015): their card, kept, signed by you. */
	const linked = o.content as { schema?: string; card?: { name?: string; details?: Record<string, string> }; at?: string } | undefined;
	if (linked?.schema === 'inqbeta.linked/1') {
		const c = await checkReceipt(json);
		out.push({
			id: `json:${where}`,
			group: 'people',
			what: 'Linked up',
			title: `${linked.card?.details?.['q:person/called'] ?? 'Someone'} — ${linked.card?.name ?? 'card'}`,
			description: 'You linked up with them from their card.',
			at: DAY(linked.at),
			signers: [didOf(o.publicKey as string) || String(o.did ?? '')],
			holds: c.ok ? 'yes' : 'no',
			says: c.ok ? 'Kept by you when you linked up, and unchanged since.' : c.says,
			where,
			item,
			json
		});
		return out;
	}

	/* A message (2 October 2026): signed by whoever wrote it, kept by both sides. */
	const msg = o.content as { schema?: string; kind?: string; text?: string; at?: string } | undefined;
	if (msg?.schema === 'inqbeta.message/1') {
		const c = await checkReceipt(json);
		out.push({
			id: `json:${where}`,
			group: 'people',
			what: msg.kind === 'linked-back' ? 'Linked up' : 'Message',
			title: msg.kind === 'linked-back' ? 'They linked up with your card' : (msg.text ?? '').slice(0, 80) || 'A message',
			description: 'Signed by whoever wrote it.',
			at: DAY(msg.at),
			signers: [String(o.did ?? '')],
			holds: c.ok ? 'yes' : 'no',
			says: c.ok ? 'Signed by its writer, and unchanged since.' : c.says,
			where,
			item,
			json
		});
		return out;
	}

	/* Collected by the bell (ADR-Q-014): kept, signed by you, when it was Captured. */
	const got = o.content as { schema?: string; from?: string; title?: string; hash?: string; collectedAt?: string } | undefined;
	if (got?.schema === 'inqbeta.received/1') {
		const c = await checkReceipt(json);
		out.push({
			id: `json:${where}`,
			group: 'people',
			what: 'Message received',
			title: `${got.from ?? 'Someone'} — ${got.title ?? 'a message'}`,
			description: `Collected by the bell · fingerprint ${(got.hash ?? '').slice(0, 12)}…`,
			at: DAY(got.collectedAt),
			signers: [didOf(o.publicKey as string) || String(o.did ?? '')],
			holds: c.ok ? 'yes' : 'no',
			says: c.ok ? 'Kept by you when the bell captured it, and unchanged since. Its fingerprint matched what was sent.' : c.says,
			where,
			item,
			json
		});
		return out;
	}

	if (isLink(json)) {
		const l = json as Link;
		const c = await checkLink(l);
		out.push({
			id: `json:${where}`,
			group: 'links',
			what: l.event === 'identity.unlinked' ? 'Unlink (JSON)' : c.ok && !c.complete ? 'Link request (JSON)' : 'Link (JSON)',
			title: l.label,
			description: l.origin,
			at: l.at,
			signers: l.signatures.map((s) => s.did),
			holds: c.ok ? 'yes' : 'no',
			says: c.says,
			where,
			item,
			json
		});
		return out;
	}

	if (o.schema === 'dostudy.read/2' && typeof o.signature === 'string' && typeof o.publicKey === 'string') {
		const { signature, ...rest } = o as { signature: string; publicKey: string };
		const ok = await verifySig(o.publicKey as string, canonical(rest), signature);
		out.push({
			id: `json:${where}`,
			group: 'courses',
			what: 'Read',
			title: `Read by ${(o.by as string) ?? 'someone'}`,
			at: DAY(o.at as string),
			signers: [didOf(o.publicKey as string)],
			holds: ok ? 'yes' : 'no',
			says: ok ? 'Signed by the reader, unchanged since.' : 'The signature does not match — it was changed after signing.',
			where,
			item,
			json
		});
		return out;
	}

	if (isCallChain(json)) {
		const c = await checkCallChain(json);
		const sum = c.ok ? c.summary : undefined;
		out.push({
			id: `json:${where}`,
			group: 'people',
			what: 'Call',
			title: sum?.media.includes('video') ? 'Video call' : 'Call',
			description: `${json.steps.length} receipt${json.steps.length === 1 ? '' : 's'} in the chain${sum?.route ? ` · ${sum.route}` : ''}`,
			at: DAY(json.steps[0]?.content?.at),
			signers: [...new Set(json.steps.map((r) => r.did))],
			holds: !c.ok ? 'no' : sum?.complete || (sum && !sum.accepted && sum.closedBy.length) ? 'yes' : 'partly',
			says: c.says,
			where,
			item,
			json
		});
		return out;
	}

	const chain: KernelReceipt[] = Array.isArray(o.chain)
		? (o.chain as KernelReceipt[])
		: o.schema === 'dostudy.receipt/1'
			? [o as KernelReceipt]
			: Array.isArray(json) && (json as KernelReceipt[])[0]?.schema === 'dostudy.receipt/1'
				? (json as KernelReceipt[])
				: [];
	if (chain.length) {
		const last = chain[chain.length - 1];
		const unit = [...chain].reverse().map((r) => (r.body as { unit?: { title?: string } } | undefined)?.unit).find(Boolean);
		const c = await checkChain(chain);
		out.push({
			id: `json:${where}`,
			group: 'courses',
			what: unit ? 'Course record' : 'Record',
			title: unit?.title ?? `${last.event ?? 'A record'} — ${last.courseId ?? ''}`,
			description: `${last.event ?? ''}${last.author?.name ? ` · by ${last.author.name}` : ''}${last.authority ? ' · made under a permission' : ''}`,
			at: DAY(last.at),
			signers: c.signers,
			holds: c.holds,
			says: c.says,
			where,
			item,
			json
		});
	}
	const genesis = o.genesis as { schema?: string; name?: string; foundedAt?: string } | undefined;
	if (genesis?.schema === 'dostudy.genesis/1')
		out.push({
			id: `json:${where}:genesis`,
			group: 'other',
			what: 'Founding record',
			title: genesis.name ?? 'A federation',
			at: DAY(genesis.foundedAt),
			signers: [],
			holds: 'partly',
			says: 'Checked in full where it is read (Verify).',
			where,
			item,
			json: genesis
		});
	const cred = o.credential as { schema?: string; name?: string; asAt?: string; issuer?: { name?: string } } | undefined;
	if (cred?.schema === 'dostudy.credential/1')
		out.push({
			id: `json:${where}:credential`,
			group: 'other',
			what: 'Membership credential',
			title: `${cred.name ?? 'A member'} — ${cred.issuer?.name ?? 'a federation'}`,
			at: DAY(cred.asAt),
			signers: [],
			holds: 'partly',
			says: 'Checked in full where it is read (Verify), against an issuer key you accept.',
			where,
			item,
			json: cred
		});
	return out;
}

const VERB = Object.fromEntries(Object.entries(COMMANDS).map(([k, v]) => [v, k]));
const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : '');
const thingOf = (pol: unknown[]) => {
	const hit = pol.find((s) => Array.isArray(s) && s[0] === '==' && s[1] === '.thing') as unknown[] | undefined;
	return typeof hit?.[2] === 'string' ? hit[2] : undefined;
};

/** One UCAN token as a receipt. Tokens reach here already signature-checked. */
export function receiptFromToken(t: Token, revocations: KnownRevocation[], now = Math.floor(Date.now() / 1000)): ReceiptEntry {
	const base = { id: `ucan:${t.cid}`, token: t, where: `ucan/${t.cid}.ucan`, signers: [t.payload.iss], json: toDagJson(t.payload as never) };
	if (t.kind === 'delegation') {
		const d = t.payload;
		const revoked = revocations.find((r) => r.revoked.equals(t.cid));
		const expired = d.exp !== null && now > d.exp;
		const state = revoked
			? { holds: 'no' as Holds, says: `Taken back on ${new Date(revoked.at * 1000).toLocaleDateString('en-GB')}. What was done with it before stands.` }
			: expired
				? { holds: 'no' as Holds, says: 'Signed, but expired.' }
				: { holds: 'yes' as Holds, says: `Signed by the giver${d.exp ? `, until ${new Date(d.exp * 1000).toLocaleDateString('en-GB')}` : ''}.` };
		if (d.sub === null && d.cmd === '/' && d.meta?.['inqbeta/link'])
			return {
				...base,
				...state,
				group: 'links',
				what: 'Link (UCAN)',
				title: String(d.meta?.label ?? 'A linked key'),
				description: `${d.aud} speaks for ${d.iss}`,
				at: iso(d.nbf),
				signers: [d.iss]
			};
		return {
			...base,
			...state,
			group: 'permissions',
			what: 'Permission',
			title: `${VERB[d.cmd] ?? d.cmd} ${thingOf(d.pol) ? `on ${thingOf(d.pol)}` : d.sub === null ? '— everything, for any subject' : ''}`.trim(),
			description: `From ${d.iss} to ${d.aud}`,
			at: iso(d.nbf)
		};
	}
	const p = t.payload;
	const at = iso(p.iat);
	const ok = { holds: 'yes' as Holds, says: 'Signed, unchanged since.' };
	if (p.cmd === REVOKE_COMMAND)
		return { ...base, ...ok, group: 'permissions', what: 'Revocation', title: 'A power taken back', description: String(p.args.revoke ?? ''), at };
	if (p.cmd === LINK_COMMAND)
		return { ...base, ...ok, group: 'links', what: 'Link request (UCAN)', title: String(p.args.label ?? 'A key'), description: `${p.iss} asks to speak for ${p.args.root}`, at };
	if (p.cmd === COMMANDS.request)
		return { ...base, ...ok, group: 'permissions', what: 'Request', title: `A system asks for ${VERB[String(p.args.want)] ?? p.args.want}`, description: String(p.args.reason ?? ''), at };
	if (p.cmd === COMMANDS.approve)
		return { ...base, ...ok, group: 'permissions', what: 'Second signature', title: `Agreed to remove ${p.args.thing}`, description: `By ${p.iss}`, at };
	return { ...base, ...ok, group: 'permissions', what: 'Use of a power', title: `${VERB[p.cmd] ?? p.cmd}${p.args.thing ? ` on ${p.args.thing}` : ''}`, description: `By ${p.iss}`, at };
}

/**
 * One row per call (2 October 2026). A call's record is rewritten as it grows
 * — placed, answered, ended — and each version is its own locked file, and the
 * other side's copy arrives too. Every version stays on disk as evidence; the
 * list shows only the fullest one, so a call is never told four ways.
 */
export function oneRowPerCall(list: ReceiptEntry[]): ReceiptEntry[] {
	const best = new Map<string, ReceiptEntry>();
	const score = (r: ReceiptEntry) => {
		const steps = isCallChain(r.json) ? r.json.steps.length : 0;
		return steps * 10 + (r.holds === 'yes' ? 2 : r.holds === 'partly' ? 1 : 0);
	};
	const out: ReceiptEntry[] = [];
	for (const r of list) {
		const id = isCallChain(r.json) ? r.json.steps[0]?.content?.call : undefined;
		if (!id) {
			out.push(r);
			continue;
		}
		const had = best.get(id);
		if (!had || score(r) > score(had)) best.set(id, r);
	}
	return [...out, ...best.values()];
}
