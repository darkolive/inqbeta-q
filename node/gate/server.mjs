/*
 * The gate in front of the storage unit (ADR-Q-016 §6, step 5).
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

const PORT = 8090;
const FILER = process.env.GATE_FILER ?? 'http://storage:8888';
const FEDERATIONS = new Set((process.env.GATE_FEDERATIONS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const ORIGINS = new Set((process.env.GATE_ORIGINS ?? 'https://inqbeta.com,https://inqbeta.dev,http://localhost:3100').split(',').map((s) => s.trim()));
const MQTT = { host: process.env.GATE_MQTT_HOST ?? 'mosquitto', user: 'gate', password: process.env.GATE_MQTT_PASSWORD ?? '' };
const MOST_BYTES = 64 * 1024;
const FRESH_MS = 10 * 60 * 1000;

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

/* ---- HTTP ---- */
function send(res, origin, status, body) {
	const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
	if (ORIGINS.has(origin)) Object.assign(headers, { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' });
	res.writeHead(status, headers);
	res.end(status === 204 ? undefined : JSON.stringify(body));
}

const ROUTE = /^\/fed\/(did:key:z[1-9A-HJ-NP-Za-km-z]+)\/announcements\.json$/;

export const server = http.createServer(async (req, res) => {
	const origin = req.headers.origin ?? '';
	const m = ROUTE.exec(decodeURIComponent(new URL(req.url, 'http://gate').pathname));
	if (req.method === 'OPTIONS') return send(res, origin, 204);
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
