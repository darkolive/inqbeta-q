/* Refresh token → a fresh access token. Nothing is kept. See $lib/server/google.ts. */
import { json, type RequestHandler } from '@sveltejs/kit';
import { configured, tokenRequest } from '$lib/server/google';

export const prerender = false;

export const POST: RequestHandler = async ({ request }) => {
	if (!configured()) return json({ ok: false, says: 'Google Drive is not set up on this server.' }, { status: 501 });
	const { refreshToken } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	if (typeof refreshToken !== 'string' || refreshToken.length < 10) return json({ ok: false, says: 'No refresh token.' }, { status: 400 });
	const out = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
	return json(out, { status: out.ok ? 200 : 401 });
};
