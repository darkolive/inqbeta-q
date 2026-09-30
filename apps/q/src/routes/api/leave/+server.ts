/*
 * Leave no trace, server half: tell the browser to clear this origin.
 *
 * `Clear-Site-Data` reaches what a page cannot — HTTP-only cookies and the
 * HTTP cache — in browsers that honour it. It holds nothing and logs nothing;
 * the page has already cleared everything it can see (q-core/leave.ts).
 */
import type { RequestHandler } from './$types';

export const POST: RequestHandler = () =>
	new Response(null, {
		status: 204,
		headers: { 'Clear-Site-Data': '"cache", "cookies", "storage"', 'Cache-Control': 'no-store' }
	});
