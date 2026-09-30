/*
 * Ask for a channel: "I can be reached here."
 *
 * The passkey comes first, so there is always a DID by the time anyone gets
 * here — and the request is SIGNED by it. A DID is public; without the
 * signature this endpoint would send a message to any address anybody typed,
 * which is a spam relay.
 *
 * What goes out is a location and nothing else. The receipt at that location is
 * sealed to the DID that asked, so the mail provider, the inbox and anyone
 * who intercepts the link all get ciphertext. See lib/server/claims.ts.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sha256 } from '@inqbeta/q-core/canonical';
import { normaliseAddress, type ChannelKind } from '@inqbeta/q-core/channels';
import { CLAIM_LIFE_MS, newWitness, sealClaim, tooManyClaims } from '$lib/server/claims';
import { receiptWaiting } from '$lib/server/emails';
import { signedBy } from '$lib/server/signed';

export const prerender = false;

/* Must be a domain verified with Resend, or delivery is refused outright. */
/* Who mail comes from. Must be on a domain verified with Resend. Dark Olive's by default; set Q_MAIL_FROM to send as your own. */
const FROM = () => env.Q_MAIL_FROM || 'Q <q@darkolive.co.uk>';

/* Deliberately loose. Rejecting odd-but-valid addresses locks real people out. */
const looksLikeEmail = (v: string) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v);

export const POST: RequestHandler = async ({ request, url }) => {
	let body: { did?: string; kind?: ChannelKind; address?: string; at?: string; signature?: string };
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'Nothing to claim.' }, { status: 400 });
	}

	const did = body.did ?? '';
	const kind: ChannelKind = body.kind === 'sms' ? 'sms' : 'email';
	const address = normaliseAddress(kind, body.address ?? '');
	const at = body.at ?? '';

	if (!did.startsWith('did:key:') || !address || !at || !body.signature) {
		return json({ ok: false, error: 'That claim is not complete.' }, { status: 400 });
	}

	/* Signed by the passkey behind the DID, or it does not happen. */
	if (!(await signedBy(did, { act: 'channel.claim', did, kind, address, at }, body.signature))) {
		return json({ ok: false, error: 'That claim was not signed by that identity.' }, { status: 403 });
	}

	/* An old signature should not be replayable for ever. */
	const asked = Date.parse(at);
	if (!Number.isFinite(asked) || Math.abs(Date.now() - asked) > 5 * 60 * 1000) {
		return json({ ok: false, error: 'That claim is too old. Try again.' }, { status: 400 });
	}

	if (kind === 'sms') {
		return json({ ok: false, error: 'Q cannot send to a phone yet — use an email address.' }, { status: 501 });
	}
	if (!looksLikeEmail(address)) {
		return json({ ok: false, error: 'That does not look like an email address.' }, { status: 400 });
	}

	/* Keyed by hashes, so the limiter holds neither an address nor an identity. */
	if (tooManyClaims(await sha256(did + '|' + address))) {
		return json({ ok: false, error: 'That is a lot of claims. Try again in an hour.' }, { status: 429 });
	}

	const key = env.RESEND_API_KEY;
	if (!key) {
		console.error('[channels/claim] RESEND_API_KEY is not set — nothing was sent.');
		return json({ ok: false, error: 'Channels are not set up on this server.' }, { status: 503 });
	}

	let token: string;
	try {
		token = await sealClaim({ did, kind, address, witness: newWitness(), exp: Date.now() + CLAIM_LIFE_MS });
	} catch {
		console.error('[channels/claim] Q_OTP_SECRET is not set — nothing was sent.');
		return json({ ok: false, error: 'Channels are not set up on this server.' }, { status: 503 });
	}

	const where = `${url.origin}/c/${encodeURIComponent(token)}`;
	const mail = receiptWaiting(where, Math.round(CLAIM_LIFE_MS / 60000));

	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			from: FROM(),
			to: [address],
			subject: mail.subject,
			html: mail.html,
			text: mail.text,
			headers: { 'Auto-Submitted': 'auto-generated' }
		})
	});

	if (!res.ok) {
		/* Status only — never the address, never the body. */
		console.error(`[channels/claim] Resend returned ${res.status}`);
		return json({ ok: false, error: 'The receipt could not be sent. Try again in a moment.' }, { status: 502 });
	}

	return json({ ok: true, expiresIn: CLAIM_LIFE_MS });
};
