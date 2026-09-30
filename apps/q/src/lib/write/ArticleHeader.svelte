<script lang="ts">
	/*
	 * The top of an article as plain fields: what it is called, its cover,
	 * the credits and what was done. Kept as blocks underneath
	 * (q-core/article-form.ts); nobody arranges the header by hand.
	 */
	import type { ArticleForm } from '@inqbeta/q-core/article-form';
	import PictureChoice from './PictureChoice.svelte';
	import type { EditorContext } from './types';

	let { form = $bindable(), ctx, project }: { form: ArticleForm; ctx: EditorContext; project: boolean } = $props();
</script>

<div class="space-y-3 rounded-container bg-surface-50-950 p-3 shadow ring-1 ring-surface-300-700">
	<label class="label"><span class="label-text">Title</span><input class="input text-lg font-semibold" bind:value={form.title} /></label>
	<label class="label"><span class="label-text">Subtitle <span class="opacity-60">— the line under the title</span></span><input class="input" bind:value={form.subtitle} /></label>

	<div class="grid gap-3 sm:grid-cols-[auto_1fr]">
		<div>
			<span class="label-text">Cover picture</span>
			<PictureChoice pictures={ctx.pictures} origin={ctx.origin} value={form.cover} onchange={(a) => (form.cover = a)} label="Choose a cover" />
		</div>
		<label class="label">
			<span class="label-text">What is in the cover?</span>
			<textarea class="textarea text-sm" rows="3" bind:value={form.coverAlt}></textarea>
		</label>
	</div>

	{#if project}
		<fieldset class="grid gap-3 sm:grid-cols-2">
			<legend class="label-text mb-1">Credits</legend>
			<label class="label"><span class="label-text text-xs">Our role</span><input class="input input-sm" bind:value={form.role} placeholder="Production Management" /></label>
			<label class="label"><span class="label-text text-xs">Where</span><input class="input input-sm" bind:value={form.location} /></label>
			<label class="label"><span class="label-text text-xs">With</span><input class="input input-sm" bind:value={form.partner} placeholder="Walk The Plank / Unboxed" /></label>
			<label class="label"><span class="label-text text-xs">When, as shown</span><input class="input input-sm" bind:value={form.dateShown} placeholder="July – September 2022" /></label>
		</fieldset>

		<div class="grid gap-3 sm:grid-cols-[auto_1fr]">
			<div>
				<span class="label-text">Partner's logo</span>
				<PictureChoice pictures={ctx.pictures} origin={ctx.origin} value={form.logo} onchange={(a) => (form.logo = a)} label="Choose a logo" />
			</div>
			<div class="space-y-2">
				<label class="label"><span class="label-text text-xs">What the logo shows</span><input class="input input-sm" bind:value={form.logoAlt} /></label>
				<label class="label"><span class="label-text text-xs">What we did, in one line</span><textarea class="textarea text-sm" rows="2" bind:value={form.standfirst}></textarea></label>
			</div>
		</div>
	{/if}
</div>
