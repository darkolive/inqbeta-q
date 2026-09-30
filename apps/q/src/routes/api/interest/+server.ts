/*
 * "Stay in touch" — the beta sign-up on the home page.
 *
 * Someone who has not signed in leaves an email address; it is sent, once,
 * to one fixed inbox (Q_INTEREST_TO — Dark Olive's admin inbox) and kept nowhere
 * on this server. Because the only recipient is that fixed inbox, this cannot
 * be used to send mail to strangers — it is not a relay.
 *
 * Guarded lightly and honestly: a hidden field bots fill in and people never
 * see, a length limit, and a per-instance limit (which on serverless is a
 * speed bump, not a wall — the same caveat as the channel claims).
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sha256 } from '@inqbeta/q-core/canonical';

export const prerender = false;

/* Who mail comes from. Must be on a domain verified with Resend. Dark Olive's by default; set Q_MAIL_FROM to send as your own. */
const FROM = () => env.Q_MAIL_FROM || 'Q <q@darkolive.co.uk>';
const looksLikeEmail = (v: string) => v.length <= 254 && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v);

/* Hashed, so the limiter holds no address. */
const recent = new Map<string, number[]>();
function tooMany(key: string): boolean {
	const now = Date.now();
	const hits = (recent.get(key) ?? []).filter((t) => now - t < 60 * 60 * 1000);
	hits.push(now);
	recent.set(key, hits);
	return hits.length > 3;
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	let body: { email?: string; website?: string; lang?: string };
	try {
		body = await request.json();
	} catch {
		return json({ ok: false }, { status: 400 });
	}
	/* The hidden field: a person never fills it. Say yes, send nothing. */
	if (body.website) return json({ ok: true });

	const email = (body.email ?? '').trim().toLowerCase();
	if (!looksLikeEmail(email)) return json({ ok: false, error: 'email' }, { status: 400 });

	let who = 'unknown';
	try {
		who = getClientAddress();
	} catch {
		/* not available in every adapter */
	}
	if (tooMany(await sha256(who)) || tooMany(await sha256(email))) return json({ ok: false }, { status: 429 });

	const key = env.RESEND_API_KEY;
	const to = env.Q_INTEREST_TO;
	if (!key || !to) {
		console.error('[interest] RESEND_API_KEY or Q_INTEREST_TO is not set — nothing was sent.');
		return json({ ok: false }, { status: 503 });
	}

	const lang = (body.lang ?? 'en').slice(0, 5);
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			from: FROM(),
			to: [to],
			reply_to: email,
			subject: 'Q beta — someone would like to stay in touch',
			text: `${email} asked to hear about Q, from the home page (language: ${lang}).\n\nReply to this email to write to them. Q has not kept the address anywhere.`,
			headers: { 'Auto-Submitted': 'auto-generated' }
		})
	});
	if (!res.ok) {
		console.error(`[interest] Resend returned ${res.status}`);
		return json({ ok: false }, { status: 502 });
	}
	return json({ ok: true });
};
