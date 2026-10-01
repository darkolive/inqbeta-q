<script lang="ts">
	/*
	 * A card, drawn as a card (1 October 2026): a cover along the top, a round
	 * picture overlapping it, the name, then the details — the way a person
	 * expects a profile to look, not a table of field names.
	 *
	 * It draws ONLY what it is given. What a card may show is decided by
	 * cardView in q-core and nowhere else; this just makes it look like you.
	 */
	import { Avatar, Icon } from '@inqbeta/q-ui';
	import { LABEL, LABELS_KEY } from '$lib/profile';

	let {
		details,
		did,
		badge = '',
		missing = []
	}: {
		/** Question id → value, already decided by cardView. */
		details: Record<string, string>;
		did: string;
		/** The card's name, e.g. "Basic". */
		badge?: string;
		/** Named by the card, not answered yet — shown so you can fix it, never to a holder. */
		missing?: string[];
	} = $props();

	const cover = $derived(details['q:person/cover']);
	const picture = $derived(details['q:person/picture']);
	const name = $derived(details['q:person/called'] || [details['q:person/first'], details['q:person/last']].filter(Boolean).join(' '));
	const pronouns = $derived(details['q:person/pronouns']);
	/* A Business card's work details (q:biz/<slug>/…) stand in for role, org, page and contact. */
	const biz = $derived(Object.keys(details).map((k) => /^q:biz\/([a-z0-9-]+)\/name$/.exec(k)?.[1]).find(Boolean));
	const bz = (part: string) => (biz ? details[`q:biz/${biz}/${part}`] : undefined);
	const role = $derived(details['q:person/role'] || bz('role'));
	const org = $derived(details['q:org/name'] || bz('name'));
	const near = $derived(details['q:person/near']);
	const site = $derived(details['q:person/site'] || bz('site'));
	const about = $derived(details['q:person/about']);
	const siteLabel = $derived(site ? site.replace(/^https?:\/\//, '').replace(/\/$/, '') : '');
	/* Ways to reach them: each opens the person's own app. Q is not involved. */
	const email = $derived(bz('email') || details['q:person/email']);
	const phone = $derived(bz('phone') || details['q:person/phone']);
	const whatsapp = $derived(details['q:person/whatsapp']);
	const digits = (n: string) => n.replace(/[^\d+]/g, '');

	/*
	 * Everything else the card carries, as label and value: the quieter
	 * profile details, and details people added themselves, whose labels
	 * travel with the card (LABELS_KEY) so any Q can draw them.
	 */
	const DRAWN = new Set(['q:person/cover', 'q:person/picture', 'q:person/called', 'q:person/first', 'q:person/last', 'q:person/pronouns', 'q:person/role', 'q:org/name', 'q:person/near', 'q:person/site', 'q:person/about', 'q:person/email', 'q:person/phone', 'q:person/whatsapp', LABELS_KEY]);
	const carried = $derived.by<Record<string, { label: string; kind: string }>>(() => {
		try {
			return JSON.parse(details[LABELS_KEY] ?? '{}');
		} catch {
			return {};
		}
	});
	const others = $derived(
		Object.entries(details)
			.filter(([id, v]) => !DRAWN.has(id) && !(biz && id.startsWith(`q:biz/${biz}/`)) && v)
			.map(([id, v]) => {
				const kind = carried[id]?.kind ?? (id === 'q:person/birthday' ? 'date' : 'text');
				const shown = kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : v;
				return { id, label: carried[id]?.label ?? LABEL[id] ?? id.replace(/^.*\//, ''), value: shown, picture: kind === 'picture' && v.startsWith('data:image/'), link: kind === 'link' };
			})
	);
</script>

<article class="card preset-outlined-surface-200-800 overflow-hidden bg-surface-50-950">
	<!-- Cover: the picture, or a quiet wash of the brand colours when there isn't one. -->
	<div class="relative z-0 h-28 sm:h-32">
		{#if cover}
			<img src={cover} alt="" class="size-full object-cover" />
		{:else}
			<div class="size-full preset-tonal-primary"></div>
		{/if}
		{#if badge}
			<!-- Filled, with a shadow, so it reads on any cover picture. -->
			<span class="absolute right-3 top-3 z-10 badge preset-filled-primary-500 shadow-lg">{badge}</span>
		{/if}
	</div>

	<div class="px-5 pb-5">
		<!-- In front of the cover: the cover sits behind, the picture overlaps it. -->
		<div class="relative z-10 -mt-10 mb-3 size-20 overflow-hidden rounded-full border-4 border-surface-50-950 bg-surface-100-900 shadow-md">
			{#if picture}
				<img src={picture} alt="" class="size-full object-cover" />
			{:else}
				<span class="flex size-full items-center justify-center"><Avatar {did} size={72} label="" /></span>
			{/if}
		</div>

		{#if name}<h3 class="h4">{name}{#if pronouns}<span class="ml-2 text-sm font-normal opacity-60">({pronouns})</span>{/if}</h3>{/if}
		{#if role || org}
			<p class="opacity-80">{[role, org].filter(Boolean).join(' · ')}</p>
		{/if}
		{#if near}<p class="text-sm opacity-60">{near}</p>{/if}
		{#if about}<p class="mt-3">{about}</p>{/if}
		{#if site}
			<p class="mt-3"><a class="anchor" href={site} target="_blank" rel="noreferrer noopener">{siteLabel}</a></p>
		{/if}
		{#if others.length}
			<dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
				{#each others as o (o.id)}
					<dt class="opacity-60">{o.label}</dt>
					<dd class="whitespace-pre-line">
						{#if o.picture}<img src={o.value} alt={o.label} class="h-20 rounded-base object-cover" />
						{:else if o.link}<a class="anchor" href={o.value} target="_blank" rel="noreferrer noopener">{o.value.replace(/^https?:\/\//, '')}</a>
						{:else}{o.value}{/if}
					</dd>
				{/each}
			</dl>
		{/if}
		{#if email || phone || whatsapp}
			<div class="mt-4 flex flex-wrap gap-2" aria-label="Ways to reach {name ?? 'them'}">
				{#if phone}<a class="btn preset-tonal min-h-11" href="tel:{digits(phone)}"><Icon name="phone" size={18} /> Call</a>{/if}
				{#if whatsapp}<a class="btn preset-tonal min-h-11" href="https://wa.me/{digits(whatsapp).replace('+', '')}" target="_blank" rel="noreferrer noopener"><Icon name="message" size={18} /> WhatsApp</a>{/if}
				{#if email}<a class="btn preset-tonal min-h-11" href="mailto:{email}"><Icon name="mail" size={18} /> Email</a>{/if}
			</div>
		{/if}
		{#if !name && !role && !about && !near && !site && !others.length}
			<p class="text-sm opacity-60">Nothing in words on this card yet.</p>
		{/if}
		{#if missing.length}
			<p class="mt-3 text-xs opacity-60">Not filled in yet, so not shown: {missing.join(', ')}</p>
		{/if}
	</div>
</article>
