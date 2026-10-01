/* Sign-in code → tokens, with PKCE. See $lib/server/clouds.ts for what this server does and does not do. */
import { json, type RequestHandler } from '@sveltejs/kit';
import { configured, providerOf, redirectIsOurs, tokenRequest } from '$lib/server/clouds';

export const prerender = false;

export const POST: RequestHandler = async ({ request, url, params }) => {
	const p = providerOf(params.provider);
	if (!p || !configured(p)) return json({ ok: false, says: `${p?.name ?? 'That storage'} is not set up on this server.` }, { status: 501 });
	const { code, verifier, redirectUri } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	if (typeof code !== 'string' || typeof verifier !== 'string' || !redirectIsOurs(redirectUri, url.origin, p.cid))
		return json({ ok: false, says: 'That sign-in did not come back the way it went out.' }, { status: 400 });
	const out = await tokenRequest(p, { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri });
	return json(out, { status: out.ok ? 200 : 400 });
};
