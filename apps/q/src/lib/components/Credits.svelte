<script lang="ts">
	/*
	 * Built with love, and who to thank (29 September).
	 *
	 * "Free to give — never free to take." Then, in bold, the open-source line
 * with GitHub's mark, linking to the code for anyone to inspect. Then the
	 * projects it stands on: the main front end first, then the tools, then a
	 * row for the three AI engineering teams, then a credit roll for the wider
	 * community — languages, standards, everyone who gives their work away.
	 *
	 * What Q uses or is building on (package.json, packages/*, spikes/, node/,
 * ADR-Q-009 and ADR-Q-010): the front end, then a second row for the nodes
 * and the network — Dgraph, Docker, Nebula, Mosquitto, Spin, SeaweedFS, Cedar. Names link
	 * to each project. LOGOS: monotone marks from Simple Icons, fetched by
	 * `npm run credit-logos` into src/lib/credits/ — Q does not redraw anyone's
	 * mark. A project with no file keeps its name alone.
	 */
	import { t } from '$lib/i18n/index.svelte';
	import QText from './QText.svelte';
	import { Icon, FaIcon } from '@inqbeta/q-ui';

	/* Where the code is, for anyone to inspect. */
	const REPO = 'https://github.com/inqbeta/q';

	/* `id` names its logo, if there is one: src/lib/credits/<id>.svg (npm run credit-logos). */
	/*
	 * `ref`: a referral link, when there is one (e.g. ElevenLabs' affiliate
	 * programme). Then the name links through it, and the page says so under
	 * the credits — honestly, as UK advertising rules expect. None set yet.
	 */
	type Credit = { id?: string; name: string; href: string; what: string; ref?: string };

	/* Monotone logos, inlined so they take the text colour in light and dark. */
	const LOGOS = import.meta.glob('$lib/credits/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
	const logo = (id?: string) => (id ? Object.entries(LOGOS).find(([path]) => path.endsWith(`/${id}.svg`))?.[1] : undefined);

	/* The front end Q is built with. */
	const MAIN: Credit[] = [
		{ id: 'svelte', name: 'Svelte & SvelteKit', href: 'https://svelte.dev', what: 'the app' },
		{ id: 'skeleton', name: 'Skeleton', href: 'https://www.skeleton.dev', what: 'design system' },
		{ id: 'tailwind', name: 'Tailwind CSS', href: 'https://tailwindcss.com', what: 'styling' },
		{ id: 'dgraph', name: 'Dgraph', href: 'https://dgraph.io', what: 'graph database' },
		{ id: 'vercel', name: 'Vercel', href: 'https://vercel.com', what: 'hosting' },
		{ id: 'typescript', name: 'TypeScript', href: 'https://www.typescriptlang.org', what: 'language' }
	];

	/* The nodes and the network: what carries Q between people (ADR-Q-009, ADR-Q-010, node/). */
	const NODES: Credit[] = [
		{ id: 'docker', name: 'Docker', href: 'https://www.docker.com', what: 'containers' },
		{ id: 'nebula', name: 'Nebula', href: 'https://github.com/slackhq/nebula', what: 'mesh network' },
		{ id: 'mosquitto', name: 'Eclipse Mosquitto', href: 'https://mosquitto.org', what: 'messages' },
		{ id: 'spin', name: 'Spin', href: 'https://spinframework.dev', what: 'WebAssembly on nodes' },
		{ id: 'seaweedfs', name: 'SeaweedFS', href: 'https://github.com/seaweedfs/seaweedfs', what: 'storage' },
		{ id: 'cedar', name: 'Cedar', href: 'https://www.cedarpolicy.com', what: 'rules engine, from AWS' }
	];

	/* The tools and libraries underneath. */
	const TOOLS: Credit[] = [
		{ name: 'Vite', href: 'https://vite.dev', what: 'build' },
		{ name: 'Zag.js', href: 'https://zagjs.com', what: 'component logic' },
		{ name: 'Lucide', href: 'https://lucide.dev', what: 'icons' },
		{ name: 'Font Awesome', href: 'https://fontawesome.com', what: 'icons' },
		{ name: 'ElevenLabs', href: 'https://elevenlabs.io', what: 'the voice' },
		{ name: 'Resend', href: 'https://resend.com', what: 'email' },
		{ name: 'Turborepo', href: 'https://turborepo.com', what: 'monorepo' },
		{ name: 'pnpm', href: 'https://pnpm.io', what: 'packages' }
	];

	/* The engineering teams behind the AI that helped build it. */
	const AI: Credit[] = [
		{ id: 'claude', name: 'Claude', href: 'https://www.anthropic.com', what: 'Anthropic' },
		{ id: 'chatgpt', name: 'ChatGPT', href: 'https://openai.com', what: 'OpenAI' },
		{ id: 'minimax', name: 'MiniMax', href: 'https://www.minimax.io', what: 'MiniMax' }
	];

	/* The wider community: languages, runtimes, standards bodies. */
	/* Shown only when at least one credit carries a referral link. */
	const referred = $derived([...MAIN, ...NODES, ...TOOLS, ...AI].some((c) => c.ref));

	const COMMUNITY = [
		'JavaScript', 'TypeScript', 'Go', 'Rust', 'C', 'WebAssembly', 'Node.js', 'HTML', 'CSS', 'Lean',
		'W3C', 'IETF', 'FIDO Alliance', 'Decentralized Identity Foundation', 'UCAN Working Group',
		'IPLD & Multiformats', 'MDN Web Docs', 'every open-source contributor'
	];
</script>

<section class="w-full max-w-5xl space-y-10 text-center" aria-labelledby="love-title">
	<!-- A heart, as the padlock opens "How secure is this?". -->
	<header class="max-w-2xl mx-auto space-y-3">
		<Icon name="heart" class="size-12 mx-auto text-secondary-500" stroke={2} />
		<h2 id="love-title" class="h3" data-read="love.title">{t('love.title')}</h2>
		<p class="text-lg text-primary-600-400 font-semibold" data-read="love.line">{t('love.line')}</p>
		<p class="font-semibold">
			<a class="anchor inline-flex items-center gap-2" href={REPO} rel="noopener" target="_blank" data-read="love.source">
				<span><QText text={t('love.source')} /></span>
				<FaIcon name="github" size="lg" />
			</a>
		</p>
	</header>

	<div class="space-y-4">
		<h3 class="h5" data-read="thanks.title">{t('thanks.title')}</h3>
		<ul class="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
			{#each MAIN as c (c.name)}
				<li>
					<a class="card preset-tonal h-full p-4 flex flex-col items-center justify-center gap-1 hover:preset-filled-secondary-50-950" href={c.ref ?? c.href} rel="noopener" target="_blank">
						{#if logo(c.id)}<span class="block size-8 *:size-full">{@html logo(c.id)}</span>{/if}
						<span class="font-bold">{c.name}</span>
						<span class="text-xs text-surface-700-300">{c.what}</span>
					</a>
				</li>
			{/each}
		</ul>
		<!-- Second row: the nodes and the network. -->
		<ul class="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
			{#each NODES as c (c.name)}
				<li>
					<a class="card preset-tonal h-full p-4 flex flex-col items-center justify-center gap-1 hover:preset-filled-secondary-50-950" href={c.ref ?? c.href} rel="noopener" target="_blank">
						{#if logo(c.id)}<span class="block size-8 *:size-full">{@html logo(c.id)}</span>{/if}
						<span class="font-bold">{c.name}</span>
						<span class="text-xs text-surface-700-300">{c.what}</span>
					</a>
				</li>
			{/each}
		</ul>
		<ul class="flex flex-wrap justify-center gap-2">
			{#each TOOLS as c (c.name)}
				<li>
					<a class="chip preset-outlined-surface-500 hover:preset-filled-secondary-50-950" href={c.ref ?? c.href} rel="noopener" target="_blank">
						<span class="font-semibold">{c.name}</span><span class="text-surface-700-300">· {c.what}</span>
					</a>
				</li>
			{/each}
		</ul>
	</div>

	<div class="space-y-4">
		<h3 class="h5" data-read="thanks.ai">{t('thanks.ai')}</h3>
		<ul class="grid gap-3 sm:grid-cols-3 max-w-3xl mx-auto">
			{#each AI as c (c.name)}
				<li>
					<a class="card preset-outlined-primary-500 h-full p-5 flex flex-col items-center gap-1 hover:preset-filled-secondary-50-950" href={c.ref ?? c.href} rel="noopener" target="_blank">
						{#if logo(c.id)}<span class="block size-10 *:size-full">{@html logo(c.id)}</span>{/if}
						<span class="h4">{c.name}</span>
						<span class="text-sm text-surface-700-300">{c.what}</span>
					</a>
				</li>
			{/each}
		</ul>
	</div>

	<div class="space-y-3 max-w-3xl mx-auto">
		<p class="text-sm text-surface-700-300" data-read="thanks.community">{t('thanks.community')}</p>
		<!-- A list that wraps, so it always stays inside the page. -->
		<ul class="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-surface-700-300">
			{#each COMMUNITY as name (name)}<li>{name}</li>{/each}
		</ul>
	</div>

	{#if referred}
		<p class="text-xs text-surface-700-300 max-w-2xl mx-auto" data-read="thanks.referral"><QText text={t('thanks.referral')} /></p>
	{/if}
</section>
