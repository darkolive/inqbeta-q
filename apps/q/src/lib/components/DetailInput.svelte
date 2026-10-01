<script lang="ts">
	/* One detail's input, drawn for its kind: words, lines, a date, a number, yes or no, a link, a picture. */
	import type { DetailKind } from '$lib/profile';
	import { smallPicture, PICTURE, COVER } from '$lib/pictures';

	let { kind, label, value = $bindable(''), onerror }: { kind: DetailKind; label: string; value?: string; onerror?: (m: string) => void } = $props();

	async function pick(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const size = kind === 'cover' ? COVER : PICTURE;
			value = await smallPicture(file, size.w, size.h);
		} catch (err) {
			onerror?.(err instanceof Error ? err.message : 'That picture couldn’t be used.');
		}
	}
</script>

{#if kind === 'picture' || kind === 'cover'}
	<div class="flex flex-wrap items-center gap-3">
		{#if value}
			<img src={value} alt="" class="{kind === 'cover' ? 'h-16 w-48 rounded-base' : 'size-16 rounded-full'} object-cover" />
		{/if}
		<label class="btn preset-tonal min-h-11 cursor-pointer">
			{value ? 'Choose another' : 'Choose a picture'}
			<input type="file" accept="image/*" class="sr-only" onchange={pick} />
		</label>
		{#if value}<button type="button" class="btn preset-tonal min-h-11" onclick={() => (value = '')}>Remove</button>{/if}
	</div>
{:else if kind === 'longtext'}
	<textarea class="textarea" rows="3" bind:value aria-label={label}></textarea>
{:else if kind === 'date'}
	<input class="input w-auto" type="date" bind:value aria-label={label} />
{:else if kind === 'number'}
	<input class="input w-40" type="number" inputmode="decimal" bind:value aria-label={label} />
{:else if kind === 'yesno'}
	<div class="flex gap-2" role="group" aria-label={label}>
		<button type="button" class="btn btn-sm min-h-11 {value === 'yes' ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}" aria-pressed={value === 'yes'} onclick={() => (value = value === 'yes' ? '' : 'yes')}>Yes</button>
		<button type="button" class="btn btn-sm min-h-11 {value === 'no' ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}" aria-pressed={value === 'no'} onclick={() => (value = value === 'no' ? '' : 'no')}>No</button>
	</div>
{:else}
	<input class="input" type="text" inputmode={kind === 'link' ? 'url' : undefined} bind:value aria-label={label} />
{/if}
