<script lang="ts">
	/*
	 * Your own bucket (ADR-Q-028 §2): any S3-compatible bucket, as a full copy
	 * you keep or a pass-through that holds things only until your cloud has
	 * them. Checked before it's kept: Q writes a small file, reads it back and
	 * lets it go. The address and key are locked into your vault.
	 */
	import { Status, Icon } from '@inqbeta/q-ui';
	import { current } from '@inqbeta/q-core/passkey';
	import { checkBucket, type BucketConfig } from '@inqbeta/q-core/s3';
	import { bucketShown, forgetBucket, keepBucket } from '$lib/bucket';
	import { syncCloudNow, type CloudState } from '$lib/autosync';
	import { copyText } from '$lib/share';

	let { sync }: { sync?: CloudState } = $props();

	let shown = $state<Awaited<ReturnType<typeof bucketShown>>>(null);
	let loaded = $state(false);
	async function load() {
		shown = await bucketShown().catch(() => null);
		loaded = true;
	}
	$effect(() => void load());

	let editing = $state(false);
	let form = $state<BucketConfig>({ endpoint: '', region: '', bucket: '', accessKeyId: '', secretAccessKey: '', mode: 'copy' });
	let busy = $state(false);
	let says = $state<{ good: boolean; text: string } | null>(null);
	const origin = typeof location === 'undefined' ? 'https://inqbeta.com' : location.origin;
	const cors = $derived(JSON.stringify([{ AllowedOrigins: [origin], AllowedMethods: ['GET', 'PUT', 'DELETE', 'HEAD'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3000 }], null, 2));
	let corsCopied = $state(false);

	async function save() {
		const me = current();
		if (!me) return;
		busy = true;
		says = null;
		const out = await checkBucket(form, me.did);
		if (!out.ok) {
			busy = false;
			says = { good: false, text: out.says };
			return;
		}
		try {
			await keepBucket(form);
			editing = false;
			form = { ...form, secretAccessKey: '' };
			await load();
			says = { good: true, text: 'Checked and kept. Q wrote a file, read it back and let it go. It’s in use from the next sync, starting now.' };
			void syncCloudNow();
		} catch (e) {
			says = { good: false, text: e instanceof Error ? e.message : String(e) };
		}
		busy = false;
	}
	async function forget() {
		busy = true;
		await forgetBucket();
		await load();
		busy = false;
		says = { good: true, text: 'Forgotten here. What’s in the bucket stays there, locked.' };
	}
	const modeWords = (m: BucketConfig['mode']) => (m === 'copy' ? 'A full copy you keep' : 'A pass-through: emptied once your cloud has everything');
</script>

<div class="mt-6 card preset-outlined-surface-200-800 p-4 flex flex-col gap-4">
	<div class="flex flex-wrap items-center gap-3">
		<Icon name="database" size={20} />
		<p class="font-bold flex-1">Your own bucket</p>
		{#if shown}<Status tone={sync?.error ? 'bad' : 'good'}>{sync?.error ? 'Needs attention' : 'On'}</Status>{/if}
	</div>

	{#if !loaded}
		<p class="text-sm opacity-70">Looking…</p>
	{:else if shown && !editing}
		<p class="text-sm">
			<strong>{shown.bucket}</strong> at {shown.endpoint} · {modeWords(shown.mode)} · key ending {shown.keyEnds}
		</p>
		{#if sync?.error}<p class="text-sm card preset-tonal-error p-3">{sync.error}</p>{/if}
		{#if sync?.passing}
			<p class="text-sm">
				{sync.passing.noCloud
					? `Holding everything (${sync.passing.holding} files): with no cloud connected, it has nowhere else to be, so nothing is let go.`
					: sync.passing.holding
						? `Holding ${sync.passing.holding} files until your cloud has them.`
						: 'Empty: your cloud has everything, so your bucket holds nothing of yours.'}
			</p>
		{:else if sync?.at}
			<p class="text-sm opacity-80">Last synced {new Date(sync.at).toLocaleTimeString()}{sync.holdsAll ? ' · holds everything' : ''}</p>
		{/if}
		<div class="flex flex-wrap gap-2">
			<button type="button" class="btn btn-sm preset-tonal min-h-11" onclick={() => ((editing = true), (form = { ...form, endpoint: shown!.endpoint, region: shown!.region, bucket: shown!.bucket, mode: shown!.mode }))}>Change</button>
			<button type="button" class="btn btn-sm preset-outlined-surface-500 min-h-11" disabled={busy} onclick={() => void forget()}>Forget my bucket</button>
		</div>
	{:else if !editing}
		<p class="text-sm">Complete sovereignty: your vault in a bucket you rent yourself (Amazon S3, Backblaze, Wasabi, Hetzner, Cloudflare R2, MinIO at home), written straight from this browser. Q and your host never see it.</p>
		<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" onclick={() => (editing = true)}>Use my own bucket</button>
	{/if}

	{#if editing}
		<div class="flex flex-col gap-4 max-w-xl">
			<fieldset class="flex flex-col gap-2">
				<legend class="label-text mb-1">What it’s for</legend>
				{#each [{ m: 'copy', t: 'A full copy you keep', d: 'Everything stays. You can open your vault from it on any device.' }, { m: 'pass', t: 'A pass-through', d: 'Holds what’s new until your cloud has it, then lets it go: your bucket’s provider ends up with nothing of yours.' }] as o (o.m)}
					<button type="button" role="radio" aria-checked={form.mode === o.m} class="card p-3 text-left min-h-11 {form.mode === o.m ? 'preset-filled-primary-500' : 'preset-tonal-surface hover:preset-tonal-primary'}" onclick={() => (form.mode = o.m as BucketConfig['mode'])}>
						<span class="block font-bold">{o.t}</span><span class="block text-sm opacity-80">{o.d}</span>
					</button>
				{/each}
			</fieldset>
			<label class="label"><span class="label-text">The bucket’s address (endpoint)</span><input class="input" type="url" bind:value={form.endpoint} autocomplete="off" /></label>
			<label class="label"><span class="label-text">Region (for Cloudflare R2, “auto”)</span><input class="input max-w-60" bind:value={form.region} autocomplete="off" /></label>
			<label class="label"><span class="label-text">The bucket’s name</span><input class="input" bind:value={form.bucket} autocomplete="off" /></label>
			<label class="label"><span class="label-text">Access key ID</span><input class="input" bind:value={form.accessKeyId} autocomplete="off" /></label>
			<label class="label"><span class="label-text">Secret access key</span><input class="input" type="password" bind:value={form.secretAccessKey} autocomplete="new-password" /></label>
			<p class="text-sm opacity-80">Make a key that can only read and write this one bucket. Both parts are locked into your vault, and go nowhere but the bucket.</p>
			<details class="text-sm">
				<summary class="cursor-pointer font-semibold min-h-11 flex items-center">Your bucket needs to allow this address (CORS)</summary>
				<p class="mt-2">In your bucket’s settings, under CORS, paste this. It lets this page, and nothing else, write to it.</p>
				<pre class="pre text-xs mt-2 whitespace-pre-wrap break-all">{cors}</pre>
				<button type="button" class="btn btn-sm preset-tonal min-h-11 mt-2" onclick={async () => { corsCopied = await copyText(cors); setTimeout(() => (corsCopied = false), 2500); }}>{corsCopied ? 'Copied' : 'Copy the CORS rules'}</button>
			</details>
			<div class="flex flex-wrap gap-2">
				<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy || !form.endpoint || !form.bucket || !form.accessKeyId || !form.secretAccessKey} onclick={() => void save()}>{busy ? 'Checking…' : 'Check it and keep it'}</button>
				<button type="button" class="btn preset-tonal min-h-11" onclick={() => ((editing = false), (says = null))}>Not now</button>
			</div>
		</div>
	{/if}
	{#if says}<p class="text-sm card p-3 {says.good ? 'preset-tonal-success' : 'preset-tonal-warning'}" aria-live="polite">{says.text}</p>{/if}
</div>
