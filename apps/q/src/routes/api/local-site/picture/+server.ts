/*
 * A picture from a site's own files, for Write's thumbnails — so choosing a
 * picture works whether or not the site's dev server is running. Same door
 * as ../+server.ts: development only, 404 when deployed, and only files under
 * the site's /images folder, of picture types.
 */
import { error, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { localSites } from '$lib/server/local-sites';

export const prerender = false;

const TYPES: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', avif: 'image/avif' };

export const GET: RequestHandler = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const root = localSites()[url.searchParams.get('domain') ?? '']?.static;
	const want = url.searchParams.get('path') ?? '';
	const ext = want.split('.').pop()?.toLowerCase() ?? '';
	if (!root || !want.startsWith('/images/') || want.includes('..') || !TYPES[ext]) error(404, 'Not found');
	const file = path.join(root, want);
	if (!file.startsWith(path.join(root, 'images')) || !existsSync(file)) error(404, 'Not found');
	return new Response(readFileSync(file) as BodyInit, {
		headers: { 'content-type': TYPES[ext], 'cache-control': 'private, max-age=3600' }
	});
};
