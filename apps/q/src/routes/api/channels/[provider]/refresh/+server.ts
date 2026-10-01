/* Refresh token → a fresh access token. Nothing is kept. See $lib/server/clouds.ts. */
import { json, type RequestHandler } from '@sveltejs/kit';
import { configured, providerOf, tokenRequest } from '$lib/server/clouds';

export const prerender = false;

export const POST: RequestHandler = async ({ request, params }) => {
	const p = providerOf(params.provider);
	if (!p || !configured(p)) return json({ ok: false, says: `${p?.name ?? 'That storage'} is not set up on this server.` }, { status: 501 });
	const { refreshToken } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	if (typeof refreshToken !== 'string' || refreshToken.length < 10) return json({ ok: false, says: 'No refresh token.' }, { status: 400 });
	const out = await tokenRequest(p, { grant_type: 'refresh_token', refresh_token: refreshToken });
	return json(out, { status: out.ok ? 200 : 401 });
};
