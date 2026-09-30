import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ runtime: 'nodejs22.x' }),
		prerender: { handleHttpError: 'fail', entries: ['*', '/data', '/receipts', '/keys', '/devices', '/nodes', '/cards', '/my-pages', '/federations', '/f/dostudy'] }
	}
};
