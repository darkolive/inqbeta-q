import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/*
 * Q's core, as served (ADR-Q-019 §3a; 6 October 2026). The core files
 * (packages/q-core/core-files.json) go into one self-contained chunk,
 * q-kernel, whose fingerprint depends on nothing else: pages, plugins and
 * look can change freely without moving it, and changing the core changes it.
 * The build writes /_q/core.json after the files land, naming that chunk; Incubator fetches the
 * chunk itself and fingerprints what the site actually serves.
 */
const CORE = (JSON.parse(readFileSync('../../packages/q-core/core-files.json', 'utf8')) as { files: string[] }).files;
const isCore = (id: string) => {
	const m = /packages\/q-core\/src\/(.+)\.ts$/.exec(id.replace(/\\/g, '/'));
	return !!m && CORE.some((c) => (c.endsWith('/*') ? m[1].startsWith(c.slice(0, -1)) : m[1] === c));
};
const commit = () => {
	if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
	try {
		const head = readFileSync('../../.git/HEAD', 'utf8').trim();
		return head.startsWith('ref: ') ? readFileSync(`../../.git/${head.slice(5)}`, 'utf8').trim() : head;
	} catch {
		return '';
	}
};
function coreJson(): Plugin {
	return {
		name: 'q-core-json',
		apply: 'build',
		// After writing, so the fingerprint is of the very bytes the site serves.
		writeBundle(out, bundle) {
			const kernel = Object.values(bundle).find((c) => c.type === 'chunk' && c.name === 'q-kernel');
			if (!out.dir || !kernel || !kernel.fileName.startsWith('_app/')) return;
			const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
			const sha256 = createHash('sha256').update(readFileSync(`${out.dir}/${kernel.fileName}`)).digest('hex');
			mkdirSync(`${out.dir}/_q`, { recursive: true });
			writeFileSync(`${out.dir}/_q/core.json`, JSON.stringify({ schema: 'inqbeta.core-served/1', release: pkg.version, commit: commit(), kernel: `/${kernel.fileName}`, sha256 }, null, '\t'));
		}
	};
}

/* Fixed ports — see the port map in the repo README. Sites expect Q on 3100. */
export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), coreJson()],
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
	build: { rollupOptions: { output: { manualChunks: (id) => (isCore(id) ? 'q-kernel' : undefined) } } },
	server: { port: 3100, strictPort: true },
	preview: { port: 4100, strictPort: true }
});
