import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/* Fixed ports — see the port map in the repo README. Sites expect Q on 3100. */
export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	/* Cedar's wasm-bindgen glue finds its .wasm with new URL(…, import.meta.url);
	 * pre-bundling would break that. The engine runs in a module worker. */
	optimizeDeps: { exclude: ['@cedar-policy/cedar-wasm'] },
	worker: { format: 'es' },
	/* On the server (the mint's decisions, ADR-Q-027) Cedar's Node build is
	 * CommonJS that reads its .wasm beside itself with __dirname: bundled into
	 * the ESM server output, __dirname doesn't exist and the build fails
	 * (3 October 2026). Left outside the bundle, it's loaded from node_modules
	 * as it is, and the deploy traces the .wasm with it. */
	ssr: { external: ['@cedar-policy/cedar-wasm'] },
	server: { port: 3100, strictPort: true },
	preview: { port: 4100, strictPort: true }
});
