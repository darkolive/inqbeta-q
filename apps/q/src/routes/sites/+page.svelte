<script lang="ts">
	/*
	 * Sites — websites you own, each one a key (ADR-Q-003).
	 *
	 * Founding a site makes it a key of its own, signed into being by you and
	 * by itself, and kept sealed in your vault. That key is the site: whoever
	 * holds it can publish as it, and handing it on is how a site is sold.
	 */
	import { Page, Section, Item, Status, Empty, Text } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchFolder, type FolderState } from '@inqbeta/q-core/folder';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { newestPerKey } from '$lib/features/dostudy';
	import { addSite, dnsRecord, setAside, siteFrom, standing, type SiteRecord } from '$lib/sites';
	import { hostedAddress } from '@inqbeta/q-core/sites';
	import { keepVercelToken } from '$lib/releases';

	let identity = $state<Identity | null>(null);
	let folder = $state<FolderState>({ kind: 'checking' });
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchFolder((s) => (folder = s)));
	$effect(() => watchLedger((l) => (ledger = l)));

	/* Newest release and kept carrier per site, from the vault. */
	const releases = $derived(new Map((ledger ? newestPerKey(ledger.found) : []).filter((f) => f.kind === 'site-release').map((f) => [f.key, f])));
	const carriers = $derived(new Set((ledger?.found ?? []).filter((f) => f.kind === 'site-carrier').map((f) => f.key)));
	let tokens = $state<Record<string, string>>({});
	let tokenSays = $state<Record<string, string>>({});
	async function keepToken(record: SiteRecord) {
		if (!identity) return;
		try {
			await keepVercelToken(identity, record, tokens[record.founding.site] ?? '');
			tokens[record.founding.site] = '';
			tokenSays[record.founding.site] = 'Kept, sealed to your passkey. Publishing in Write now uses it.';
			await refreshLedger();
		} catch (e) {
			tokenSays[record.founding.site] = e instanceof Error ? e.message : String(e);
		}
	}


	type Row = { record: SiteRecord; checks: Awaited<ReturnType<typeof standing>> | null };
	let sites = $state<Row[]>([]);
	let asideCount = $state(0);

	async function putAside(record: SiteRecord) {
		if (!confirm(`Set ${record.founding.name} (${record.founding.domain}) aside? It stops being listed. Its record and key stay in your vault.`)) return;
		await setAside(record, 'Set aside from Sites');
		await refreshLedger();
	}

	$effect(() => {
		const all = ledger ? newestPerKey(ledger.found) : [];
		const aside = new Set(all.filter((f) => f.kind === 'site-set-aside').map((f) => f.key));
		asideCount = aside.size;
		const found = all.filter((f) => f.kind === 'site' && !aside.has(f.key));
		const id = identity;
		void (async () => {
			const records = (await Promise.all(found.map((f) => siteFrom(f.item)))).filter((r): r is SiteRecord => !!r);
			sites = records.map((record) => ({ record, checks: null }));
			const checked = await Promise.all(records.map(async (record) => ({ record, checks: await standing(record, id) })));
			sites = checked;
		})();
	});

	let name = $state('');
	let domain = $state('');
	let working = $state(false);
	let says = $state<{ tone: 'good' | 'bad'; text: string } | null>(null);

	async function found() {
		if (!identity) return;
		working = true;
		says = null;
		const out = await addSite(identity, { name, domain });
		working = false;
		if (!out.ok) {
			says = { tone: 'bad', text: out.says };
			return;
		}
		says = {
			tone: 'good',
			text: `${out.record.founding.name} is founded. Its key is sealed in your vault — back it up like anything you own.`
		};
		name = '';
		domain = '';
		await refreshLedger();
	}

	const tone = (ok: boolean | undefined) => (ok === undefined ? 'waiting' : ok ? 'good' : 'bad');
</script>

<svelte:head><title>Sites — Q</title></svelte:head>

<Page title="Sites" lead="Websites you own. Each one is a key of its own, founded by you, kept in your vault — and yours to hand on.">
	{#if !identity}
		<SignIn />
	{:else if folder.kind !== 'ready'}
		<Empty icon="files" title="No folder yet" description="A site's key is kept in your folder. Set it up under Copy locations." />
	{:else}
		<Section title="Your sites">
			{#if !sites.length}
				<Empty icon="network" title="None yet" description="Found a site below, and it appears here." />
			{:else}
				<div class="space-y-3">
					{#each sites as { record, checks } (record.founding.site)}
						{@const dns = dnsRecord(record)}
						<Item title={record.founding.name} meta={record.founding.domain} description={`Founded ${record.founding.at.slice(0, 10)} · generation ${record.founding.generation}`}>
							{#snippet status()}
								<Status tone={tone(checks ? checks.founding.ok && checks.key.ok && checks.grant.ok : undefined)}>
									{checks ? (checks.founding.ok && checks.key.ok && checks.grant.ok ? 'Holds up' : 'Needs a look') : 'Checking…'}
								</Status>
							{/snippet}
							<div class="field-list mt-2">
								<div class="field-row"><span class="field-label">Site key</span><span class="field-value"><Text role="token">{record.founding.site}</Text></span></div>
								<div class="field-row"><span class="field-label">Founded by</span><span class="field-value"><Text role="token">{record.founding.root}</Text></span></div>
							</div>
							{#if checks}
								<ul class="mt-2 space-y-1 text-sm">
									<li><Status tone={tone(checks.founding.ok)}>{checks.founding.ok ? 'Founding' : 'Founding'}</Status> {checks.founding.says}</li>
									<li><Status tone={tone(checks.key.ok)}>Key</Status> {checks.key.says}</li>
									<li><Status tone={tone(checks.grant.ok)}>Authority</Status> {checks.grant.says}</li>
								</ul>
							{/if}
							{@const last = releases.get(record.founding.site)}
							<div class="mt-3 rounded-container border border-surface-200-800 p-3 text-sm">
								<p class="font-medium">Where it is served</p>
								<p class="mt-1">
									<Status tone="good">Vercel</Status>
									{carriers.has(`${record.founding.site}/vercel`)
										? 'With a token kept sealed in your vault.'
										: "With this computer's own Vercel sign-in (npx vercel login)."}
								</p>
								<p class="mt-1 opacity-70">
									{last ? `Last released ${last.at.slice(0, 16).replace('T', ' ')} — ${last.description}, signed with the site's key.` : 'Not yet released with the site’s key. Publish in Write does it.'}
								</p>
								<details class="mt-2">
									<summary class="cursor-pointer">Keep a Vercel token in your vault instead</summary>
									<p class="mt-2">Make one at vercel.com → Account settings → Tokens, scoped to the team the site is in. It is sealed to your passkey, so only you can open it — and it goes with the site if you hand the site on.</p>
									<div class="mt-2 flex flex-wrap gap-2">
										<input class="input input-sm min-w-64 flex-1" type="password" autocomplete="off" aria-label="Vercel token" bind:value={tokens[record.founding.site]} />
										<button class="btn btn-sm preset-filled-primary-500" disabled={!tokens[record.founding.site]} onclick={() => void keepToken(record)}>Seal and keep it</button>
									</div>
									{#if tokenSays[record.founding.site]}<p class="mt-1">{tokenSays[record.founding.site]}</p>{/if}
								</details>
							</div>
							<button class="btn btn-sm preset-tonal mt-3" onclick={() => void putAside(record)}>Set aside</button>
							<details class="mt-3">
								<summary class="cursor-pointer text-sm">The DNS record, for when the domain points here</summary>
								<p class="mt-2 text-sm">
									Add this at your domain registrar. It is how anyone can see that the domain and the key belong
									together — only whoever controls the domain can set it.
								</p>
								<div class="field-list mt-2">
									<div class="field-row"><span class="field-label">Type</span><span class="field-value">{dns.type}</span></div>
									<div class="field-row"><span class="field-label">Name</span><span class="field-value"><Text role="token">{dns.name}</Text></span></div>
									<div class="field-row"><span class="field-label">Value</span><span class="field-value"><Text role="token">{dns.value}</Text></span></div>
								</div>
							</details>
						</Item>
					{/each}
				</div>
			{/if}
		</Section>

		{#if asideCount}<p class="hint">{asideCount} set aside — kept in your vault, not listed.</p>{/if}

		<Section title="Found a site" description="You sign it into being, and so does its new key. Nothing is sent anywhere.">
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="label"><span class="label-text">What it is called</span><input class="input" bind:value={name} /></label>
				<label class="label"><span class="label-text">Its domain</span><input class="input" bind:value={domain} /></label>
			</div>
			<p class="hint mt-1">Its own name — darkolive.co.uk — even if that does not point at the new site yet. Not a link your host gave you.</p>
			{#if hostedAddress(domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))}
				<p class="mt-1 text-sm text-error-600-400">That is an address your host handed out, and it changes. Use the site's own domain.</p>
			{/if}
			<div class="card preset-tonal-warning mt-3 p-3 text-sm">
				The site's key is an asset, like the deeds to a house. It is not part of your passkey — which is
				what lets you sell or hand the site on — so it lives only in your vault. Keep that backed up.
			</div>
			<button class="btn preset-filled-primary-500 mt-3" disabled={working || !name.trim() || !domain.trim()} onclick={() => void found()}>
				{working ? 'Founding…' : 'Found this site'}
			</button>
			{#if says}
				<div class="mt-3"><Status tone={says.tone}>{says.tone === 'good' ? 'Founded' : 'Not founded'}</Status> <span class="text-sm">{says.text}</span></div>
			{/if}
		</Section>
	{/if}
</Page>
