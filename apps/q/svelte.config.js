import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ runtime: 'nodejs22.x' }),
		/* Look for a new deploy every minute, so Q can say "Q has been updated" (1 October 2026). */
		version: { pollInterval: 60_000 },
		/* The development copy (pnpm dev:site, ADR-Q-034 §5) keeps its own settings
		 * in devsite/.env, so it never reads or changes inqbeta.com's .env. */
		env: { dir: process.env.PUBLIC_Q_SITE === 'development' ? 'devsite' : '.' },
		prerender: { handleHttpError: 'fail', entries: ['*', '/data', '/receipts', '/keys', '/devices', '/nodes', '/cards', '/my-pages', '/federations', '/f/dostudy'] }
	}
};
