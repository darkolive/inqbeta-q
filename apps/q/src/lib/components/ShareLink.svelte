<script lang="ts">
	/*
	 * Sending a link to someone.
	 *
	 * 2 October 2026 (Darren): sharing IS choosing a channel — "your options
	 * are the channels for sharing … default to email, WhatsApp, text". So
	 * when there's a message, the channels are the buttons, each opening the
	 * person's own app with the words and the link written in; Q isn't
	 * involved in sending. The code to scan stays, for someone standing next
	 * to you. Copying is only offered where there's no message to send.
	 *
	 * 3 October 2026 (Darren): AirDrop, for friends with iPhones. A web page
	 * can't call AirDrop itself, but the phone's own share sheet (the Web
	 * Share API) has it, with Messages and every other app they have. Shown
	 * only where the browser offers it: Safari on iPhone, iPad and Mac, and
	 * most phones; called "AirDrop and more" on Apple devices.
	 */
	import { QrCode } from '@skeletonlabs/skeleton-svelte';
	import { Icon, FaIcon } from '@inqbeta/q-ui';
	import { copyText, hasShareSheet, isApple, openShareSheet, shareAddresses } from '$lib/share';

	let { link, label = 'Link', note = '', subject = '', message = '' }: { link: string; label?: string; note?: string; subject?: string; message?: string } = $props();
	const to = $derived(shareAddresses(message, link, subject));

	/* A QR code holds about 2,900 characters; short card links always fit. */
	const scannable = $derived(link.length <= 2800);
	/* A link made on a dev server points at this computer: a phone can't open it. */
	const local = $derived(/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(link));

	let copied = $state(false);
	async function copy() {
		copied = await copyText(link);
		if (copied) setTimeout(() => (copied = false), 2500);
	}
	let showCode = $state(false);

	/* The device's own share sheet, where there is one (decided in the browser, never on the server). */
	let sheet = $state(false);
	let apple = $state(false);
	$effect(() => {
		sheet = hasShareSheet();
		apple = isApple();
	});
	let sheetSays = $state('');
	async function share() {
		sheetSays = (await openShareSheet({ title: subject || label, text: message, url: link })) === 'failed' ? 'Your device couldn’t open its share sheet. Try another way below.' : '';
	}
</script>

<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-4">
	<p class="font-bold">{label}</p>
	{#if note}<p class="text-sm">{note}</p>{/if}
	{#if local}
		<p class="text-sm card preset-tonal-warning p-2">This link points at this computer (localhost), so a phone can’t open it. Make it on inqbeta.dev to share it.</p>
	{/if}
	{#if sheet}
		<button type="button" class="btn preset-filled-secondary-500 min-h-11 py-3" onclick={() => void share()}><Icon name="share" size={20} />{apple ? 'AirDrop and more' : 'More ways to share'}</button>
		{#if sheetSays}<p class="text-sm card preset-tonal-warning p-2">{sheetSays}</p>{/if}
	{/if}
	{#if message}
		<div class="grid grid-cols-3 gap-2">
			<a class="btn preset-filled-primary-500 min-h-11 flex-col h-auto py-3 gap-1" href={to.email}><Icon name="mail" size={22} /><span>Email</span></a>
			<a class="btn preset-filled-primary-500 min-h-11 flex-col h-auto py-3 gap-1" href={to.whatsapp} target="_blank" rel="noreferrer noopener"><FaIcon name="whatsapp" size="lg" /><span>WhatsApp</span></a>
			<a class="btn preset-filled-primary-500 min-h-11 flex-col h-auto py-3 gap-1" href={to.text}><Icon name="message" size={22} /><span>Text</span></a>
		</div>
	{:else}
		<input class="input text-xs" type="text" readonly value={link} aria-label={label} onfocus={(e) => e.currentTarget.select()} />
		<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" onclick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
	{/if}
	{#if scannable}
		{#if showCode}
			<div class="bg-surface-50 p-2 rounded-container self-center">
				<QrCode value={link}>
					<QrCode.Frame class="size-48">
						<QrCode.Pattern />
					</QrCode.Frame>
				</QrCode>
			</div>
			<p class="text-xs opacity-60 text-center">They scan this with their phone’s camera.</p>
		{:else}
			<button type="button" class="btn preset-tonal min-h-11" onclick={() => (showCode = true)}>They’re here with me: show a code to scan</button>
		{/if}
	{/if}
</div>
