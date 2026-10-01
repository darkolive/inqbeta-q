import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ runtime: 'nodejs22.x' }),
		/* Look for a new deploy every minute, so Q can say "Q has been updated" (1 October 2026). */
		version: { pollInterval: 60_000 },
		prerender: { handleHttpError: 'fail', entries: ['*', '/data', '/receipts', '/keys', '/devices', '/nodes', '/cards', '/my-pages', '/federations', '/f/dostudy'] }
	}
};
