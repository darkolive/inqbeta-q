/*
 * Development only: lets the bell collect from a storage unit on the
 * federation's mesh when the browser is refused (CORS). Q's dev server runs on
 * your own computer, which is on the mesh. It passes sealed bytes through
 * unopened, and only to the holding bay of a private-network address.
 * In production this route answers 404 (ADR-Q-014).
 */
import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const HOLDING = /^http:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d{2,5}\/holding\/[0-9a-f]{64}$/;

export const POST: RequestHandler = async ({ request }) => {
	if (!dev) error(404);
	const { url, method, body } = (await request.json()) as { url?: string; method?: string; body?: string };
	if (!url || !HOLDING.test(url) || !['GET', 'DELETE', 'PUT'].includes(method ?? '')) error(400, 'Only a holding-bay address on the mesh.');
	let r: Response;
	if (method === 'PUT') {
		/* Depositing a sealed receipt: passed through unopened. */
		const form = new FormData();
		form.append('file', new Blob([Uint8Array.from(atob(body ?? ''), (c) => c.charCodeAt(0))]), url.split('/').pop()!);
		r = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(10_000) });
	} else r = await fetch(url, { method, signal: AbortSignal.timeout(10_000) });
	return new Response(method === 'GET' ? await r.arrayBuffer() : null, {
		status: r.status,
		headers: { 'content-type': 'application/octet-stream' }
	});
};
