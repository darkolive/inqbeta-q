<script lang="ts">
	/*
	 * Settings → Backups (ADR-Q-028 §6): when each copy of your vault happens.
	 * Four choices, each said in plain words, kept in this browser and in your
	 * vault. A download can't happen without you, so when one is due the vault
	 * icon in the top bar asks once; "Download now" is here for any time.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { CHOICES, type BackupChoices } from '@inqbeta/q-core/backup-schedule';
	import { backupNow, watchDownload } from '@inqbeta/q-core/folder';
	import { backups, choose } from '$lib/backups.svelte';

	const GROUPS: { key: keyof BackupChoices; title: string; says: string }[] = [
		{ key: 'cloud', title: 'Your cloud', says: 'Google Drive, Dropbox or OneDrive.' },
		{ key: 'bucket', title: 'Your own bucket', says: 'If you’ve set one up in Backups.' },
		{ key: 'relay', title: 'Your host’s pass-through', says: 'Only for what your cloud can’t take just now. Never a copy: let go as soon as your cloud has it.' },
		{ key: 'download', title: 'A download', says: 'One sealed file of your whole vault, saved where you choose: the copy nobody else holds.' }
	];

	let last = $state(0);
	$effect(() => watchDownload((at) => (last = at)));
	let busy = $state(false);
	let says = $state<{ good: boolean; text: string } | null>(null);
	async function downloadNow() {
		busy = true;
		says = null;
		const out = await backupNow();
		busy = false;
		says = out.ok ? { good: true, text: `Saved: ${out.name}, ${out.files} files, sealed. Keep it somewhere safe, like a USB stick.` } : out.cancelled ? null : { good: false, text: out.says };
	}
</script>

<div class="flex flex-col gap-6">
	{#each GROUPS as g (g.key)}
		<fieldset class="flex flex-col gap-2">
			<legend class="font-bold">{g.title}</legend>
			<p class="text-sm opacity-80">{g.says}</p>
			<div class="flex flex-col gap-2" role="radiogroup" aria-label={g.title}>
				{#each CHOICES[g.key] as c (c.id)}
					<button
						type="button"
						role="radio"
						aria-checked={backups.choices[g.key] === c.id}
						class="card p-3 text-left min-h-11 {backups.choices[g.key] === c.id ? 'preset-filled-primary-500' : 'preset-tonal-surface hover:preset-tonal-primary'}"
						onclick={() => choose(g.key, c.id as never)}
					>
						{c.words}
					</button>
				{/each}
			</div>
		</fieldset>
	{/each}

	<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-3">
		<p class="text-sm">{last ? `Your last download was on ${new Date(last).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'You haven’t made a download in this browser yet.'}</p>
		<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={busy} onclick={() => void downloadNow()}><Icon name="download" size={18} />{busy ? 'Making it…' : 'Download now'}</button>
		{#if says}<p class="text-sm card p-3 {says.good ? 'preset-tonal-success' : 'preset-tonal-warning'}" aria-live="polite">{says.text}</p>{/if}
	</div>
</div>
