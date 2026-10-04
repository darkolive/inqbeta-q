<script lang="ts">
	/*
	 * One small Share button (4 October 2026), for sharing from inside a line of
	 * controls: a story's scene, or the whole book of stories.
	 *
	 * Always Q's own menu first (Darren: "I really liked how it gives you the
	 * pop-up with the options"): someone you know on Q, email, WhatsApp, text,
	 * copy the link; for something public, social media too; and the device's
	 * own share sheet (AirDrop and more) last, where there is one.
	 *
	 * "Someone you know on Q" sends it as a message with the link in it, sealed
	 * to them like any message (needs you signed in, and them linked with you).
	 */
	import { Icon, FaIcon } from '@inqbeta/q-ui';
	import { copyText, hasShareSheet, isApple, openShareSheet, shareAddresses } from '$lib/share';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { peopleFrom } from '$lib/people';
	import { sendTo } from '$lib/messages';

	let {
		link,
		title,
		message = '',
		label = 'Share',
		wide = false,
		open: isPublic = false
	}: { link: string; title: string; message?: string; label?: string; wide?: boolean; open?: boolean } = $props();

	let menu = $state(false);
	let view = $state<'menu' | 'people'>('menu');
	let copied = $state(false);
	let said = $state('');
	const to = $derived(shareAddresses(message, link, title));

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));
	const people = $derived(identity ? peopleFrom(ledger, identity.did).filter((p) => p.inbox) : []);

	let sheet = $state(false);
	let apple = $state(false);
	$effect(() => {
		sheet = hasShareSheet();
		apple = isApple();
	});

	function toggle() {
		menu = !menu;
		view = 'menu';
		said = '';
	}
	async function copy() {
		copied = await copyText(link);
		if (copied) setTimeout(() => (copied = false), 1800);
	}
	let sending = $state('');
	async function sendToPerson(p: (typeof people)[number]) {
		sending = p.did;
		const out = await sendTo(p, { kind: 'message', ...(message ? { text: message } : {}), attachments: [{ kind: 'link', url: link, title }] });
		sending = '';
		said = out.ok ? `Sent to ${p.name.split(' ')[0]}.` : out.says;
		if (out.ok) void refreshLedger();
	}
	const item = 'btn justify-start hover:preset-tonal min-h-11 w-full';
</script>

<div class="relative {wide ? 'w-full' : ''}">
	<button type="button" class="btn preset-tonal min-h-11 {wide ? 'w-full' : ''}" aria-expanded={menu} aria-haspopup="menu" aria-label={wide ? undefined : label} title={label} onclick={toggle}>
		<Icon name="share" size={18} />{#if wide}<span>{label}</span>{/if}
	</button>
	{#if menu}
		<button type="button" class="fixed inset-0 z-40 cursor-default" aria-label="Close" onclick={() => (menu = false)}></button>
		<div class="absolute {wide ? 'left-0' : 'right-0'} bottom-full mb-2 z-50 card bg-surface-50-950 border-2 border-primary-500 shadow-xl p-2 flex flex-col w-64 max-h-[70vh] overflow-y-auto" role="menu" aria-label={label}>
			{#if view === 'menu'}
				{#if identity && people.length}
					<button role="menuitem" type="button" class={item} onclick={() => (view = 'people')}><Icon name="contacts" size={18} /> Someone you know on Q</button>
				{/if}
				<a role="menuitem" class={item} href={to.email}><Icon name="mail" size={18} /> Email</a>
				<a role="menuitem" class={item} href={to.whatsapp} target="_blank" rel="noopener"><FaIcon name="whatsapp" size="lg" /> WhatsApp</a>
				<a role="menuitem" class={item} href={to.text}><Icon name="phone" size={18} /> Text</a>
				<button role="menuitem" type="button" class={item} onclick={() => void copy()}><Icon name={copied ? 'check' : 'link'} size={18} /> {copied ? 'Copied' : 'Copy the link'}</button>
				{#if isPublic}
					<p class="text-xs font-semibold uppercase tracking-wider text-surface-700-300 px-3 pt-2 pb-1 border-t border-surface-200-800 mt-1">Social media</p>
					<a role="menuitem" class={item} href={to.facebook} target="_blank" rel="noopener"><FaIcon name="facebook" size="lg" /> Facebook</a>
					<a role="menuitem" class={item} href={to.linkedin} target="_blank" rel="noopener"><FaIcon name="linkedin" size="lg" /> LinkedIn</a>
					<a role="menuitem" class={item} href={to.bluesky} target="_blank" rel="noopener"><FaIcon name="bluesky" size="lg" /> Bluesky</a>
				{:else}
					<p class="text-xs text-surface-700-300 px-3 pt-2 border-t border-surface-200-800 mt-1">Members only: whoever opens it signs in first. Not for social media.</p>
				{/if}
				{#if sheet}
					<button role="menuitem" type="button" class="{item} border-t border-surface-200-800 mt-1" onclick={() => void openShareSheet({ title, text: message, url: link })}><Icon name="share" size={18} /> {apple ? 'AirDrop and more' : 'More…'}</button>
				{/if}
			{:else}
				<button type="button" class="{item} font-semibold" onclick={() => (view = 'menu')}><Icon name="arrowLeft" size={18} /> Someone you know</button>
				<ul class="flex flex-col">
					{#each people as p (p.did)}
						<li>
							<button role="menuitem" type="button" class={item} disabled={!!sending} onclick={() => void sendToPerson(p)}>
								<span class="size-7 rounded-full overflow-hidden bg-surface-100-900 flex items-center justify-center shrink-0">
									{#if p.picture}<img src={p.picture} alt="" class="size-full object-cover" />{:else}<span class="text-xs font-bold">{p.name.slice(0, 1)}</span>{/if}
								</span>
								<span class="truncate">{sending === p.did ? 'Sending…' : p.name}</span>
							</button>
						</li>
					{/each}
				</ul>
				{#if said}<p class="text-sm px-3 py-2" aria-live="polite">{said}</p>{/if}
			{/if}
		</div>
	{/if}
</div>
