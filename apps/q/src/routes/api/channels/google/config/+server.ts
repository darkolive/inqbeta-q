/*
 * Google Drive as a storage channel — the public half of the OAuth client.
 * The client id is not a secret; the browser needs it to start sign-in.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const prerender = false;

export const GET: RequestHandler = async () =>
	json(env.GOOGLE_CLIENT_ID ? { ok: true, clientId: env.GOOGLE_CLIENT_ID } : { ok: false, says: 'Google Drive is not set up on this server.' });
