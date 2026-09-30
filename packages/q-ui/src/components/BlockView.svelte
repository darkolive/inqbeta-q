<script lang="ts">
	/*
	 * One block, drawn.
	 *
	 * THIS COMPONENT FETCHES NOTHING. Everything it needs arrives as props.
	 * That is what keeps "a template carries no behaviour" true at the place it
	 * would otherwise leak: a renderer that could go and get something would be
	 * a renderer a template could aim, and aiming it is the whole attack.
	 *
	 * Ten kinds, one switch, no `custom`. A kind that is not here cannot be
	 * reached — blocks.ts refuses it long before a page gets this far — but the
	 * fallback still says so out loud rather than drawing an empty div, because
	 * a page that silently shows less than its author meant is the failure this
	 * vocabulary exists to prevent.
	 */
	import type { Snippet } from 'svelte';
	import Heading from './Heading.svelte';
	import Text from './Text.svelte';
	import Item from './Item.svelte';
	import Empty from './Empty.svelte';
	import type { Drawn, Supply } from '../drawing';
	import { classesFor, lookOf, widthClass } from '../look';
	import { inlineHtml } from '@inqbeta/q-core/inline';
	import { factsOf } from '@inqbeta/q-core/blocks';
	/* Svelte 5: a component refers to itself by importing itself. svelte:self is gone. */
	import Self from './BlockView.svelte';

	let {
		block,
		supply = {},
		slot,
		header,
		menu,
		drawer,
		component
	}: {
		block: Drawn;
		supply?: Supply;
		slot?: Snippet<[Drawn]>;
		/* Q's own chrome, handed in. A renderer cannot build one, so a template
		 * cannot describe one into existence. */
		header?: Snippet<[{ signIn: boolean; search: boolean; reading: boolean }]>;
		menu?: Snippet<[{ open: boolean }]>;
		drawer?: Snippet<[{ called: string; open: boolean }]>;
		/* A library component (ADR-Q-006), handed in the same way: the app holds
		 * the code, the block only names it and carries its answers. */
		component?: Snippet<[{ pin: string; settings: Drawn['settings'] }]>;
	} = $props();

	const look = $derived(classesFor(lookOf(block.settings)));


	const says = $derived(String(block.settings['q:block/says'] ?? ''));
	const size = $derived(String(block.settings['q:block/size'] ?? 'medium'));
	const labels = $derived(block.settings['q:block/labels'] !== false);
	const howMany = $derived(Number(block.settings['q:block/how-many'] ?? 5));
	const under = $derived(String(block.settings['q:block/under'] ?? ''));
	const on = (k: string, fallback = true) => block.settings[k] !== false && (block.settings[k] !== undefined || fallback);
	const rows = $derived(String(block.settings['q:block/rows'] ?? 'answers'));
</script>

<div class="flex flex-col {look}">
{#if block.heading}
	<Heading role="title">{block.heading}</Heading>
{/if}

{#if block.kind === 'heading'}
	<Heading role={size === 'large' ? 'section-title' : size === 'small' ? 'subtitle' : 'title'}>{says}</Heading>

{:else if block.kind === 'text'}
	<!-- inlineHtml escapes everything but bold, italic and links, so this
	     cannot become markup that runs. -->
	<p class="role-description" data-role="description">{@html inlineHtml(says)}</p>

{:else if block.kind === 'divider'}
	<hr class="hr my-2" />

{:else if block.kind === 'button'}
	<!-- A link that looks like a button. Where it goes was checked when the
	     page was made (blocks.ts); nothing here runs. -->
	<div><a class="btn preset-filled-primary-500" href={String(block.settings['q:block/to'] ?? '#')}>{says}</a></div>

{:else if block.kind === 'section' && block.settings['q:block/arrange'] === 'disclosure'}
	<details class="card preset-outlined-surface-200-800 p-3">
		<summary class="cursor-pointer font-medium">{says || 'More'}</summary>
		<div class="mt-3 flex flex-col gap-3">
			{#each block.children ?? [] as child (child.id)}<Self block={child} {supply} {slot} {header} {menu} {drawer} />{/each}
		</div>
	</details>

{:else if block.kind === 'section' && (block.settings['q:block/arrange'] === 'gallery' || block.settings['q:block/arrange'] === 'columns')}
	{@const three = block.settings['q:block/arrange'] === 'gallery' || block.settings['q:block/columns'] === '3'}
	<div class="grid gap-4 {three ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}">
		{#each block.children ?? [] as child (child.id)}<div><Self block={child} {supply} {slot} {header} {menu} {drawer} /></div>{/each}
	</div>

{:else if block.kind === 'note'}
	<!-- A note to the author. Never drawn on a page anybody else sees. -->

{:else if block.kind === 'quote'}
	<blockquote class="border-l-4 border-primary-500 pl-4 italic">{@html inlineHtml(says)}</blockquote>

{:else if block.kind === 'cover'}
	{@const picture = supply.pictures?.[String(block.settings['q:block/at'] ?? '')]}
	<div class="relative overflow-hidden rounded">
		{#if picture}<img src={picture} alt={String(block.settings['q:block/alt'] ?? '')} class="aspect-2/1 w-full object-cover" />{/if}
		<div class="{picture ? 'absolute left-4 top-4 max-w-xl' : ''} bg-secondary-500 p-6 text-secondary-50">
			<Heading role="page-title">{says}</Heading>
			{#if under}<p class="mt-2 text-xl">{under}</p>{/if}
		</div>
	</div>

{:else if block.kind === 'facts'}
	<dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each factsOf(block as unknown as Record<string, unknown>) as f (f.label)}
			<div><dt><Text role="label">{f.label}</Text></dt><dd><Text role="value">{f.value}</Text></dd></div>
		{/each}
	</dl>

{:else if block.kind === 'standfirst'}
	{@const mark = supply.pictures?.[String(block.settings['q:block/at'] ?? '')]}
	<div class="grid items-center gap-6 md:grid-cols-[auto_1fr]">
		{#if mark}<img src={mark} alt={String(block.settings['q:block/alt'] ?? '')} class="h-35 w-65 rounded-lg bg-surface-50 object-contain p-5" />{/if}
		<Text role="lead">{says}</Text>
	</div>

{:else if block.kind === 'figure'}
	{@const src = supply.pictures?.[String(block.settings['q:block/at'] ?? '')]}
	{@const caption = String(block.settings['q:block/caption'] ?? '')}
	<figure>
		{#if src}
			<img {src} alt={String(block.settings['q:block/alt'] ?? '')} class="h-auto max-w-full rounded" />
		{:else}
			<Empty icon="info" title="Picture not here" description="This page shows a picture that is not in this folder." />
		{/if}
		{#if caption}<figcaption><Text role="meta">{caption}</Text></figcaption>{/if}
	</figure>

{:else if block.kind === 'embed'}
	<!-- Nothing is fetched from the provider here. The site that publishes the
	     page decides how it loads — Dark Olive's asks first for the two that set cookies. -->
	<Empty
		icon="info"
		title={says || 'A film or recording'}
		description={`From ${String(block.settings['q:block/provider'] ?? '')}. Loaded by the site it is published on, never here.`}
	/>

{:else if block.kind === 'answers'}
	{@const shown = block.reads.map((id) => ({ id, a: supply.answers?.[id] }))}
	{#if shown.every((s) => !s.a)}
		<Empty icon="info" title="Nothing to show here yet" description="These questions have not been answered." />
	{:else}
		<dl class="flex flex-col gap-2">
			{#each shown as { id, a } (id)}
				{#if a}
					{#if labels}<dt><Text role="label">{a.label}</Text></dt>{/if}
					<dd><Text role="value">{a.value}</Text></dd>
				{/if}
			{/each}
		</dl>
	{/if}

{:else if block.kind === 'card'}
	{@const name = String(block.settings['q:block/card'] ?? '')}
	{@const card = supply.cards?.[name]}
	{#if card}
		<Item title={card.name} description="{card.shows.length} shown" />
	{:else}
		<Empty icon="card" title="That card is not here" description={`This page shows a card called “${name}”, and there is none.`} />
	{/if}

{:else if block.kind === 'places'}
	{#if supply.places?.length}
		{#each supply.places as p (p.id)}<Item title={p.called} description={p.says} />{/each}
	{:else}
		<Empty icon="network" title="Nowhere yet" description="No places have been written down." />
	{/if}

{:else if block.kind === 'receipts'}
	{#if supply.receipts?.length}
		{#each supply.receipts.slice(0, howMany) as r (r.id)}<Item title={r.title} meta={r.at} />{/each}
	{:else}
		<Empty icon="info" title="Nothing written yet" description="Receipts appear here as they are made." />
	{/if}

{:else if block.kind === 'contacts'}
	{#if supply.contacts?.length}
		{#each supply.contacts as c (c.id)}<Item title={c.called} />{/each}
	{:else}
		<Empty icon="info" title="Nobody yet" description="People you hold a receipt for appear here." />
	{/if}

{:else if block.kind === 'federations'}
	{#if supply.federations?.length}
		{#each supply.federations as f (f.id)}<Item title={f.called} />{/each}
	{:else}
		<Empty icon="info" title="None yet" description="Federations you belong to appear here." />
	{/if}

{:else if block.kind === 'image'}
	{@const at = String(block.settings['q:block/at'] ?? '')}
	{@const src = supply.pictures?.[at]}
	{#if src}
		<!-- The alt text is the heading, or nothing: a template cannot invent a
		     description of a picture it has never seen. -->
		<img {src} alt={block.heading ?? ''} class="h-auto max-w-full rounded" />
	{:else}
		<Empty icon="info" title="Picture not here" description="This page shows a picture that is not in this folder." />
	{/if}

{:else if block.kind === 'section'}
	<!-- A group draws its children, by their widths, in a grid of its own.
	     Recursion is the renderer's; the depth is capped in blocks.ts, so a
	     template arriving with two thousand levels in it is refused before it
	     ever reaches here. -->
	{#if block.children?.length}
		<div class="grid grid-cols-12 gap-4">
			{#each block.children as child (child.id)}
				<div class={widthClass(child.width)}>
					<Self block={child} {supply} {slot} {header} {menu} {drawer} />
				</div>
			{/each}
		</div>
	{:else}
		<Empty icon="info" title="An empty group" description="Put something in it and it appears here." />
	{/if}

{:else if block.kind === 'space'}
	<div class={size === 'large' ? 'h-16' : 'h-6'} aria-hidden="true"></div>

{:else if block.kind === 'hero'}
	{@const picture = supply.pictures?.[String(block.settings['q:block/at'] ?? '')]}
	<div class="relative overflow-hidden">
		{#if picture}
			<img src={picture} alt="" class="absolute inset-0 h-full w-full object-cover opacity-20" />
		{/if}
		<div class="relative flex flex-col gap-3 py-10">
			<Heading role="page-title">{says}</Heading>
			{#if under}<Text role="lead">{under}</Text>{/if}
			{#if block.settings['q:block/card']}
				{@const c = supply.cards?.[String(block.settings['q:block/card'])]}
				{#if c}<Item title={c.name} description="{c.shows.length} shown" />{/if}
			{/if}
		</div>
	</div>

{:else if block.kind === 'table'}
	{@const columns = block.reads.length ? block.reads : []}
	{#if !columns.length}
		<Empty icon="info" title="No columns yet" description="Choose which columns this table shows." />
	{:else}
		<div class="overflow-x-auto">
			<table class="table">
				<thead>
					<tr>{#each columns as c (c)}<th scope="col">{supply.answers?.[c]?.label ?? c}</th>{/each}</tr>
				</thead>
				<tbody>
					{#if rows === 'answers'}
						<tr>{#each columns as c (c)}<td>{supply.answers?.[c]?.value ?? '—'}</td>{/each}</tr>
					{:else if rows === 'places'}
						{#each (supply.places ?? []).slice(0, howMany) as p (p.id)}
							<tr><td>{p.called}</td><td>{p.says}</td></tr>
						{/each}
					{:else if rows === 'contacts'}
						{#each (supply.contacts ?? []).slice(0, howMany) as p (p.id)}<tr><td>{p.called}</td></tr>{/each}
					{:else}
						{#each (supply.receipts ?? []).slice(0, howMany) as r (r.id)}
							<tr><td>{r.title}</td><td>{r.at}</td></tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	{/if}

{:else if block.kind === 'blog'}
	{#if supply.posts?.length}
		<div class="flex flex-col gap-4">
			{#each supply.posts.slice(0, howMany) as post (post.id)}
				<Item title={post.title} meta={post.at} description={labels ? post.opening : undefined} />
			{/each}
		</div>
	{:else}
		<Empty icon="info" title="Nothing written yet" description="Posts appear here as they are made." />
	{/if}

{:else if block.kind === 'header'}
	{#if header}
		{@render header({ signIn: on('q:block/sign-in'), search: on('q:block/search'), reading: on('q:block/reading') })}
	{:else}
		<Empty icon="info" title="The header sits here" description="Q’s own header, with whatever you have turned on." />
	{/if}

{:else if block.kind === 'menu'}
	{#if menu}
		{@render menu({ open: block.settings['q:block/open'] === true })}
	{:else}
		<Empty icon="info" title="The side menu sits here" description="Q’s own menu." />
	{/if}

{:else if block.kind === 'drawer'}
	{#if drawer}
		{@render drawer({ called: says, open: block.settings['q:block/open'] === true })}
	{:else}
		<Empty icon="info" title={says || 'A drawer'} description="Q’s own drawer, shut until somebody opens it." />
	{/if}

{:else if block.kind === 'component'}
	{#if component}
		{@render component({ pin: String(block.settings['q:block/component'] ?? ''), settings: block.settings })}
	{:else}
		<Empty icon="info" title="A component sits here" description={`${String(block.settings['q:block/component'] ?? 'A component')} — drawn by the app that holds its code.`} />
	{/if}

{:else if slot}
	{@render slot(block)}

{:else}
	<Empty
		icon="info"
		title="Nothing draws this"
		description={`This page asks for a “${block.kind}”, and there is nothing that draws one. It is showing less than whoever made it meant.`}
	/>
{/if}

{#if block.from}
	<Text role="meta">From {block.from.plugin}</Text>
{/if}
</div>
