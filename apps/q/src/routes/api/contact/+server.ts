/*
 * "Contact us" — a message to Dark Olive's admin inbox.
 *
 * Like Stay in touch (api/interest): sent once, to one fixed inbox
 * (Q_CONTACT_TO, else Q_INTEREST_TO), and kept nowhere on this server. The
 * sender's address goes in Reply-To, so answering is just replying. Because
 * the recipient is fixed, this cannot send mail to anyone else.
 *
 * Guarded the same honest way: a hidden field bots fill in, length limits, and
 * a per-instance rate limit (a speed bump on serverless, not a wall).
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sha256 } from '@inqbeta/q-core/canonical';

export const prerender = false;

const FROM = () => env.Q_MAIL_FROM || 'Q <q@darkolive.co.uk>';
const looksLikeEmail = (v: string) => v.length <= 254 && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v);

const recent = new Map<string, number[]>();
function tooMany(key: string): boolean {
	const now = Date.now();
	const hits = (recent.get(key) ?? []).filter((t) => now - t < 60 * 60 * 1000);
	hits.push(now);
	recent.set(key, hits);
	return hits.length > 5;
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	let body: { name?: string; email?: string; message?: string; website?: string; lang?: string };
	try {
		body = await request.json();
	} catch {
		return json({ ok: false }, { status: 400 });
	}
	if (body.website) return json({ ok: true });

	const email = (body.email ?? '').trim();
	const name = (body.name ?? '').trim().slice(0, 120);
	const message = (body.message ?? '').trim();
	if (!looksLikeEmail(email) || message.length < 2 || message.length > 5000) return json({ ok: false, error: 'input' }, { status: 400 });

	let who = 'unknown';
	try {
		who = getClientAddress();
	} catch {
		/* not every adapter */
	}
	if (tooMany(await sha256(who)) || tooMany(await sha256(email.toLowerCase()))) return json({ ok: false }, { status: 429 });

	const key = env.RESEND_API_KEY;
	const to = env.Q_CONTACT_TO || env.Q_INTEREST_TO;
	if (!key || !to) {
		console.error('[contact] RESEND_API_KEY or Q_CONTACT_TO / Q_INTEREST_TO is not set — nothing was sent.');
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
			subject: `Q — a message from ${name || email}`,
			text: `${name ? `${name} <${email}>` : email} wrote, from Q's contact page (language: ${lang}):\n\n${message}\n\n— Reply to this email to answer. Q has not kept the message anywhere.`,
			headers: { 'Auto-Submitted': 'auto-generated' }
		})
	});
	if (!res.ok) {
		console.error(`[contact] Resend returned ${res.status}`);
		return json({ ok: false }, { status: 502 });
	}
	return json({ ok: true });
};
