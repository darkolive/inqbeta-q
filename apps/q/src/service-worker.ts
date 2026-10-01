/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/*
 * The offline copy.
 *
 * Q's offline copy — the same worker as Dark Olive's (apps/darkolive), so the
 * Q window, your identity and your folder open with the connection off after
 * one visit.
 *
 * WHAT IS KEPT. The app itself (every hashed JS/CSS file from the build), every
 * prerendered page, and the small static files a page needs to draw — fonts,
 * logo, favicon, manifest, icons. NOT the 70MB of project photographs and
 * narration audio: those are for reading the site, not for working offline,
 * and caching them would make the first visit a large download nobody asked
 * for. A photograph seen once is kept as it is seen, and only then.
 *
 * HOW IT ANSWERS.
 *   /api/*          straight to the network, never cached. The AI stages and
 *                   transcription need it, and already fall back to the free
 *                   path when it is not there.
 *   pages           network first, so a deploy shows at once; the kept copy
 *                   when offline.
 *   build files     from the cache — their names change when their content
 *                   does, so a kept copy can never be stale.
 *   anything else   network, keeping a copy for next time.
 *
 * A new deploy gets a new cache name (`version`), and the old one is removed
 * once the new worker takes over.
 */
import { build, files, prerendered, version } from '$service-worker';
import { CEDAR_VERSION } from '@inqbeta/q-actions/version';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `q-${version}`;

/*
 * THE RULE ENGINE (ADR-Q-009 §2). Cedar's WASM is 1.4 MB gzipped, so it is
 * NOT fetched at install — only the first time Q wakes the engine after a
 * sign-in. It is kept in a cache of its own, named after the Cedar version,
 * which a deploy does not remove: it changes only when Cedar is deliberately
 * upgraded (CEDAR_VERSION), and then the old one goes.
 */
const ENGINE_CACHE = `q-engine-cedar-${CEDAR_VERSION}`;
/*
 * READ ALOUD (lib/settings). The recordings are downloaded by the page into a
 * cache of its own, only when read aloud is switched on, and kept across
 * deploys — each file is named by the hash of what it says, so a kept one can
 * never be stale. The worker leaves /voice/ to the page.
 */
const VOICE_CACHE = 'q-voice';
const isEngine = (path: string) => /cedar_wasm_bg[^/]*\.wasm$/.test(path);

/*
 * Signed files the caretaker publishes (ADR-Q-016): the home federation's
 * invitation and its announcements. They change without the app changing, so
 * they are fetched fresh every time, with the kept copy only when offline —
 * never answered from the cache first, which once hid a new announcement.
 */
const PUBLISHED = new Set(['/incubator.json', '/announcements.json']);
const SMALL_STATIC = files.filter(
	(f) => !f.startsWith('/images/') && !f.startsWith('/audio/') && !f.startsWith('/voice/') && !f.endsWith('.md') && !PUBLISHED.has(f)
);
const KEEP = new Set([...build, ...SMALL_STATIC, ...prerendered].filter((f) => !isEngine(f)));

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			/* One by one, so a single missing file does not lose the whole copy. */
			.then((cache) => Promise.allSettled([...KEEP].map((url) => cache.add(url))))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== ENGINE_CACHE && k !== VOICE_CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

async function fromNetwork(request: Request, keep: boolean): Promise<Response> {
	const response = await fetch(request);
	/* 200 only: a 206 (a slice of audio or video) cannot be cached, and trying throws. */
	if (keep && response.status === 200 && response.type === 'basic') {
		const cache = await caches.open(CACHE);
		void cache.put(request, response.clone());
	}
	return response;
}

/*
 * A kept page, tolerating the trailing-slash and .html spellings a prerendered
 * page can be stored under.
 */
async function keptPage(url: URL): Promise<Response | undefined> {
	const cache = await caches.open(CACHE);
	const path = url.pathname.replace(/\/$/, '') || '/';
	for (const candidate of [path, `${path}/`, `${path}.html`, `${path}/index.html`]) {
		const hit = await cache.match(candidate, { ignoreSearch: true });
		if (hit) return hit;
	}
	return undefined;
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;
	if (url.pathname.startsWith('/api/')) return;
	/* Narration is streamed in slices and is not needed offline. */
	if (url.pathname.startsWith('/audio/')) return;
	/* Read-aloud recordings: the page keeps them in 'q-voice' itself. */
	if (url.pathname.startsWith('/voice/')) return;

	/* The engine: from its own cache, or fetched once and kept there. */
	if (isEngine(url.pathname)) {
		event.respondWith(
			caches.open(ENGINE_CACHE).then(async (cache) => {
				const hit = await cache.match(url.pathname);
				if (hit) return hit;
				const response = await fetch(request);
				if (response.status === 200) void cache.put(url.pathname, response.clone());
				return response;
			})
		);
		return;
	}

	if (PUBLISHED.has(url.pathname)) {
		event.respondWith(
			fromNetwork(new Request(request.url, { cache: 'no-store' }), true).catch(async () => (await caches.match(url.pathname)) ?? Response.error())
		);
		return;
	}

	if (build.includes(url.pathname) || SMALL_STATIC.includes(url.pathname)) {
		event.respondWith(
			caches.match(url.pathname).then((hit) => hit ?? fromNetwork(request, true))
		);
		return;
	}

	if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
		event.respondWith(
			/* Past the browser's own cache as well: a page from an older build names
			 * files the server no longer has, and Q then never starts. */
			fromNetwork(new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' }), true).catch(async () => {
				/* Any Q address not kept yet falls back to the home page. */
				const hit =
					(await keptPage(url)) ??
					(await keptPage(new URL('/', url)));
				return (
					hit ??
					new Response('Offline, and this page has not been kept yet.', {
						status: 503,
						headers: { 'content-type': 'text/plain; charset=utf-8' }
					})
				);
			})
		);
		return;
	}

	/* SvelteKit's own data requests and anything else: network, then any copy. */
	event.respondWith(
		fromNetwork(request, true).catch(async () => {
			const hit = await caches.match(request, { ignoreSearch: false });
			return hit ?? Response.error();
		})
	);
});
