<script lang="ts">
	/*
	 * Register with Incubator (ADR-Q-021 addendum, 6 October 2026), on the host's
	 * own console, in role as caretaker. The federation's card is signed by its
	 * key and its founder (you), sent to Incubator, checked against your live
	 * site's own founding, and countersigned. Registering is being receipted;
	 * being listed is the choice below. Updating is registering again: the new
	 * card names the one before it, so the history stays whole.
	 *
	 * Trust travels down (ADR-Q-019 addendum): Incubator also fingerprints the
	 * core your site serves. A straight copy matches a release; a branch names
	 * its repository, branch and commit, so anyone can follow what's different.
	 *
	 * A club on a host (`host` given) registers through it: its site and core
	 * are the host's, and the host's caretaker puts it forward first, from a
	 * link the club's founder sends. The host sees the clubs it has put forward.
	 */
	import { QrCode } from '@skeletonlabs/skeleton-svelte';
	import { Icon, Status } from '@inqbeta/q-ui';
	import { signerFor, type Identity } from '@inqbeta/q-core/passkey';
	import { openFederationKey } from '@inqbeta/q-core/membership';
	import { hashCard, makeCard, VISIBILITY, type Visibility } from '@inqbeta/q-core/registration';
	import { incubatorOrigin, putForwardLink, readClubs, readRegistration, type Entry } from '$lib/registry';
	import type { ClubOnHostReceipt } from '@inqbeta/q-core/registration';
	import ShareLink from './ShareLink.svelte';
	import type { FederationRecord } from '$lib/federations';
	import { CORE_SERVED_PATH, readCoreServed, sourceProblem, type CoreServed } from '@inqbeta/q-core/core-served';
	import pkg from '../../../package.json';

	let { identity, record, logo, host = null }: { identity: Identity; record: FederationRecord; logo?: string; host?: { federation: string; name: string } | null } = $props();
	let clubs = $state<ClubOnHostReceipt[]>([]);
	$effect(() => {
		if (!host) void readClubs(record.founding.federation).then((c) => (clubs = c));
	});
	const askLink = $derived(host && typeof location !== 'undefined' ? putForwardLink(location.origin, host.federation, record.founding.federation, record.founding.name) : '');

	const federation = $derived(record.founding.federation);
	let current = $state<Entry | null>(null);
	let loaded = $state(false);
	let visibility = $state<Visibility>('public');
	let site = $state('');
	let branch = $state(false);
	let repo = $state('');
	let branchName = $state('');
	let commit = $state('');
	let served = $state<CoreServed | null>(null);
	$effect(() => {
		void fetch(CORE_SERVED_PATH)
			.then((r) => (r.ok ? r.json() : null))
			.then((j) => {
				served = readCoreServed(j);
				if (served && !commit) commit = served.commit;
			})
			.catch(() => {});
	});
	const source = $derived(branch && !host ? { repo: repo.trim(), branch: branchName.trim(), commit: commit.trim() } : null);
	const sourceSays = $derived(source ? sourceProblem(source) : null);
	$effect(() => {
		if (host && typeof location !== 'undefined') site = location.origin;
	});
	$effect(() => {
		void readRegistration(federation).then((r) => {
			current = r.latest;
			loaded = true;
			if (r.latest) {
				visibility = r.latest.card.visibility;
				site = r.latest.card.site;
				if (r.latest.card.source) {
					branch = true;
					repo = r.latest.card.source.repo;
					branchName = r.latest.card.source.branch;
				}
			}
		});
	});
	const page = $derived(`${incubatorOrigin()}/registered/${encodeURIComponent(federation)}`);

	let busy = $state(false);
	let said = $state<{ good: boolean; text: string } | null>(null);
	async function send() {
		busy = true;
		said = null;
		try {
			const key = await openFederationKey(record.sealedKey, identity);
			const card = await makeCard(signerFor(key), signerFor(identity), {
				name: record.founding.name,
				purpose: record.manifest.constitution.purpose,
				site,
				...(logo ? { logo } : {}),
				visibility,
				runs: { q: served?.release ?? pkg.version, ...(served?.commit ? { commit: served.commit } : {}) },
				...(source ? { source } : {}),
				...(host ? { host: host.federation } : {}),
				previous: current ? await hashCard(current.card) : null
			});
			const r = await fetch(`${incubatorOrigin()}/api/registry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ card }) });
			const out = (await r.json().catch(() => ({}))) as { ok?: boolean; says?: string };
			if (!r.ok || !out.ok) said = { good: false, text: out.says ?? `Incubator said ${r.status}.` };
			else {
				said = { good: true, text: current ? 'Updated. Incubator has the new version, and keeps the old.' : 'Registered. Your federation has its receipt with Incubator.' };
				const again = await readRegistration(federation);
				current = again.latest;
			}
		} catch (e) {
			said = { good: false, text: e instanceof Error ? e.message : String(e) };
		}
		busy = false;
	}
</script>

<section class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 flex flex-col gap-4 max-w-2xl" aria-labelledby="register-title">
	<div class="flex items-center gap-3">
		<h3 id="register-title" class="h5 flex-1">Registered with Incubator</h3>
		{#if loaded}<Status tone={current?.holds ? 'good' : 'needs-you'}>{current?.holds ? 'Registered' : 'Not yet'}</Status>{/if}
	</div>
	<p class="text-sm">Registering gives your federation its receipt with Incubator: checked, with the version of Q it runs. Whether you’re listed is your choice, and you can change it any time.</p>

	<fieldset class="flex flex-col gap-2">
		<legend class="label-text">Who can find you</legend>
		<div class="flex flex-col gap-2" role="radiogroup" aria-label="Who can find you">
			{#each VISIBILITY as v (v.id)}
				<button type="button" role="radio" aria-checked={visibility === v.id} class="btn min-h-11 justify-start text-left {visibility === v.id ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => (visibility = v.id)}>
					<span class="flex flex-col"><span class="font-bold">{v.called}</span><span class="text-sm opacity-80">{v.means}</span></span>
				</button>
			{/each}
		</div>
	</fieldset>
	{#if host}
		<div class="flex flex-col gap-3 text-sm">
			<p>Your club registers through its host, <span class="font-bold">{host.name}</span>, on its site ({site}). First its caretaker puts you forward, once. Send them this link:</p>
			{#if askLink}<ShareLink link={askLink} label="Ask {host.name} to put you forward" note="It opens your host’s page for its caretaker, with one button to sign." subject="Please put {record.founding.name} forward" message="Could you put {record.founding.name} forward with Incubator, so it can register? It’s one signature:" />{/if}
			<p>When they have, register here.</p>
		</div>
	{:else}
	<label class="label">
		<span class="label-text">Your live site’s address</span>
		<input class="input" type="url" inputmode="url" bind:value={site} />
		<span class="text-sm opacity-70">Incubator checks that this site serves your federation.</span>
	</label>
	<fieldset class="flex flex-col gap-2">
		<legend class="label-text">The Q your site runs</legend>
		<div class="flex flex-col gap-2" role="radiogroup" aria-label="The Q your site runs">
			<button type="button" role="radio" aria-checked={!branch} class="btn min-h-11 justify-start text-left {!branch ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => (branch = false)}>
				<span class="flex flex-col"><span class="font-bold">Straight from Incubator</span><span class="text-sm opacity-80">Installed from Incubator’s repository, core untouched. Incubator checks it matches a release.</span></span>
			</button>
			<button type="button" role="radio" aria-checked={branch} class="btn min-h-11 justify-start text-left {branch ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => (branch = true)}>
				<span class="flex flex-col"><span class="font-bold">My own branch</span><span class="text-sm opacity-80">You’ve changed Q. Say where your source is, so anyone can follow what’s different.</span></span>
			</button>
		</div>
	</fieldset>
	{#if branch}
		<div class="flex flex-col gap-3">
			<label class="label">
				<span class="label-text">Your repository’s address</span>
				<input class="input" type="url" inputmode="url" autocomplete="off" bind:value={repo} />
			</label>
			<label class="label">
				<span class="label-text">Branch</span>
				<input class="input" type="text" autocomplete="off" spellcheck="false" bind:value={branchName} />
			</label>
			<label class="label">
				<span class="label-text">Commit</span>
				<input class="input font-mono" type="text" autocomplete="off" spellcheck="false" bind:value={commit} />
				<span class="text-sm opacity-70">{served?.commit ? 'Filled in from your site’s build. Change it only if you know it’s different.' : 'The long code Git gives the commit your site was built from.'}</span>
			</label>
			{#if sourceSays && (repo || branchName)}<p class="text-sm preset-tonal-warning card p-3">{sourceSays}</p>{/if}
		</div>
	{/if}
	{/if}
	<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={busy || !/^https:\/\//.test(site.trim()) || !!sourceSays} onclick={() => void send()}>{busy ? 'Signing… touch your passkey' : current ? 'Sign and update' : 'Sign and register'}</button>
	{#if said}<p class="card p-3 text-sm {said.good ? 'preset-tonal-success' : 'preset-tonal-error'}" aria-live="polite">{said.text}</p>{/if}

	{#if current}
		<div class="flex flex-wrap items-center gap-4 border-t border-surface-200-800 pt-4">
			<QrCode value={page} class="size-28">
				<QrCode.Frame class="size-full" aria-hidden="true"><QrCode.Pattern /></QrCode.Frame>
			</QrCode>
			<div class="flex flex-col gap-2 text-sm flex-1 min-w-48">
				<p>Your receipt page. Put its code on your site, like a coin’s: anyone can scan it and check you.</p>
				<a class="anchor break-all" href={page} rel="noopener">{page} <Icon name="arrowRight" size={14} /></a>
			</div>
		</div>
	{/if}

	{#if !host && clubs.length}
		<div class="flex flex-col gap-2 border-t border-surface-200-800 pt-4">
			<p class="label-text">Clubs you’ve put forward</p>
			<ul class="flex flex-col gap-1 text-sm">
				{#each clubs as c (c.contentHash)}
					<li class="flex flex-wrap gap-2 items-center">
						<span class="font-bold">{c.content.putForward.name}</span>
						<a class="anchor" href={`${incubatorOrigin()}/registered/${encodeURIComponent(c.content.club)}`} rel="noopener">Its receipt</a>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>
