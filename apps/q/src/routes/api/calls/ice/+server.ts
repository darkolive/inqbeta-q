/*
 * The ways through for a direct call (ADR-Q-004 §3).
 *
 * Most calls connect straight from one device to the other and never touch
 * this. Some networks — mobile carriers, offices, hotel wifi — will not let
 * two devices reach each other, and then the media has to bounce off a TURN
 * relay. The relay carries encrypted packets it cannot open (DTLS-SRTP, keyed
 * to the fingerprints the two people signed), so using one changes where the
 * bytes go, never who can read them.
 *
 * Credentials are minted per call and short-lived, so none sits in the page.
 * The request is signed by a DID, as every request that spends something is.
 *
 * Which relay, in order (ADR-Q-017 §2: mine → my federation's → the commons):
 *   1. the host's own relay on its node (Q_TURN_URLS + Q_TURN_SECRET, coturn),
 *   2. Cloudflare's (CF_TURN_KEY_ID + CF_TURN_KEY_TOKEN),
 *   3. none: STUN only, and it says so. Calls still work on most networks.
 * When both are set, both are offered, the host's own first.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { signedBy } from '$lib/server/signed';
import { relayCredentials, relayUrls } from '$lib/server/turn';

export const prerender = false;

const STUN_ONLY = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

/* Port 53 is blocked by browsers and only makes gathering wait for a timeout. */
const usable = (u: string) => !/:53(\?|$)/.test(u);

export const POST: RequestHandler = async ({ request }) => {
	let body: { did?: string; at?: string; signature?: string };
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'Nothing asked.' }, { status: 400 });
	}
	const did = body.did ?? '';
	const at = body.at ?? '';
	if (!did.startsWith('did:key:') || !at || !body.signature) return json({ ok: false, error: 'That request is not complete.' }, { status: 400 });
	if (!(await signedBy(did, { act: 'call.ice', did, at }, body.signature))) return json({ ok: false, error: 'Not signed by that identity.' }, { status: 403 });
	const asked = Date.parse(at);
	if (!Number.isFinite(asked) || Math.abs(Date.now() - asked) > 5 * 60 * 1000) return json({ ok: false, error: 'That request is too old.' }, { status: 400 });

	/* 1. The host's own relay, on its node. */
	type Ice = { urls: string[]; username?: string; credential?: string };
	const own: Ice[] = [];
	const ownUrls = relayUrls(env.Q_TURN_URLS).filter(usable);
	if (ownUrls.length && env.Q_TURN_SECRET) {
		const c = await relayCredentials(env.Q_TURN_SECRET, did);
		own.push({ urls: ownUrls, username: c.username, credential: c.credential });
	}

	const id = env.CF_TURN_KEY_ID;
	const token = env.CF_TURN_KEY_TOKEN;
	if (!id || !token) {
		return own.length
			? json({ ok: true, iceServers: [...own, ...STUN_ONLY], relay: true, via: 'own' })
			: json({ ok: true, iceServers: STUN_ONLY, relay: false });
	}

	try {
		const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ ttl: 4 * 60 * 60 })
		});
		if (!res.ok) throw new Error(String(res.status));
		const out = (await res.json()) as { iceServers: { urls: string | string[]; username?: string; credential?: string }[] | { urls: string | string[]; username?: string; credential?: string } };
		const list = Array.isArray(out.iceServers) ? out.iceServers : [out.iceServers];
		const iceServers = list
			.map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(usable) }))
			.filter((s) => s.urls.length);
		return json({ ok: true, iceServers: [...own, ...iceServers], relay: true, via: own.length ? 'own+cloudflare' : 'cloudflare' });
	} catch {
		if (own.length) return json({ ok: true, iceServers: [...own, ...STUN_ONLY], relay: true, via: 'own' });
		return json({ ok: true, iceServers: STUN_ONLY, relay: false, says: 'The relay could not be reached; calling without one.' });
	}
};
