<script lang="ts">
	/*
	 * Signing a whole website: the one touch that publishes it.
	 *
	 * The site's own script (apps/darkolive/scripts/site-map.mjs) hashes every
	 * file a build made and writes site-map.json. Here it is read, shown, and
	 * signed with the passkey. The receipt is kept in the vault under "sites"
	 * and handed back as site.receipt.json, which the script checks against the
	 * build before attaching it at /.well-known/inqbeta-site.json.
	 */
	import { Section, Status, Text } from '@inqbeta/q-ui';
	import { siteContent, siteId, signSite, type SiteContent } from '@inqbeta/q-core/site';
	import { download, saveLocked } from '@inqbeta/q-core/folder';
	import type { Identity } from '@inqbeta/q-core/passkey';

	let { identity }: { identity: Identity } = $props();

	let content = $state<SiteContent | null>(null);
	let says = $state('');
	let signed = $state<{ id: string; at: string } | null>(null);
	let working = $state(false);

	async function choose(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const f = el.files?.[0];
		el.value = '';
		signed = null;
		says = '';
		content = null;
		if (!f) return;
		try {
			content = siteContent(JSON.parse(await f.text()));
		} catch (err) {
			says = err instanceof Error ? err.message : String(err);
		}
	}

	async function sign() {
		if (!content) return;
		working = true;
		try {
			const receipt = await signSite(identity, content);
			const text = JSON.stringify(receipt, null, '\t');
			const id = await siteId(content);
			await saveLocked('sites', `${content.domain}-${id.slice(0, 12)}.json`, text, 'application/json');
			download('site.receipt.json', text, 'application/json');
			signed = { id, at: receipt.signedAt };
		} catch (err) {
			says = err instanceof Error ? err.message : String(err);
		} finally {
			working = false;
		}
	}
</script>

<Section title="Sign a site" description="Publishing a whole website is one touch: every file a build made, named by its hash, signed once.">
	<label class="btn btn-sm preset-outlined-surface-500 cursor-pointer">
		<input type="file" class="sr-only" accept=".json,application/json" onchange={(e) => void choose(e)} />
		Choose site-map.json
	</label>
	{#if says}<p class="mt-2 text-sm" role="alert">{says}</p>{/if}
	{#if content}
		<div class="field-list mt-3">
			<div class="field-row"><span class="field-label">Domain</span><span class="field-value">{content.domain}</span></div>
			<div class="field-row"><span class="field-label">Files</span><span class="field-value">{Object.keys(content.files).length}</span></div>
			<div class="field-row"><span class="field-label">Block pages</span><span class="field-value">{Object.keys(content.pages).length}</span></div>
		</div>
		<button class="btn preset-filled-primary-500 mt-3" disabled={working} onclick={() => void sign()}>
			{working ? 'Signing…' : `Sign ${content.domain}`}
		</button>
	{/if}
	{#if signed}
		<div class="mt-3">
			<Status tone="good">Signed</Status>
			<p class="mt-2 text-sm">Saved as site.receipt.json, and kept in your vault under “sites”.</p>
			<p class="mt-1 text-sm">This release: <Text role="token">{signed.id}</Text></p>
			<p class="hint mt-1">Then: <code>node scripts/site-map.mjs attach site.receipt.json</code>, and deploy.</p>
		</div>
	{/if}
</Section>
