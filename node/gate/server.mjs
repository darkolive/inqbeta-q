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
	postDays: 30
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
	return 'That isn’t a mint receipt or an agreement.';
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

/* ---- HTTP ---- */
function send(res, origin, status, body) {
	const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
	if (ORIGINS.has(origin)) Object.assign(headers, { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'content-type, x-inbox-key, x-q-claim', vary: 'origin' });
	res.writeHead(status, headers);
	res.end(status === 204 ? undefined : JSON.stringify(body));
}

const ROUTE = /^\/fed\/(did:key:z[1-9A-HJ-NP-Za-km-z]+)\/announcements\.json$/;
const DROP = /^\/drop(?:\/([A-Za-z0-9_-]{16,64}))?$/;
const INBOX = /^\/inbox\/([A-Za-z0-9_-]{22})(?:\/([A-Za-z0-9_-]{16,64}))?$/;
const LEDGER = /^\/mint\/(did:key:z[1-9A-HJ-NP-Za-km-z]+)\/(test|live)$/;

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

if (process.argv[1]?.endsWith('server.mjs')) server.listen(PORT, () => console.log(`gate on :${PORT}, serving ${FEDERATIONS.size} federation(s)`));
