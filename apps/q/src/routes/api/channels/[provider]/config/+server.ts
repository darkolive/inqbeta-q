/* Dropbox or OneDrive: the public half of the app — what the browser needs to start signing in. */
import { json, type RequestHandler } from '@sveltejs/kit';
import { providerOf } from '$lib/server/clouds';

export const prerender = false;

export const GET: RequestHandler = async ({ params }) => {
	const p = providerOf(params.provider);
	if (!p) return json({ ok: false, says: 'Not a storage Q knows.' }, { status: 404 });
	const clientId = p.id();
	return json(clientId ? { ok: true, clientId, authorize: p.authorize, scope: p.scope, extra: p.extra } : { ok: false, says: `${p.name} is not set up on this server yet.` });
};
