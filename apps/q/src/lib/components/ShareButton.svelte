<script lang="ts">
	/*
	 * One small Share button (4 October 2026), for sharing from inside a line of
	 * controls: a story's scene, or the whole book of stories. Where the
	 * device has its own share sheet (AirDrop and more), that opens; otherwise
	 * a small menu: email, WhatsApp, text, or copy the link.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { copyText, hasShareSheet, openShareSheet, shareAddresses } from '$lib/share';

	let { link, title, message = '', label = 'Share', wide = false }: { link: string; title: string; message?: string; label?: string; wide?: boolean } = $props();

	let open = $state(false);
	let copied = $state(false);
	const to = $derived(shareAddresses(message, link, title));

	async function share() {
		if (hasShareSheet()) {
			const out = await openShareSheet({ title, text: message, url: link });
			if (out !== 'failed') return;
		}
		open = !open;
	}
	async function copy() {
		copied = await copyText(link);
		if (copied)
			setTimeout(() => {
				copied = false;
				open = false;
			}, 1800);
	}
</script>

<div class="relative {wide ? 'w-full' : ''}">
	<button type="button" class="btn preset-tonal min-h-11 {wide ? 'w-full' : ''}" aria-expanded={open} aria-label={wide ? undefined : label} title={label} onclick={() => void share()}>
		<Icon name="share" size={18} />{#if wide}<span>{label}</span>{/if}
	</button>
	{#if open}
		<button type="button" class="fixed inset-0 z-40 cursor-default" aria-label="Close" onclick={() => (open = false)}></button>
		<div class="absolute right-0 bottom-full mb-2 z-50 card bg-surface-50-950 border-2 border-primary-500 shadow-xl p-2 flex flex-col w-52" role="menu">
			<a role="menuitem" class="btn justify-start hover:preset-tonal min-h-11" href={to.email}><Icon name="mail" size={18} /> Email</a>
			<a role="menuitem" class="btn justify-start hover:preset-tonal min-h-11" href={to.whatsapp} target="_blank" rel="noopener"><Icon name="message" size={18} /> WhatsApp</a>
			<a role="menuitem" class="btn justify-start hover:preset-tonal min-h-11" href={to.text}><Icon name="phone" size={18} /> Text</a>
			<button role="menuitem" type="button" class="btn justify-start hover:preset-tonal min-h-11" onclick={() => void copy()}><Icon name={copied ? 'check' : 'link'} size={18} /> {copied ? 'Copied' : 'Copy the link'}</button>
		</div>
	{/if}
</div>
