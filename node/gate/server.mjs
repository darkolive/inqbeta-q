/*
 * The gate in front of the storage (ADR-Q-016 §6, step 5).
 *
 * A federation's announcements are written here by its caretaker's Q and
 * read by its members' Q. The gate stores NOTHING it hasn't checked:
 *
 *   - only federations this node serves (GATE_FEDERATIONS);
 *   - every announcement signed by that federation's key, and still alive;
 *   - the publication itself signed by the federation, newer than the one
 *     already held (so nobody can roll it back to an older list), and made
 *     within the last ten minutes (so an old one can't be replayed).
 *
 * Then it rings the bellboy on the federation's news channel: a ping with no
 * content. Members' Q collect and check the signatures themselves; the gate
 * is a convenience, never an authority.
 *
 * No dependencies: Node's own http, fetch and WebCrypto, and mosquitto_pub.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = 8090;
const FILER = process.env.GATE_FILER ?? 'http://storage:8888';
const FEDERATIONS = new Set((process.env.GATE_FEDERATIONS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const ORIGINS = new Set((process.env.GATE_ORIGINS ?? 'https://inqbeta.com,https://inqbeta.dev,http://localhost:3100').split(',').map((s) => s.trim()));
const MQTT = { host: process.env.GATE_MQTT_HOST ?? 'mosquitto', user: 'gate', password: process.env.GATE_MQTT_PASSWORD ?? '' };
const DIRECTORY = process.env.GATE_DIRECTORY ?? 'http://dgraph-alpha:8080';
const MOST_BYTES = 64 * 1024;
const FRESH_MS = 10 * 60 * 1000;
/* Drops (cards shared by link): sealed, signed, and held only for a while. */
const DROP_BYTES = 1024 * 1024;
const DROP_DAYS = 30;
const DROPS_PER_HOUR = 30;
/*
 * Mint ledgers (ADR-Q-027): a mint's own receipts — what it made and destroyed,
 * holders' asks to cash out, and agreements settled in its credits — so the
 * mint always knows where every credit is from its own ledger, and nobody can
 * make a balance bigger by leaving receipts out. Only mints this node serves.
 */
const MINTS = new Set((process.env.GATE_MINTS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const LEDGER_BYTES = 64 * 1024;
const LEDGER_POSTS_PER_HOUR = 600;

/* ---- canonical JSON and Ed25519, exactly as q-core does them ---- */
export function canonical(value) {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}
const unb64url = (t) => Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function unbase58(s) {
	let n = 0n;
	for (const c of s) {
		const i = B58.indexOf(c);
		if (i < 0) throw new Error('not base58');
		n = n * 58n + BigInt(i);
	}
	const bytes = [];
	while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
	for (const c of s) { if (c === '1') bytes.unshift(0); else break; }
	return Uint8Array.from(bytes);
}
function base58(bytes) {
	let n = 0n;
	for (const b of bytes) n = n * 256n + BigInt(b);
	let out = '';
	while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
	for (const b of bytes) { if (b === 0) out = '1' + out; else break; }
	return out;
}
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
function publicKeyFrom(did) {
	if (!did.startsWith('did:key:z')) throw new Error('not a did:key');
	const b = unbase58(did.slice(9));
	if (b.length !== 34 || b[0] !== 0xed || b[1] !== 0x01) throw new Error('not Ed25519');
	return b.slice(2);
}
export async function signedByFederation(x, did) {
	const s = x?.signatures?.find((s) => s.by === 'federation');
	if (!s || s.did !== did) return false;
	const { signatures, ...statement } = x;
	try {
		const key = await crypto.subtle.importKey('raw', publicKeyFrom(did), { name: 'Ed25519' }, false, ['verify']);
		return await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64url(s.signature), new TextEncoder().encode(canonical(statement)));
	} catch {
		return false;
	}
}

/* A receipt as q-core seals it: Ed25519 over the canonical content, by its DID. */
export async function signedReceipt(r) {
	if (!r || typeof r !== 'object' || typeof r.did !== 'string' || typeof r.signature !== 'string' || !r.content) return false;
	try {
		const key = await crypto.subtle.importKey('raw', publicKeyFrom(r.did), { name: 'Ed25519' }, false, ['verify']);
		return await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64url(r.signature), new TextEncoder().encode(canonical(r.content)));
	} catch {
		return false;
	}
}

/*
 * A drop: a card (or later a message) shared by link. The gate can't read it
 * — it's locked with a key that lives only in the link's #fragment, which no
 * server ever sees — so all it checks is that someone signed for it, that it's
 * small, and that it says when it may be let go.
 */
export async function checkDrop(r, now = Date.now()) {
	if (!(await signedReceipt(r))) return 'It isn’t signed.';
	const c = r.content;
	if (c.schema !== 'inqbeta.drop/1' || typeof c.box?.iv !== 'string' || typeof c.box?.ct !== 'string') return 'That isn’t a drop.';
	const until = Date.parse(c.until);
	if (!Number.isFinite(until) || until < now || until > now + DROP_DAYS * 86400000 + 60000) return `It must say when it can go, within ${DROP_DAYS} days.`;
	return null;
}

/*
 * Inboxes (2 October 2026): a message sealed to someone waits here until
 * they collect it. The gate can't read it; it checks the sender signed the
 * post, that it's addressed to this inbox, small, and says when it may go.
 * Only the inbox's owner can list, collect and let go: their key hashes to
 * the inbox's id, and nobody else can make that key.
 */
/* 2 MB: room for a 2-minute voice message at 48 kbps once sealed (ADR-Q-022). */
const POST_BYTES = 2 * 1024 * 1024;
const POSTS_PER_HOUR = 120;

/*
 * The free allowance (ADR-Q-017 §4 and its 2 October addendum): storage is a
 * holding bay for passing things between people, not a place to keep them.
 * Two published limits, both set by the host:
 *   - what one inbox may hold at once, uncollected (so a forgotten inbox
 *     can't fill the unit);
 *   - what one person may send through storage in a day (so heavy use is
 *     what credits are for, once they exist).
 * Counted in totals only: nothing about who wrote to whom is kept.
 */
const MB = 1024 * 1024;
export const TERMS = {
	schema: 'inqbeta.storage-terms/1',
	postBytes: POST_BYTES,
	inboxHoldsBytes: Number(process.env.GATE_INBOX_HOLDS_MB ?? 25) * MB,
	sendBytesPerDay: Number(process.env.GATE_SEND_MB_PER_DAY ?? 50) * MB,
	postDays: 30,
	/* The relay (ADR-Q-028): a pass-through, so small. Off unless the node has a key (GATE_SEED). */
	relay: { fileBytes: Number(process.env.GATE_RELAY_FILE_MB ?? 25) * MB, holdsBytes: Number(process.env.GATE_RELAY_HOLDS_MB ?? 100) * MB, days: Number(process.env.GATE_RELAY_DAYS ?? 7), on: !!process.env.GATE_SEED }
};
const sentToday = new Map();
/** Adds this post to the sender's day, unless it goes over. Returns whether it fits. */
export function fitsToday(did, bytes, now = Date.now(), terms = TERMS) {
	const day = new Date(now).toISOString().slice(0, 10);
	const had = sentToday.get(did);
	const used = had?.day === day ? had.bytes : 0;
	if (used + bytes > terms.sendBytesPerDay) return false;
	sentToday.set(did, { day, bytes: used + bytes });
	if (sentToday.size > 50_000) for (const [k, v] of sentToday) if (v.day !== day) sentToday.delete(k);
	return true;
}
export async function ownsInbox(id, key) {
	if (typeof key !== 'string' || key.length < 20) return false;
	const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
	return Buffer.from(d).toString('base64url').slice(0, 22) === id;
}
export async function checkPost(r, inbox, now = Date.now()) {
	if (!(await signedReceipt(r))) return 'It isn’t signed.';
	const c = r.content;
	if (c.schema !== 'inqbeta.post/1' || c.to !== inbox || c.sealed?.schema !== 'dostudy.sealed/1') return 'That isn’t a post for this inbox.';
	const until = Date.parse(c.until);
	if (!Number.isFinite(until) || until < now || until > now + DROP_DAYS * 86400000 + 60000) return `It must say when it can go, within ${DROP_DAYS} days.`;
	return null;
}

/* ---- the checks ---- */
export async function checkSubmission(did, body, held, now = Date.now()) {
	const { file, publication } = body ?? {};
	if (!file || file.schema !== 'inqbeta.announcements/1' || file.federation !== did || !Array.isArray(file.announcements))
		return 'That isn’t this federation’s announcements.';
	for (const a of file.announcements) {
		if (a?.schema !== 'inqbeta.announcement/1' || a.federation !== did) return 'An announcement is from somewhere else.';
		if (!(await signedByFederation(a, did))) return `“${a.title ?? 'An announcement'}” isn’t signed by the federation.`;
	}
	if (!publication || publication.schema !== 'inqbeta.announcements-publication/1' || publication.federation !== did)
		return 'The publication is missing.';
	if (!(await signedByFederation(publication, did))) return 'The publication isn’t signed by the federation.';
	const ids = file.announcements.map((a) => a.id).sort();
	if (canonical(ids) !== canonical([...(publication.ids ?? [])].sort())) return 'The publication doesn’t match the announcements.';
	const at = Date.parse(publication.at);
	if (!Number.isFinite(at) || Math.abs(now - at) > FRESH_MS) return 'The publication is too old, or from the future.';
	if (held?.publication?.at && Date.parse(held.publication.at) >= at) return 'A newer publication is already held.';
	return null;
}

/* ---- storage (the SeaweedFS filer, inside the node) ---- */
const pathFor = (did) => `${FILER}/fed/${did.replace(/[^A-Za-z0-9]/g, '_')}/announcements.json`;
async function held(did) {
	const r = await fetch(pathFor(did)).catch(() => null);
	return r?.ok ? r.json().catch(() => null) : null;
}
async function store(did, body) {
	const form = new FormData();
	form.append('file', new Blob([JSON.stringify(body)], { type: 'application/json' }), 'announcements.json');
	const r = await fetch(pathFor(did), { method: 'POST', body: form });
	if (!r.ok) throw new Error(`storage said ${r.status}`);
}
function ping(did, at) {
	if (!MQTT.password) return;
	const p = spawn('mosquitto_pub', ['-h', MQTT.host, '-u', MQTT.user, '-P', MQTT.password, '-q', '1', '-t', `q/fed/${did}/news`, '-m', JSON.stringify({ schema: 'inqbeta.news-ping/1', federation: did, at })]);
	p.on('error', () => {});
}

const dropPath = (id) => `${FILER}/drop/${id}.json`;
async function storeDrop(id, body) {
	const form = new FormData();
	form.append('file', new Blob([JSON.stringify(body)], { type: 'application/json' }), `${id}.json`);
	const r = await fetch(dropPath(id), { method: 'POST', body: form });
	if (!r.ok) throw new Error(`storage said ${r.status}`);
}
/* A light hand on the tap: so many drops an hour from one address. */
const recent = new Map();
function tooMany(ip, now = Date.now(), most = DROPS_PER_HOUR) {
	const list = (recent.get(ip) ?? []).filter((t) => now - t < 3600000);
	list.push(now);
	recent.set(ip, list);
	return list.length > most;
}

const inboxDir = (id) => `${FILER}/inbox/${id}/`;
async function inboxEntries(id) {
	const r = await fetch(inboxDir(id), { headers: { accept: 'application/json' } }).catch(() => null);
	if (!r?.ok) return [];
	const j = await r.json().catch(() => ({}));
	return (j.Entries ?? [])
		.map((e) => ({ name: String(e.FullPath ?? '').split('/').pop(), size: Number(e.FileSize ?? e.chunks?.reduce?.((n, c) => n + (c.size ?? 0), 0) ?? 0) }))
		.filter((e) => e.name.endsWith('.json'));
}
async function inboxList(id) {
	return (await inboxEntries(id)).map((e) => e.name.slice(0, -5));
}
async function inboxHeld(id) {
	return (await inboxEntries(id)).reduce((n, e) => n + e.size, 0);
}
function pingInbox(id) {
	if (!MQTT.password) return;
	const p = spawn('mosquitto_pub', ['-h', MQTT.host, '-u', MQTT.user, '-P', MQTT.password, '-q', '1', '-t', `q/inbox/${id}`, '-m', JSON.stringify({ schema: 'inqbeta.inbox-ping/1', at: new Date().toISOString() })]);
	p.on('error', () => {});
}

/* ---- Mint ledgers ---- */
const isCredit = (v, mint, mode) => !!v && typeof v === 'object' && Number.isInteger(v.credits) && v.mint === mint && v.mode === mode;
/**
 * Why a receipt can't go in this mint's ledger, or null if it can. Signed, for
 * this mint and mode, and by the right person: the mint for what it makes and
 * destroys, the holder for their own ask, either side for an agreement in this
 * mint's credits.
 */
export async function checkLedgerEntry(r, mint, mode, known = new Set()) {
	if (!(await signedReceipt(r))) return 'It isn’t signed.';
	const c = r.content;
	if (c?.schema === 'inqbeta.mint/1') {
		if (c.mint !== mint || c.mode !== mode) return 'It belongs to another mint or mode.';
		if (!Number.isInteger(c.credits) || c.credits < 1) return 'It moves no credits.';
		if ((c.kind === 'mint' || c.kind === 'burn') && r.did === mint) return null;
		if (c.kind === 'cashout' && r.did === c.from) return null;
		return 'Only the mint makes and destroys its credits, and only the holder asks to cash out.';
	}
	if (c?.schema === 'inqbeta.agreement/1') {
		const t = c.terms;
		const inTerms = t && (isCredit(t.aGives, mint, mode) || isCredit(t.bGives, mint, mode));
		const inEntries = Array.isArray(c.entries) && c.entries.some((e) => isCredit(e?.value, mint, mode));
		if (inTerms || inEntries) return null;
		/* A step that names no credits (agreed, done, declined…) belongs if its agreement is already here. */
		if (known.has(c.agreement)) return null;
		return 'That agreement isn’t in this mint’s credits.';
	}
	/* The bank's books, signed by the mint at its treasurer's ask, and the ask itself (ADR-Q-035). */
	if (c?.schema === 'inqbeta.mint-reconciled/1') {
		if (c.mint !== mint || c.mode !== mode) return 'It belongs to another mint or mode.';
		return r.did === mint ? null : 'Only the mint signs its reconciliation.';
	}
	if (c?.schema === 'inqbeta.mint-reconcile-ask/1') return c.mint === mint ? null : 'That ask is for another mint.';
	return 'That isn’t a mint receipt, a reconciliation or an agreement.';
}
const ledgerDir = (mint, mode) => `${FILER}/mint/${mint}/${mode}/`;
async function ledgerList(mint, mode) {
	const r = await fetch(ledgerDir(mint, mode), { headers: { accept: 'application/json' } }).catch(() => null);
	if (!r?.ok) return [];
	const j = await r.json().catch(() => ({}));
	const names = (j.Entries ?? []).map((e) => String(e.FullPath ?? '').split('/').pop()).filter((n) => n.endsWith('.json'));
	const out = [];
	for (const n of names.slice(0, 5000)) {
		const f = await fetch(`${ledgerDir(mint, mode)}${n}`).catch(() => null);
		const x = f?.ok ? await f.json().catch(() => null) : null;
		if (x) out.push(x);
	}
	return out;
}
async function ledgers(req, res, origin, mint, mode) {
	if (!MINTS.has(mint)) return send(res, origin, 404, { says: 'This node doesn’t keep that mint’s ledger.' });
	if (req.method === 'GET') return send(res, origin, 200, { mint, mode, receipts: await ledgerList(mint, mode) });
	if (req.method !== 'POST') return send(res, origin, 405, { says: 'Only GET and POST.' });
	if (tooMany(`ledger:${req.socket.remoteAddress ?? ''}`, Date.now(), LEDGER_POSTS_PER_HOUR)) return send(res, origin, 429, { says: 'Too many at once. Try again in a while.' });
	const raw = await readBody(req, LEDGER_BYTES);
	if (raw === null) return send(res, origin, 413, { says: 'Too big.' });
	let body;
	try { body = JSON.parse(raw); } catch { return send(res, origin, 400, { says: 'That isn’t JSON.' }); }
	const known = new Set((await ledgerList(mint, mode)).map((x) => x?.content?.agreement).filter(Boolean));
	const wrong = await checkLedgerEntry(body, mint, mode, known);
	if (wrong) return send(res, origin, 403, { says: wrong });
	const name = String(body.contentHash ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
	if (!name) return send(res, origin, 400, { says: 'It has no content hash.' });
	const form = new FormData();
	form.append('file', new Blob([JSON.stringify(body)], { type: 'application/json' }), `${name}.json`);
	const r = await fetch(`${ledgerDir(mint, mode)}${name}.json`, { method: 'POST', body: form }).catch((e) => ({ ok: false, status: e.message }));
	if (!r.ok) return send(res, origin, 502, { says: `Couldn’t keep it: ${r.status}` });
	return send(res, origin, 200, { ok: true });
}

/*
 * Shops (ADR-Q-026): a person's standing offers, held publicly so anyone can
 * see and buy while the seller is away. Only the seller lists and withdraws;
 * anyone else can take, and the gate counts takings against the stock — first
 * come, first served, one at a time per shop, so a jar can't be sold twice.
 * A seller can cancel a taking as sold out, which puts it back.
 */
const SHOP_BYTES = 256 * 1024;
const SHOP_LISTINGS = 50;
const SHOP_POSTS_PER_HOUR = 300;
const isAgreement = (r) => r?.content?.schema === 'inqbeta.agreement/1';
/** Apply one signed step to a shop. Returns the new shop, or a reason it can't. */
export async function applyToShop(shop, r, seller, now = Date.now()) {
	if (!(await signedReceipt(r)) || !isAgreement(r)) return { says: 'It isn’t a signed agreement step.' };
	const c = r.content;
	const listings = [...(shop?.listings ?? [])];
	const find = (hash) => listings.findIndex((l) => l.offer.contentHash === hash);
	if (c.step === 'proposed') {
		if (r.did !== seller) return { says: 'Only the shop’s owner lists in it.' };
		const t = c.terms;
		if (!t || t.a !== seller || t.b !== '' || !Number.isInteger(c.limit) || c.limit < 1 || c.parent !== null) return { says: 'A shop offer is open to anyone, with a number available.' };
		if (find(r.contentHash) >= 0) return { shop: { listings } };
		if (listings.filter((l) => !l.ended).length >= SHOP_LISTINGS) return { says: `A shop holds up to ${SHOP_LISTINGS} offers.` };
		listings.push({ offer: r, takings: [], cancelled: [] });
		return { shop: { listings } };
	}
	if (c.step === 'withdrawn') {
		const i = find(c.parent);
		if (i < 0 || r.did !== seller) return { says: 'Only the shop’s owner withdraws its offers.' };
		listings[i] = { ...listings[i], ended: c.at };
		return { shop: { listings } };
	}
	if (c.step === 'taken') {
		const i = find(c.parent);
		if (i < 0) return { says: 'That isn’t in this shop.' };
		const l = listings[i];
		const o = l.offer.content;
		if (l.ended) return { says: 'That’s no longer in the shop.' };
		if (o.until && Date.parse(o.until) < now) return { says: 'That offer has run out.' };
		if (r.did === seller) return { says: 'You can’t buy from your own shop.' };
		if (!c.agreement.startsWith(`${o.agreement}.`) || !c.terms || c.terms.b !== r.did || canonical({ ...c.terms, b: '' }) !== canonical(o.terms)) return { says: 'A purchase must be on the shop offer’s own terms.' };
		if (l.takings.some((t) => t.contentHash === r.contentHash)) return { shop: { listings } };
		if (l.takings.length - l.cancelled.length >= o.limit) return { says: 'Sold out.' };
		listings[i] = { ...l, takings: [...l.takings, r] };
		return { shop: { listings } };
	}
	if (c.step === 'declined') {
		if (r.did !== seller) return { says: 'Only the shop’s owner cancels a sale.' };
		const i = listings.findIndex((l) => l.takings.some((t) => t.contentHash === c.parent));
		if (i < 0) return { says: 'That sale isn’t in this shop.' };
		if (listings[i].cancelled.includes(c.parent)) return { shop: { listings } };
		listings[i] = { ...listings[i], cancelled: [...listings[i].cancelled, c.parent] };
		return { shop: { listings } };
	}
	return { says: 'A shop keeps listings, purchases and cancellations only.' };
}
/** What anyone sees: open listings, each with how many are left. */
export function shopWindow(shop, now = Date.now()) {
	return (shop?.listings ?? [])
		.filter((l) => !l.ended && !(l.offer.content.until && Date.parse(l.offer.content.until) < now))
		.map((l) => ({ offer: l.offer, left: Math.max(0, l.offer.content.limit - (l.takings.length - l.cancelled.length)), taken: l.takings.map((t) => t.contentHash) }));
}
const shopPath = (did) => `${FILER}/shop/${did.replace(/[^A-Za-z0-9]/g, '_')}/shop.json`;
async function shopHeld(did) {
	const r = await fetch(shopPath(did)).catch(() => null);
	return r?.ok ? r.json().catch(() => null) : null;
}
const shopQueue = new Map();
async function shops(req, res, origin, did) {
	if (req.method === 'GET') {
		const held = await shopHeld(did);
		return send(res, origin, 200, { seller: did, about: held?.about ?? {}, listings: shopWindow(held) });
	}
	if (req.method !== 'POST') return send(res, origin, 405, { says: 'Only GET and POST.' });
	if (tooMany(`shop:${req.socket.remoteAddress ?? ''}`, Date.now(), SHOP_POSTS_PER_HOUR)) return send(res, origin, 429, { says: 'Too many at once. Try again in a while.' });
	const raw = await readBody(req, LEDGER_BYTES);
	if (raw === null) return send(res, origin, 413, { says: 'Too big.' });
	let body;
	try { body = JSON.parse(raw); } catch { return send(res, origin, 400, { says: 'That isn’t JSON.' }); }
	/* One at a time per shop: two buyers of the last jar can't both have it. */
	const prev = shopQueue.get(did) ?? Promise.resolve();
	const run = prev.then(async () => {
		/* The seller may say, with a listing, who they are and where purchases go. */
		const r = body?.receipt ?? body;
		const held = await shopHeld(did);
		const out = await applyToShop(held, r, did);
		if (out.says) return { status: out.says === 'Sold out.' ? 409 : 403, body: { says: out.says } };
		let about = held?.about ?? {};
		if (body?.receipt && body.about && r.did === did) {
			about = {
				name: String(body.about.name ?? '').slice(0, 80),
				inbox: String(body.about.inbox ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 22)
			};
		}
		const text = JSON.stringify({ ...out.shop, about });
		if (text.length > SHOP_BYTES) return { status: 413, body: { says: 'The shop is full.' } };
		const form = new FormData();
		form.append('file', new Blob([text], { type: 'application/json' }), 'shop.json');
		const kept = await fetch(shopPath(did), { method: 'POST', body: form }).catch((e) => ({ ok: false, status: e.message }));
		return kept.ok ? { status: 200, body: { ok: true, about, listings: shopWindow(out.shop) } } : { status: 502, body: { says: `Couldn’t keep it: ${kept.status}` } };
	});
	shopQueue.set(did, run.catch(() => {}));
	const { status, body: answer } = await run.catch((e) => ({ status: 500, body: { says: e.message } }));
	return send(res, origin, status, answer);
}

/*
 * The relay (ADR-Q-028, 3 October 2026): a pass-through, never a copy.
 *
 * A sealed vault file waits here only while its owner's cloud can't take it.
 * The node signs a "held" receipt for each file it takes, saying when it will
 * let go at the latest; it deletes a file only on its owner's signed
 * "arrived" receipt (the file is held somewhere else now), or at that time.
 * Nothing is let go until it's held elsewhere: deleting is settling, and you
 * can't settle without confirmation.
 *
 * A person's space is named by a key only their passkey makes (like an
 * inbox). Files must match their content names, so "held" is true of the
 * bytes. Totals per day — files, bytes, byte-hours — are kept with nothing
 * about whose they were: the data to price pass-through from.
 */
const RELAY_FILE_BYTES = Number(process.env.GATE_RELAY_FILE_MB ?? 25) * MB;
const RELAY_HOLDS_BYTES = Number(process.env.GATE_RELAY_HOLDS_MB ?? 100) * MB;
const RELAY_DAYS = Number(process.env.GATE_RELAY_DAYS ?? 7);
const RELAY_POSTS_PER_HOUR = 600;
/*
 * Open hours (ADR-Q-028 §5, pass-through by the hour): "if things are passing
 * through between midday and 6 o'clock, I will make my node live and open."
 * GATE_RELAY_HOURS="12-18" takes new files only in those hours (UTC); unset
 * means always. Outside them it still gives back and lets go what it holds:
 * a node that's closed never keeps anything longer because it's closed.
 */
export function relayHours(text = process.env.GATE_RELAY_HOURS ?? '') {
	const m = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(text);
	if (!m) return null;
	const from = Number(m[1]), to = Number(m[2]);
	return from >= 0 && from <= 24 && to >= 0 && to <= 24 && from !== to ? { from, to } : null;
}
/** Whether the relay takes new files at this moment. Hours may wrap past midnight (22-6). */
export function relayOpen(hours, now = new Date()) {
	if (!hours) return true;
	const h = now.getUTCHours() + now.getUTCMinutes() / 60;
	return hours.from < hours.to ? h >= hours.from && h < hours.to : h >= hours.from || h < hours.to;
}
const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');
let node = null;
/** The node's own signing key, from GATE_SEED (32 bytes, hex or base64url). No seed, no relay. */
export async function nodeIdentity(seedText = process.env.GATE_SEED ?? '') {
	if (node && !seedText) return node;
	const t = seedText.trim();
	const seed = /^[0-9a-f]{64}$/i.test(t) ? Buffer.from(t, 'hex') : t ? unb64url(t) : null;
	if (!seed || seed.length !== 32) return null;
	const der = Buffer.concat([PKCS8_ED25519, seed]);
	const probe = await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, true, ['sign']);
	const { x } = await crypto.subtle.exportKey('jwk', probe);
	const pub = unb64url(x);
	const privateKey = await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']);
	const id = { did: `did:key:z${base58(Uint8Array.from([0xed, 0x01, ...pub]))}`, publicKey: b64url(pub), privateKey };
	if (seedText === (process.env.GATE_SEED ?? '')) node = id;
	return id;
}
/** Seal as the node, exactly as q-core's sealWith does, so Q's checkReceipt accepts it. */
export async function sealAsNode(id, content) {
	const plain = canonical(content);
	const contentHash = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain))));
	const sig = await crypto.subtle.sign({ name: 'Ed25519' }, id.privateKey, new TextEncoder().encode(plain));
	return { schema: 'inqbeta.receipt/1', source: content.source, did: id.did, publicKey: id.publicKey, signedAt: new Date().toISOString(), contentHash, signature: b64url(sig), content };
}
export const relayWhere = (id) => `relay:${id.did}`;
const hexOf = async (bytes) => Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
/** Why the relay won't take this file, or null. */
export async function checkRelayFile(name, bytes, held, terms = { file: RELAY_FILE_BYTES, holds: RELAY_HOLDS_BYTES }) {
	if (!/^[0-9a-f]{64}$/.test(name)) return 'A file is named by its content hash.';
	if (!bytes.length) return 'That file is empty.';
	if (bytes.length > terms.file) return 'That file is too big for the relay.';
	if ((await hexOf(bytes)) !== name) return 'That file doesn’t match its name.';
	if (held + bytes.length > terms.holds) return 'Your space at the relay is full. Q will try again once your cloud has taken some.';
	return null;
}
/** Why an "arrived" receipt doesn't release this file here, or null. */
export async function checkArrival(r, item, where) {
	if (!(await signedReceipt(r))) return 'It isn’t signed.';
	const c = r.content;
	if (c?.schema !== 'inqbeta.custody/1' || c.kind !== 'arrived' || c.item !== item) return 'That isn’t an arrival for this file.';
	if (c.releases !== where) return 'That arrival releases another pass-through.';
	if (!c.where || c.where === where) return 'It must have arrived somewhere else.';
	return null;
}
const relayDir = (id) => `${FILER}/relay/${id}/`;
async function relayMetas(id) {
	const r = await fetch(relayDir(id), { headers: { accept: 'application/json' } }).catch(() => null);
	if (!r?.ok) return [];
	const j = await r.json().catch(() => ({}));
	const names = (j.Entries ?? []).map((e) => String(e.FullPath ?? '').split('/').pop()).filter((n) => n.endsWith('.json'));
	const out = [];
	for (const n of names.slice(0, 5000)) {
		const f = await fetch(`${relayDir(id)}${n}`).catch(() => null);
		const m = f?.ok ? await f.json().catch(() => null) : null;
		if (m) out.push(m);
	}
	return out;
}
async function relayForget(id, item) {
	await fetch(`${relayDir(id)}${item}.dsv`, { method: 'DELETE' }).catch(() => null);
	await fetch(`${relayDir(id)}${item}.json`, { method: 'DELETE' }).catch(() => null);
}
/* Totals per day, nothing about whose: files and bytes in, released, timed out, and byte-hours held. */
const statsPath = (day) => `${FILER}/relay-stats/${day}.json`;
let statsQueue = Promise.resolve();
export function addToStats(stats, event, m, now = Date.now()) {
	const s = { day: new Date(now).toISOString().slice(0, 10), in: { items: 0, bytes: 0 }, arrived: { items: 0, bytes: 0, byteHours: 0 }, timedOut: { items: 0, bytes: 0, byteHours: 0 }, ...(stats ?? {}) };
	if (event === 'in') s.in = { items: s.in.items + 1, bytes: s.in.bytes + m.bytes };
	else {
		const hours = Math.max(0, now - Date.parse(m.at)) / 3_600_000;
		const k = event === 'arrived' ? 'arrived' : 'timedOut';
		s[k] = { items: s[k].items + 1, bytes: s[k].bytes + m.bytes, byteHours: s[k].byteHours + m.bytes * hours };
	}
	return s;
}
function count(event, m) {
	const day = new Date().toISOString().slice(0, 10);
	statsQueue = statsQueue.then(async () => {
		const r = await fetch(statsPath(day)).catch(() => null);
		const had = r?.ok ? await r.json().catch(() => null) : null;
		const form = new FormData();
		form.append('file', new Blob([JSON.stringify(addToStats(had, event, m))], { type: 'application/json' }), `${day}.json`);
		await fetch(statsPath(day), { method: 'POST', body: form }).catch(() => null);
	}).catch(() => {});
}
async function readBytes(req, most) {
	const parts = [];
	let n = 0;
	for await (const chunk of req) {
		n += chunk.length;
		if (n > most) return null;
		parts.push(chunk);
	}
	return Buffer.concat(parts);
}
const RELAY = /^\/relay(?:\/(stats|[A-Za-z0-9_-]{22})(?:\/([0-9a-f]{64}))?)?$/;
async function relays(req, res, origin, id, item) {
	const me = await nodeIdentity();
	if (!me) return send(res, origin, 404, { says: 'This node doesn’t offer a pass-through.' });
	const where = relayWhere(me);
	const hours = relayHours();
	if (!id && req.method === 'GET') return send(res, origin, 200, { schema: 'inqbeta.relay-terms/1', where, did: me.did, fileBytes: RELAY_FILE_BYTES, holdsBytes: RELAY_HOLDS_BYTES, days: RELAY_DAYS, hours, openNow: relayOpen(hours) });
	if (id === 'stats' && req.method === 'GET') {
		const days = [];
		for (let i = 0; i < 30; i++) {
			const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
			const r = await fetch(statsPath(day)).catch(() => null);
			const s = r?.ok ? await r.json().catch(() => null) : null;
			if (s) days.push(s);
		}
		return send(res, origin, 200, { where, days });
	}
	if (!id || id === 'stats') return send(res, origin, 405, { says: 'Not like that.' });
	if (!(await ownsInbox(id, req.headers['x-relay-key']))) return send(res, origin, 403, { says: 'That space isn’t yours.' });
	const now = Date.now();
	/* Anything past its time goes first, whatever's asked. */
	const metas = [];
	for (const m of await relayMetas(id)) {
		if (Date.parse(m.until) < now) {
			await relayForget(id, m.item);
			count('timedOut', m);
		} else metas.push(m);
	}
	if (req.method === 'GET' && !item) return send(res, origin, 200, { where, files: metas });
	if (req.method === 'GET') {
		const r = await fetch(`${relayDir(id)}${item}.dsv`).catch(() => null);
		if (!r?.ok) return send(res, origin, 404, { says: 'Not here.' });
		const bytes = Buffer.from(await r.arrayBuffer());
		res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store', ...(ORIGINS.has(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}) });
		return res.end(bytes);
	}
	if (req.method === 'POST' && item) {
		if (!relayOpen(hours)) return send(res, origin, 503, { says: `The pass-through is open ${String(hours.from).padStart(2, '0')}:00 to ${String(hours.to).padStart(2, '0')}:00 (UTC). What it holds is still given back and let go.` });
		if (tooMany(`relay:${req.socket.remoteAddress ?? ''}`, now, RELAY_POSTS_PER_HOUR)) return send(res, origin, 429, { says: 'Too many at once. Try again in a while.' });
		const bytes = await readBytes(req, RELAY_FILE_BYTES);
		if (bytes === null) return send(res, origin, 413, { says: 'That file is too big for the relay.' });
		const had = metas.find((m) => m.item === item);
		if (!had) {
			const wrong = await checkRelayFile(item, bytes, metas.reduce((n, m) => n + m.bytes, 0));
			if (wrong) return send(res, origin, wrong.includes('full') ? 507 : 400, { says: wrong });
		}
		const path = String(new URL(req.url, 'http://gate').searchParams.get('path') ?? `${item}.dsv`).replace(/[^A-Za-z0-9_./-]/g, '').replace(/\.\.+/g, '.').slice(0, 200);
		const meta = had ?? { item, path, bytes: bytes.length, at: new Date(now).toISOString(), until: new Date(now + RELAY_DAYS * 86400000).toISOString() };
		if (!had) {
			const f = new FormData();
			f.append('file', new Blob([bytes], { type: 'application/octet-stream' }), `${item}.dsv`);
			const put = await fetch(`${relayDir(id)}${item}.dsv`, { method: 'POST', body: f }).catch((e) => ({ ok: false, status: e.message }));
			if (!put.ok) return send(res, origin, 502, { says: `Couldn’t hold it: ${put.status}` });
			const g = new FormData();
			g.append('file', new Blob([JSON.stringify(meta)], { type: 'application/json' }), `${item}.json`);
			await fetch(`${relayDir(id)}${item}.json`, { method: 'POST', body: g }).catch(() => null);
			count('in', meta);
		}
		const held = await sealAsNode(me, { schema: 'inqbeta.custody/1', source: 'inqbeta:q/custody', kind: 'held', item, bytes: meta.bytes, where, at: meta.at, until: meta.until });
		return send(res, origin, 200, { ok: true, held });
	}
	if (req.method === 'DELETE' && item) {
		const m = metas.find((x) => x.item === item);
		if (!m) return send(res, origin, 200, { ok: true, says: 'It wasn’t here.' });
		const raw = await readBody(req, LEDGER_BYTES);
		let arrival = null;
		try { arrival = JSON.parse(raw ?? ''); } catch { arrival = null; }
		const wrong = await checkArrival(arrival, item, where);
		if (wrong) return send(res, origin, 403, { says: `Not let go: ${wrong} Nothing is let go until it’s held somewhere else.` });
		await relayForget(id, item);
		count('arrived', m);
		return send(res, origin, 200, { ok: true });
	}
	return send(res, origin, 405, { says: 'Not like that.' });
}

/*
 * Kept storage (ADR-Q-030 §1, §4, 4 October 2026): space set aside by the
 * month, holding a full copy of a person's sealed vault. Darren: "Use us as a
 * storage source … click that. You get all the receipts you need to then have
 * your own vault automatically sync, create a copy."
 *
 * Space is only ever given against a purchase this node can check for itself:
 * a taking from a shop held here, of a listing by one of this node's
 * operators (GATE_OPERATORS), naming this node, not cancelled. The buyer binds
 * it to their space with a signed note; their space is named, like the relay,
 * by a key only their passkey makes. Files go in and come back; nothing is
 * deleted by the hirer's sync (it's a copy), and the node reads none of it:
 * every vault file is sealed. Writes stop when the term ends.
 */
const OPERATORS = new Set((process.env.GATE_OPERATORS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const STORE_FILE_BYTES = Number(process.env.GATE_STORE_FILE_MB ?? 25) * MB;
const STORE_POSTS_PER_HOUR = 6000;
const GB = 1024 * MB;
const storeDir = (id) => `${FILER}/store/${id}/`;
const storeIndexPath = (id) => `${storeDir(id)}index.json`;
const storeFilePath = (id, path) => `${storeDir(id)}f/${path.split('/').map(encodeURIComponent).join('/')}`;
/** A vault path as Q lists them: plain names, folders with '/', nothing climbing out. */
export const storePathOk = (p) => typeof p === 'string' && /^[A-Za-z0-9 _.()/-]{1,200}$/.test(p) && !p.startsWith('/') && !p.split('/').some((x) => x === '' || x === '.' || x === '..');
const STORE_MONTH_MS = 30 * 86400000;
/** What a hire gives, or why it doesn't: the purchase checked against the shop held here. */
export async function checkStoreHire(body, id, me, shopOf, operators = OPERATORS, now = Date.now()) {
	const { taken, bind } = body ?? {};
	if (!(await signedReceipt(taken)) || !isAgreement(taken) || taken.content.step !== 'taken') return { says: 'That isn’t a signed purchase.' };
	if (!(await signedReceipt(bind)) || bind.content?.schema !== 'inqbeta.store-bind/1' || bind.did !== taken.did || bind.content.agreement !== taken.content.agreement || bind.content.id !== id)
		return { says: 'The purchase must be bound to this space by the person who made it.' };
	const t = taken.content.terms;
	const sv = t?.service;
	if (sv?.kind !== 'store' || sv.where !== relayWhere(me)) return { says: 'That purchase isn’t for storage at this node.' };
	if (!operators.has(t.a)) return { says: 'That seller doesn’t run this node.' };
	const shop = await shopOf(t.a);
	const l = (shop?.listings ?? []).find((x) => x.offer.contentHash === taken.content.parent);
	if (!l || !l.takings.some((x) => x.contentHash === taken.contentHash) || l.cancelled.includes(taken.contentHash)) return { says: 'That purchase isn’t in the seller’s shop here.' };
	if (canonical({ ...t, b: '' }) !== canonical(l.offer.content.terms)) return { says: 'That purchase isn’t on the shop’s terms.' };
	const from = Date.parse(taken.content.at);
	const until = from + sv.months * STORE_MONTH_MS;
	if (!Number.isFinite(until) || until < now) return { says: 'That term has ended.' };
	return { hire: { agreement: taken.content.agreement, did: taken.did, bytes: sv.gb * GB, from: new Date(from).toISOString(), until: new Date(until).toISOString() } };
}
/*
 * After the term (Darren, 4 October 2026): a kept copy isn't kept for ever.
 * Writes stop when the last term ends; the copy can still be read back for a
 * grace of GATE_STORE_GRACE_DAYS (7), time to renew or take it elsewhere; then
 * the space is cleared. Taking storage again inside the grace keeps it all.
 */
const STORE_GRACE_DAYS = Number(process.env.GATE_STORE_GRACE_DAYS ?? 7);
/** When a space will be cleared if nobody renews: its last term's end, plus the grace. Null with no hires. */
export function storeClearsAt(index, graceDays = STORE_GRACE_DAYS) {
	const ends = (index?.hires ?? []).map((h) => Date.parse(h.until)).filter(Number.isFinite);
	return ends.length ? new Date(Math.max(...ends) + graceDays * 86400000).toISOString() : null;
}
/** Clear every space whose grace has run out. Returns how many were cleared. */
export async function sweepStores(now = Date.now()) {
	const r = await fetch(`${FILER}/store/`, { headers: { accept: 'application/json' } }).catch(() => null);
	if (!r?.ok) return 0;
	const j = await r.json().catch(() => ({}));
	const ids = (j.Entries ?? []).map((e) => String(e.FullPath ?? '').split('/').pop()).filter((n) => /^[A-Za-z0-9_-]{22}$/.test(n));
	let cleared = 0;
	for (const id of ids) {
		const done = await inStoreQueue(id, async () => {
			const clears = storeClearsAt(await storeIndex(id));
			if (!clears || Date.parse(clears) > now) return false;
			const del = await fetch(`${storeDir(id)}?recursive=true&ignoreRecursiveError=true`, { method: 'DELETE' }).catch(() => null);
			return !!del?.ok;
		});
		if (done) cleared++;
	}
	return cleared;
}
/** The space a store has right now: the sum of its hires still running. */
export const storeQuota = (index, now = Date.now()) => (index?.hires ?? []).filter((h) => Date.parse(h.until) > now).reduce((n, h) => n + h.bytes, 0);
async function storeIndex(id) {
	const r = await fetch(storeIndexPath(id)).catch(() => null);
	return (r?.ok ? await r.json().catch(() => null) : null) ?? { hires: [], files: {} };
}
async function keepStoreIndex(id, index) {
	const f = new FormData();
	f.append('file', new Blob([JSON.stringify(index)], { type: 'application/json' }), 'index.json');
	const r = await fetch(storeIndexPath(id), { method: 'POST', body: f }).catch((e) => ({ ok: false, status: e.message }));
	return r.ok;
}
const storeQueue = new Map();
/** One change at a time per space, so two writes can't both fit the last megabyte. */
function inStoreQueue(id, fn) {
	const run = (storeQueue.get(id) ?? Promise.resolve()).then(fn);
	storeQueue.set(id, run.catch(() => {}));
	return run;
}
const STORE = /^\/store(?:\/([A-Za-z0-9_-]{22})(?:\/(hire|f\/.+))?)?$/;
async function stores(req, res, origin, id, rest) {
	const me = await nodeIdentity();
	if (!me || !OPERATORS.size) return send(res, origin, 404, { says: 'This node doesn’t keep storage.' });
	const where = relayWhere(me);
	if (!id && req.method === 'GET') return send(res, origin, 200, { schema: 'inqbeta.store-terms/1', where, did: me.did, operators: [...OPERATORS], fileBytes: STORE_FILE_BYTES });
	if (!id) return send(res, origin, 405, { says: 'Not like that.' });
	if (!(await ownsInbox(id, req.headers['x-relay-key']))) return send(res, origin, 403, { says: 'That space isn’t yours.' });
	const now = Date.now();
	if (rest === 'hire' && req.method === 'POST') {
		const raw = await readBody(req, LEDGER_BYTES);
		let body = null;
		try { body = JSON.parse(raw ?? ''); } catch { body = null; }
		const out = await checkStoreHire(body, id, me, shopHeld);
		if (out.says) return send(res, origin, 403, { says: out.says });
		const answer = await inStoreQueue(id, async () => {
			const index = await storeIndex(id);
			if (!index.hires.some((h) => h.agreement === out.hire.agreement)) index.hires.push(out.hire);
			return (await keepStoreIndex(id, index)) ? { ok: true, quota: storeQuota(index, now), hires: index.hires } : null;
		});
		return answer ? send(res, origin, 200, answer) : send(res, origin, 502, { says: 'Couldn’t keep it just now.' });
	}
	if (!rest && req.method === 'GET') {
		const index = await storeIndex(id);
		const files = Object.entries(index.files).map(([path, bytes]) => ({ path, bytes }));
		return send(res, origin, 200, { where, hires: index.hires, quota: storeQuota(index, now), used: files.reduce((n, f) => n + f.bytes, 0), files, clears: storeClearsAt(index), graceDays: STORE_GRACE_DAYS });
	}
	if (rest?.startsWith('f/')) {
		let path = '';
		try { path = decodeURIComponent(rest.slice(2)); } catch { path = ''; }
		if (!storePathOk(path)) return send(res, origin, 400, { says: 'That isn’t a vault path.' });
		if (req.method === 'GET') {
			const r = await fetch(storeFilePath(id, path)).catch(() => null);
			if (!r?.ok) return send(res, origin, 404, { says: 'Not here.' });
			const bytes = Buffer.from(await r.arrayBuffer());
			res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store', ...(ORIGINS.has(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}) });
			return res.end(bytes);
		}
		if (req.method === 'POST') {
			if (tooMany(`store:${id}`, now, STORE_POSTS_PER_HOUR)) return send(res, origin, 429, { says: 'Too many at once. Try again in a while.' });
			const bytes = await readBytes(req, STORE_FILE_BYTES);
			if (bytes === null) return send(res, origin, 413, { says: 'That file is too big.' });
			const name = path.split('/').pop();
			if (/^[0-9a-f]{64}\.dsv$/.test(name) && (await hexOf(bytes)) !== name.slice(0, 64)) return send(res, origin, 400, { says: 'That file doesn’t match its name.' });
			const answer = await inStoreQueue(id, async () => {
				const index = await storeIndex(id);
				const quota = storeQuota(index, now);
				if (!quota) return { status: 402, body: { says: 'There’s no storage running for this space. Take some from the shop.' } };
				const used = Object.entries(index.files).reduce((n, [p, b]) => n + (p === path ? 0 : b), 0);
				if (used + bytes.length > quota) return { status: 507, body: { says: 'Your kept storage is full.' } };
				const f = new FormData();
				f.append('file', new Blob([bytes], { type: 'application/octet-stream' }), name);
				const put = await fetch(storeFilePath(id, path), { method: 'POST', body: f }).catch((e) => ({ ok: false, status: e.message }));
				if (!put.ok) return { status: 502, body: { says: `Couldn’t keep it: ${put.status}` } };
				index.files[path] = bytes.length;
				return (await keepStoreIndex(id, index)) ? { status: 200, body: { ok: true, used: used + bytes.length, quota } } : { status: 502, body: { says: 'Couldn’t note it just now.' } };
			});
			return send(res, origin, answer.status, answer.body);
		}
	}
	return send(res, origin, 405, { says: 'Not like that.' });
}

/* ---- HTTP ---- */
function send(res, origin, status, body) {
	const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
	if (ORIGINS.has(origin)) Object.assign(headers, { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'content-type, x-inbox-key, x-q-claim, x-relay-key', vary: 'origin' });
	res.writeHead(status, headers);
	res.end(status === 204 ? undefined : JSON.stringify(body));
}

const ROUTE = /^\/fed\/(did:key:z[1-9A-HJ-NP-Za-km-z]+)\/announcements\.json$/;
const DROP = /^\/drop(?:\/([A-Za-z0-9_-]{16,64}))?$/;
const INBOX = /^\/inbox\/([A-Za-z0-9_-]{22})(?:\/([A-Za-z0-9_-]{16,64}))?$/;
const LEDGER = /^\/mint\/(did:key:z[1-9A-HJ-NP-Za-km-z]+)\/(test|live)$/;
const SHOP = /^\/shop\/(did:key:z[1-9A-HJ-NP-Za-km-z]+)$/;

async function inboxes(req, res, origin, id, item) {
	if (req.method === 'POST' && !item) {
		if (tooMany(`post:${req.socket.remoteAddress ?? ''}`, Date.now(), POSTS_PER_HOUR)) return send(res, origin, 429, { says: 'Too many at once. Try again in a while.' });
		const raw = await readBody(req, POST_BYTES);
		if (raw === null) return send(res, origin, 413, { says: 'Too big.' });
		let body;
		try { body = JSON.parse(raw); } catch { return send(res, origin, 400, { says: 'That isn’t JSON.' }); }
		const wrong = await checkPost(body, id);
		if (wrong) return send(res, origin, 403, { says: wrong });
		if ((await inboxHeld(id)) + raw.length > TERMS.inboxHoldsBytes)
			return send(res, origin, 507, { says: 'Their inbox is full just now. It empties as they collect what’s waiting, so try again later.', full: 'inbox' });
		if (!fitsToday(body.did, raw.length))
			return send(res, origin, 429, { says: 'You’ve sent today’s free amount through storage. It starts again tomorrow.', full: 'day' });
		const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.signature)));
		const postId = Buffer.from(digest.slice(0, 16)).toString('base64url');
		const form = new FormData();
		form.append('file', new Blob([JSON.stringify(body)], { type: 'application/json' }), `${postId}.json`);
		const r = await fetch(`${inboxDir(id)}${postId}.json`, { method: 'POST', body: form }).catch((e) => ({ ok: false, status: e.message }));
		if (!r.ok) return send(res, origin, 502, { says: `Couldn’t keep it: ${r.status}` });
		pingInbox(id);
		return send(res, origin, 200, { ok: true, id: postId });
	}
	/* Everything else is the owner's: list, collect, let go. */
	if (!(await ownsInbox(id, req.headers['x-inbox-key']))) return send(res, origin, 403, { says: 'That isn’t your inbox.' });
	if (req.method === 'GET' && !item) return send(res, origin, 200, { ids: await inboxList(id) });
	if (req.method === 'GET') {
		const r = await fetch(`${inboxDir(id)}${item}.json`).catch(() => null);
		const held = r?.ok ? await r.json().catch(() => null) : null;
		return held ? send(res, origin, 200, held) : send(res, origin, 404, { says: 'Not here.' });
	}
	if (req.method === 'DELETE' && item) {
		await fetch(`${inboxDir(id)}${item}.json`, { method: 'DELETE' }).catch(() => null);
		return send(res, origin, 200, { ok: true });
	}
	return send(res, origin, 405, { says: 'Not like that.' });
}

async function readBody(req, most) {
	let raw = '';
	for await (const chunk of req) {
		raw += chunk;
		if (raw.length > most) return null;
	}
	return raw;
}

/*
 * Opening a drop is for one person (2 October 2026). Darren opened a shared
 * card as two different people, and signed out: a link alone must not be
 * enough. So opening needs a fresh signed claim, and the FIRST person to open
 * it keeps it: after that only they (and whoever made it) can fetch it. A
 * forwarded or leaked link opens nothing for anyone else.
 */
const CLAIM_FRESH_MS = 5 * 60 * 1000;
export async function checkClaim(claim, id, now = Date.now()) {
	if (!(await signedReceipt(claim))) return null;
	const c = claim.content;
	if (c.schema !== 'inqbeta.drop-claim/1' || c.drop !== id) return null;
	const at = Date.parse(c.at);
	if (!Number.isFinite(at) || Math.abs(now - at) > CLAIM_FRESH_MS) return null;
	return claim.did;
}
/** Who may have it: the one who made it, or the one who claimed it first (claiming it now if nobody has). */
export function mayOpen(held, did) {
	if (!did) return { ok: false, says: 'Sign in to open this.' };
	if (did === held.did) return { ok: true };
	if (!held.claimedBy) return { ok: true, claim: true };
	return held.claimedBy === did ? { ok: true } : { ok: false, says: 'This was meant for someone else, and they’ve already opened it. Ask them to send you your own.' };
}

async function drops(req, res, origin, id) {
	if (req.method === 'GET') {
		if (!id) return send(res, origin, 404, { says: 'Nothing here.' });
		const r = await fetch(dropPath(id)).catch(() => null);
		const held = r?.ok ? await r.json().catch(() => null) : null;
		if (!held || Date.parse(held.content?.until) < Date.now()) return send(res, origin, 404, { says: 'This has gone: it was only kept for a while.' });
		let claim = null;
		try { claim = JSON.parse(Buffer.from(String(req.headers['x-q-claim'] ?? ''), 'base64url').toString('utf8')); } catch { claim = null; }
		const did = claim ? await checkClaim(claim, id) : null;
		const may = mayOpen(held, did);
		if (!may.ok) return send(res, origin, did ? 403 : 401, { says: may.says });
		if (may.claim) {
			try {
				await storeDrop(id, { ...held, claimedBy: did, claimedAt: new Date().toISOString() });
			} catch {
				return send(res, origin, 502, { says: 'Couldn’t open it just now. Try again.' });
			}
		}
		const { claimedBy, claimedAt, ...drop } = held;
		return send(res, origin, 200, { ...drop, opened: may.claim ? 'now' : did === held.did ? 'yours' : 'before' });
	}
	if (req.method !== 'POST' || id) return send(res, origin, 405, { says: 'Only GET and POST.' });
	if (tooMany(req.socket.remoteAddress ?? '')) return send(res, origin, 429, { says: 'Too many at once. Try again in a while.' });
	const raw = await readBody(req, DROP_BYTES);
	if (raw === null) return send(res, origin, 413, { says: 'Too big.' });
	let body;
	try { body = JSON.parse(raw); } catch { return send(res, origin, 400, { says: 'That isn’t JSON.' }); }
	const wrong = await checkDrop(body);
	if (wrong) return send(res, origin, 403, { says: wrong });
	/* Named by what it holds, so the same drop twice is one file. */
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.content.box.ct)));
	const newId = Buffer.from(digest.slice(0, 16)).toString('base64url');
	try {
		await storeDrop(newId, body);
	} catch (e) {
		return send(res, origin, 502, { says: `Couldn’t keep it: ${e.message}` });
	}
	return send(res, origin, 200, { ok: true, id: newId });
}

/*
 * GET /health — is each of the node's jobs up? (2 October 2026)
 *
 * The bellboy's private listener, the directory and the storage stay on the
 * mesh, so a page on the live site can't check them itself. The gate is the
 * node's public front door and sits beside them, so it asks for them: up or
 * not, and Dgraph's version. Never anything they hold. Cached for 15 seconds
 * so it can't be used to hammer the services behind it.
 */
const SOON_MS = 3000;
let healthCache = null;
function tcpUp(host, port) {
	return new Promise((done) => {
		const sock = net.connect({ host, port });
		const t = setTimeout(() => (sock.destroy(), done(false)), SOON_MS);
		sock.once('connect', () => (clearTimeout(t), sock.end(), done(true)));
		sock.once('error', () => (clearTimeout(t), done(false)));
	});
}
async function httpUp(url) {
	try {
		const r = await fetch(url, { signal: AbortSignal.timeout(SOON_MS) });
		return { up: true, status: r.status, body: await r.text().catch(() => '') };
	} catch {
		return { up: false };
	}
}
async function health() {
	if (healthCache && Date.now() - healthCache.at < 15_000) return healthCache.body;
	const [bellboy, directory, storage] = await Promise.all([tcpUp(MQTT.host, 1883), httpUp(`${DIRECTORY}/health`), httpUp(`${FILER}/`)]);
	let version;
	try {
		version = JSON.parse(directory.body ?? '')[0]?.version;
	} catch {
		/* no version, still up */
	}
	const body = {
		at: new Date().toISOString(),
		bellboy: { up: bellboy },
		directory: { up: !!directory.up, ...(version ? { version } : {}) },
		storage: { up: !!storage.up }
	};
	healthCache = { at: Date.now(), body };
	return body;
}

export const server = http.createServer(async (req, res) => {
	const origin = req.headers.origin ?? '';
	if (req.method === 'GET' && new URL(req.url, 'http://gate').pathname === '/health') return send(res, origin, 200, await health());
	/* The free allowance, published: Q shows it beside your usage. */
	if (req.method === 'GET' && new URL(req.url, 'http://gate').pathname === '/terms') return send(res, origin, 200, TERMS);
	const m = ROUTE.exec(decodeURIComponent(new URL(req.url, 'http://gate').pathname));
	if (req.method === 'OPTIONS') return send(res, origin, 204);
	const d = DROP.exec(new URL(req.url, 'http://gate').pathname);
	if (d) return drops(req, res, origin, d[1]);
	const ib = INBOX.exec(new URL(req.url, 'http://gate').pathname);
	if (ib) return inboxes(req, res, origin, ib[1], ib[2]);
	const lg = LEDGER.exec(decodeURIComponent(new URL(req.url, 'http://gate').pathname));
	if (lg) return ledgers(req, res, origin, lg[1], lg[2]);
	const sh = SHOP.exec(decodeURIComponent(new URL(req.url, 'http://gate').pathname));
	if (sh) return shops(req, res, origin, sh[1]);
	const rl = RELAY.exec(new URL(req.url, 'http://gate').pathname);
	if (rl) return relays(req, res, origin, rl[1], rl[2]);
	const st = STORE.exec(new URL(req.url, 'http://gate').pathname);
	if (st) return stores(req, res, origin, st[1], st[2]);
	if (!m) return send(res, origin, 404, { says: 'Nothing here.' });
	const did = m[1];
	if (!FEDERATIONS.has(did)) return send(res, origin, 404, { says: 'This node doesn’t serve that federation.' });

	if (req.method === 'GET') {
		const h = await held(did);
		/* Nothing held yet: say so, and Q falls back to the site's own file. */
		return h?.file ? send(res, origin, 200, h.file) : send(res, origin, 404, { says: 'Nothing published here yet.' });
	}
	if (req.method !== 'POST') return send(res, origin, 405, { says: 'Only GET and POST.' });

	let raw = '';
	for await (const chunk of req) {
		raw += chunk;
		if (raw.length > MOST_BYTES) return send(res, origin, 413, { says: 'Too big.' });
	}
	let body;
	try { body = JSON.parse(raw); } catch { return send(res, origin, 400, { says: 'That isn’t JSON.' }); }
	const wrong = await checkSubmission(did, body, await held(did));
	if (wrong) return send(res, origin, 403, { says: wrong });
	try {
		await store(did, { file: body.file, publication: body.publication });
	} catch (e) {
		return send(res, origin, 502, { says: `Couldn’t store it: ${e.message}` });
	}
	ping(did, body.publication.at);
	return send(res, origin, 200, { ok: true, says: 'Stored. Members have been rung.' });
});

if (process.argv[1]?.endsWith('server.mjs')) {
	server.listen(PORT, () => console.log(`gate on :${PORT}, serving ${FEDERATIONS.size} federation(s)`));
	/* Kept storage past its grace is cleared, checked every hour. */
	if (OPERATORS.size) setInterval(() => void sweepStores().then((n) => n && console.log(`cleared ${n} kept space(s) past their grace`)).catch(() => null), 3600_000).unref?.();
}
