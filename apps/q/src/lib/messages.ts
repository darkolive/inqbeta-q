/*
 * Messages (2 October 2026): writing to the people you're linked with.
 *
 * A message is a receipt you sign, sealed so only they can open it, left in
 * their inbox at the storage (q-core/inbox.ts). The bellboy pings their
 * inbox; their Q collects it, checks your signature, keeps it in their vault,
 * and lets the storage's copy go. You keep your own signed copy, so the
 * conversation is the two vaults' receipts read side by side.
 *
 * It needs no account and no bellboy sign-in: the inbox id comes from your
 * key, and only your key can make what opens it.
 */
import { current, type Identity } from '@inqbeta/q-core/passkey';
import { sealWith, sealTo, openWith, checkReceipt, isSealedToPeople, type SealedReceipt } from '@inqbeta/q-core/seal';
import { inboxOf, makePost, MESSAGE_SCHEMA, type Message } from '@inqbeta/q-core/inbox';
import { saveLocked } from '@inqbeta/q-core/folder';
import { readHome } from '$lib/home';
import { role } from '$lib/role.svelte';
import { isAgreementStep } from '@inqbeta/q-core/agreements';
import { connectMqtt } from '$lib/mqtt-ws';
import { receivePiece, keepFile } from '$lib/attachments';
import { fromBase64, type Attachment, type Piece } from '@inqbeta/q-core/attachments';

export type { Message };
export type Signed = SealedReceipt & { content: Message };

let inbox: { did: string; id: string; key: string } | null = null;
/** Your inbox, made from your key (the same on every device). */
export async function myInbox(id: Identity | null = current()): Promise<{ id: string; key: string } | null> {
	if (!id) return null;
	if (inbox?.did !== id.did) inbox = { did: id.did, ...(await inboxOf(id)) };
	return { id: inbox.id, key: inbox.key };
}

async function services() {
	const h = await readHome().catch(() => null);
	return h?.ok ? { storage: h.services.storage?.replace(/\/$/, ''), bellboy: h.services.bellboy } : { storage: undefined, bellboy: undefined };
}

/* What's conversation, and so kept in both vaults: words, linking up, and voice messages. */
const kept = (k: Message['kind']) => k === 'message' || k === 'linked-back' || k === 'voicemail';

async function keep(signed: SealedReceipt) {
	await saveLocked('messages', `message-${signed.contentHash.slice(0, 20)}.json`, JSON.stringify(signed, null, 2), 'application/json');
}

/** An agreement step, kept in the agreements folder (both sides keep every step). */
export async function keepStep(step: SealedReceipt & { content: { agreement: string; step: string } }) {
	await saveLocked('agreements', `agreement-${step.content.agreement.slice(0, 8)}-${step.content.step}-${step.contentHash.slice(0, 12)}.json`, JSON.stringify(step, null, 2), 'application/json');
}

/** Write to someone you're linked with. Your signed copy is kept in your vault. */
export async function sendTo(
	to: { did: string; inbox?: string },
	what: Pick<Message, 'kind'> & Partial<Pick<Message, 'text' | 'card' | 'link' | 'audio' | 'seconds' | 'call' | 'step' | 'attachments' | 'piece' | 'alsoTo' | 'office' | 'fromOffice'>>
): Promise<{ ok: true; signed: Signed } | { ok: false; says: string }> {
	const me = current();
	if (!me) return { ok: false, says: 'Sign in first.' };
	if (!to.inbox) return { ok: false, says: 'Q doesn’t know where to write to them yet. Their card needs to come from a newer Q.' };
	const { storage } = await services();
	if (!storage) return { ok: false, says: 'Q can’t find the storage just now.' };
	const mine = await myInbox(me);
	const content: Message = { schema: MESSAGE_SCHEMA, source: 'inqbeta:q/message', to: to.did, replyTo: mine?.id, at: new Date().toISOString(), ...what };
	const signed = (await sealWith(me, content)) as Signed;
	/* Compressed first: a voice message's base64 comes out about a quarter smaller. */
	const { sealed } = await sealTo(signed, [to.did], 'message', { zip: true });
	const post = await makePost(me, to.inbox, sealed);
	try {
		const res = await fetch(`${storage}/inbox/${to.inbox}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(post), signal: AbortSignal.timeout(15_000) });
		const out = (await res.json().catch(() => ({}))) as { ok?: boolean; says?: string };
		if (!res.ok || !out.ok) return { ok: false, says: out.says ?? `The storage said ${res.status}.` };
	} catch {
		return { ok: false, says: 'The storage didn’t answer. Try again in a moment.' };
	}
	/* Calls' handshakes aren't conversation: only real words are kept as yours. */
	if (kept(what.kind)) await keep(signed).catch(() => {});
	return { ok: true, signed };
}

/**
 * A message written once and sent to several people (4 October 2026): each
 * gets their own sealed copy. A big file's pieces go first, each its own
 * post, so they're there when the message arrives. `onStep` is told how far
 * it's got, to show. Says who it reached and who it didn't.
 */
export async function sendMessage(
	to: { did: string; name: string; inbox?: string }[],
	what: { text?: string; attachments?: Attachment[]; audio?: string; seconds?: number },
	pieces: Piece[],
	files: { sha256: string; name: string; type: string; bytes: Uint8Array<ArrayBuffer> }[],
	onStep: (done: number, of: number) => void = () => {}
): Promise<{ reached: string[]; missed: { name: string; says: string }[] }> {
	/* Your own copies first, so what you sent is in your vault whatever happens next. */
	for (const f of files) await keepFile(f.sha256, f.name, f.type, f.bytes).catch(() => {});
	const of = to.length * (pieces.length + 1);
	let done = 0;
	const reached: string[] = [];
	const missed: { name: string; says: string }[] = [];
	for (const p of to) {
		let says = '';
		for (const piece of pieces) {
			const out = await sendTo(p, { kind: 'piece', piece });
			onStep(++done, of);
			if (!out.ok) {
				says = out.says;
				break;
			}
		}
		if (!says) {
			const alsoTo = to.filter((x) => x.did !== p.did).map((x) => x.did);
			const out = await sendTo(p, { kind: 'message', ...(what.text ? { text: what.text } : {}), ...(what.attachments?.length ? { attachments: what.attachments } : {}), ...(what.audio ? { audio: what.audio, seconds: what.seconds } : {}), ...(alsoTo.length ? { alsoTo } : {}) });
			if (!out.ok) says = out.says;
		}
		done = Math.max(done, reached.length * (pieces.length + 1) + pieces.length + 1);
		onStep(done, of);
		if (says) missed.push({ name: p.name, says });
		else reached.push(p.name);
	}
	return { reached, missed };
}

/* ---- Collecting what's waiting ---- */
const listeners = new Set<(m: Signed) => void>();
/** Called with every message as it arrives (calls listen here for their replies). */
export function watchArrivals(fn: (m: Signed) => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

let collecting: Promise<number> | null = null;
/** Collect everything waiting in your inbox. Returns how many arrived. */
/*
 * Endings first: when a call, its ending and a voice message are all waiting
 * (someone signed in after the call was over), the ending is known before the
 * call is seen, so a call that has finished never rings.
 */
const first = (k: Message['kind']) => (k === 'call-ended' || k === 'voicemail' || k === 'call-declined' || k === 'call-reply' ? 0 : 1);

export function collectInbox(): Promise<number> {
	collecting ??= (async () => {
		const me = current();
		const mine = await myInbox(me);
		const { storage } = await services();
		if (!me || !mine || !storage) return 0;
		const head = { 'x-inbox-key': mine.key };
		const list = await fetch(`${storage}/inbox/${mine.id}`, { headers: head, signal: AbortSignal.timeout(15_000) })
			.then((r) => (r.ok ? r.json() : { ids: [] }))
			.catch(() => ({ ids: [] }));
		const arrived: Signed[] = [];
		for (const pid of (list as { ids?: string[] }).ids ?? []) {
			try {
				const post = (await (await fetch(`${storage}/inbox/${mine.id}/${pid}`, { headers: head })).json()) as { content?: { sealed?: unknown } };
				const sealed = post.content?.sealed;
				if (!isSealedToPeople(sealed)) continue;
				const opened = await openWith(sealed, me);
				if (!opened.ok) continue;
				const signed = opened.body as Signed;
				const check = await checkReceipt(signed);
				if (!check.ok || signed.content?.schema !== MESSAGE_SCHEMA || signed.content.to !== me.did) continue;
				if (kept(signed.content.kind)) await keep(signed);
				/* A piece of a big file: kept until the last one is in, then joined into the file. */
				if (signed.content.kind === 'piece') await receivePiece(signed.content.piece);
				/* Small files ride inside: keep them in the vault's files too, so they're found like any other. */
				for (const a of signed.content.attachments ?? []) if (a.data && a.sha256 && (a.kind === 'file' || a.kind === 'picture')) await keepFile(a.sha256, a.name ?? 'file', a.type ?? '', fromBase64(a.data)).catch(() => {});
				/* An agreement step (ADR-Q-025): kept as its own receipt, if it's signed by whoever sent it. */
				if (signed.content.kind === 'agreement') {
					const step = signed.content.step;
					if (isAgreementStep(step) && step.did === signed.did && (await checkReceipt(step)).ok) await keepStep(step);
				}
				/* Custody passes: it's in your vault now, so the storage can let its copy go. */
				await fetch(`${storage}/inbox/${mine.id}/${pid}`, { method: 'DELETE', headers: head }).catch(() => {});
				arrived.push(signed);
			} catch {
				/* one that won't open doesn't stop the rest */
			}
		}
		arrived.sort((a, b) => first(a.content.kind) - first(b.content.kind) || a.content.at.localeCompare(b.content.at));
		/* Out of role, it's quiet (ADR-Q-038 §5): post for an office waits on its desk, and doesn't ring. */
		for (const m of arrived) if (!m.content.office || role.isActing(m.content.office.federation, m.content.office.office)) for (const fn of listeners) fn(m);
		return arrived.length;
	})().finally(() => (collecting = null));
	return collecting;
}

/** Collect now, then whenever the bellboy pings your inbox. Returns a way to stop. */
export function startMessaging(onCollected: (n: number) => void): () => void {
	let stop = false;
	let line: { close(): void } | null = null;
	void (async () => {
		onCollected(await collectInbox());
		const mine = await myInbox();
		const { bellboy } = await services();
		if (stop || !mine || !bellboy) return;
		line = await connectMqtt(
			{ url: bellboy, clientId: `q-inbox-${crypto.randomUUID().slice(0, 8)}`, onMessage: () => void collectInbox().then(onCollected) },
			[`q/inbox/${mine.id}`]
		).catch(() => null);
		if (stop) line?.close();
	})();
	/* Coming back to the tab collects too: a phone may have slept through a ping. */
	const back = () => document.visibilityState === 'visible' && void collectInbox().then(onCollected);
	document.addEventListener('visibilitychange', back);
	return () => {
		stop = true;
		line?.close();
		document.removeEventListener('visibilitychange', back);
	};
}

/**
 * Office business, kept off your own messages (ADR-Q-038 §5): post addressed
 * to an office you hold, and what you sent back for it. It's on the office's
 * desk, seen in role.
 */
export const isOfficeBusiness = (s: Signed, me: string) => (s.content.to === me && !!s.content.office) || (s.did === me && !!s.content.fromOffice);

/** A conversation with one person: both sides' signed messages, oldest first. */
export function threadWith(receipts: { json?: unknown }[], me: string, them: string): Signed[] {
	const out: Signed[] = [];
	const seen = new Set<string>();
	for (const r of receipts) {
		const s = r.json as Signed | undefined;
		if (s?.content?.schema !== MESSAGE_SCHEMA || (s.content.kind !== 'message' && s.content.kind !== 'voicemail') || seen.has(s.signature) || isOfficeBusiness(s, me)) continue;
		if ((s.did === me && s.content.to === them) || (s.did === them && s.content.to === me)) {
			seen.add(s.signature);
			out.push(s);
		}
	}
	return out.sort((a, b) => a.content.at.localeCompare(b.content.at));
}

/** Post for an office and what was sent back for it, with each person, newest last: the office's desk. */
export function officeThreads(receipts: { json?: unknown }[], me: string, federation: string, office: string): { them: string; messages: Signed[] }[] {
	const by = new Map<string, Signed[]>();
	const seen = new Set<string>();
	for (const r of receipts) {
		const s = r.json as Signed | undefined;
		if (s?.content?.schema !== MESSAGE_SCHEMA || s.content.kind !== 'message' || seen.has(s.signature)) continue;
		const inbound = s.content.to === me && s.content.office?.federation === federation && s.content.office.office === office;
		const outbound = s.did === me && s.content.fromOffice?.federation === federation && s.content.fromOffice.office === office;
		if (!inbound && !outbound) continue;
		seen.add(s.signature);
		const them = inbound ? s.did : s.content.to;
		by.set(them, [...(by.get(them) ?? []), s]);
	}
	return [...by.entries()].map(([them, messages]) => ({ them, messages: messages.sort((a, b) => a.content.at.localeCompare(b.content.at)) })).sort((a, b) => b.messages.at(-1)!.content.at.localeCompare(a.messages.at(-1)!.content.at));
}

/**
 * Write to an office (ADR-Q-037): sealed to each of its holders now, each in
 * their own copy, tagged with the office so it waits on their desk. Your own
 * signed copy is kept, so you see what you asked.
 */
export async function askOffice(to: { holder: string; inbox: string }[], office: { federation: string; office: string }, text: string): Promise<{ ok: true; reached: number } | { ok: false; says: string }> {
	if (!to.length) return { ok: false, says: 'Nobody holds that office just now.' };
	if (!text.trim()) return { ok: false, says: 'Write your question first.' };
	let reached = 0;
	let says = '';
	for (const h of to) {
		const out = await sendTo({ did: h.holder, inbox: h.inbox }, { kind: 'message', text: text.trim(), office });
		if (out.ok) reached++;
		else says = out.says;
	}
	return reached ? { ok: true, reached } : { ok: false, says };
}
