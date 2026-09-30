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
	server: { port: 3100, strictPort: true },
	preview: { port: 4100, strictPort: true }
});
