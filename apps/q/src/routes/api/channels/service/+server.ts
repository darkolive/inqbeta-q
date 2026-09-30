/*
 * Who to seal a channel to.
 *
 * A browser needs Q's sending DID before it can make a channel receipt this
 * server will ever be able to open. It is a public key — half of a pair, and
 * the half that is meant to be handed out — so there is nothing here to guard.
 *
 * A server with no sending key says so plainly rather than 500ing, because the
 * browser has a sensible thing to do about it: seal the channel to the person
 * alone. That channel works, and simply cannot be sent to while they are
 * signed out.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { serviceDid } from '$lib/server/service-key';

export const prerender = false;

export const GET: RequestHandler = async () => {
	try {
		return json({ ok: true, did: await serviceDid() });
	} catch {
		return json({ ok: false, did: null, says: 'This server has no sending key.' });
	}
};
