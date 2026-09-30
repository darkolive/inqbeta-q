/* Sign-in code → tokens, with PKCE. See $lib/server/google.ts for what this server does and does not do. */
import { json, type RequestHandler } from '@sveltejs/kit';
import { configured, redirectIsOurs, tokenRequest } from '$lib/server/google';

export const prerender = false;

export const POST: RequestHandler = async ({ request, url }) => {
	if (!configured()) return json({ ok: false, says: 'Google Drive is not set up on this server.' }, { status: 501 });
	const { code, verifier, redirectUri } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	if (typeof code !== 'string' || typeof verifier !== 'string' || !redirectIsOurs(redirectUri, url.origin))
		return json({ ok: false, says: 'That sign-in did not come back the way it went out.' }, { status: 400 });
	const out = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri });
	return json(out, { status: out.ok ? 200 : 400 });
};
