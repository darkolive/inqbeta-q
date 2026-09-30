<script lang="ts">
	/*
	 * Backing up and restoring, where the vault lives in the browser.
	 *
	 * Revised 2026-09-23. Work is saved in the browser as it happens — fast, no
	 * permission, no folder. "Back up now" takes the whole vault out as one zip
	 * (share sheet on a phone, so it can go straight into iCloud Drive; a
	 * download on a computer). "Restore" takes that zip — or the folder it was
	 * unzipped into — and puts it back. Every file is named by its own contents,
	 * so restoring over the top is always safe and never duplicates anything.
	 */
	import { backupNow, restoreVault, unexported, watchBackup, watchFolder } from '@inqbeta/q-core/folder';

	let zipInput = $state<HTMLInputElement | null>(null);
	let folderInput = $state<HTMLInputElement | null>(null);
	let working = $state(false);
	let says = $state('');
	let waiting = $state(0);
	let at = $state(0);

	async function count() {
		waiting = await unexported().catch(() => 0);
	}

	$effect(() => {
		void count();
		return watchFolder(() => void count());
	});
	$effect(() => watchBackup((t) => (at = t)));

	const when = $derived(at ? new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null);

	async function restore(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const files = el.files;
		if (!files?.length) return;
		says = '';
		working = true;
		const out = await restoreVault(files);
		working = false;
		el.value = '';
		if (!out.ok) {
			says = out.says;
			return;
		}
		const { added, already, ignored, damaged, missing, checked } = out.opened;
		says =
			added === 0 && already === 0
				? 'Nothing in that belonged to a vault.'
				: `Restored ${added} ${added === 1 ? 'file' : 'files'}` +
					(already ? `, ${already} already here` : '') +
					(ignored ? `, ${ignored} left alone` : '') +
					'.';
		/* What checking the backup found — damaged files were left out, not restored. */
		if (damaged || missing) says += ` ${checked ?? ''} Damaged files were left out; another backup may hold good copies.`;
		else if (checked) says += ` ${checked}`;
		await count();
	}

	async function backup() {
		says = '';
		working = true;
		const out = await backupNow();
		working = false;
		if (!out.ok) {
			if (!out.cancelled) says = out.says;
			return;
		}
		says = `Checked and backed up ${out.files} ${out.files === 1 ? 'file' : 'files'} as “${out.name}”. Keep it in iCloud Drive or anywhere that is not a browser.`;
		await count();
	}
</script>

<div class="panel stack-tight">
	<div class="block-head">
		<h3 class="h4">Backup</h3>
		<p class="text-sm text-surface-900-100">
			Everything is saved in this browser as you work. <strong>Back up now</strong> takes a copy out
			as one file. {when ? `Last backup: ${when}.` : 'No backup yet.'}
			{#if waiting > 0}{waiting} {waiting === 1 ? 'file is' : 'files are'} new since.{/if}
		</p>
	</div>

	<div class="actions">
		<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void backup()}>
			{working ? 'Working…' : 'Back up now'}
		</button>

		<label class="btn preset-outlined-surface-500 cursor-pointer">
			<input bind:this={zipInput} type="file" class="sr-only" accept=".zip,application/zip" disabled={working} onchange={(e) => void restore(e)} />
			Restore from a backup
		</label>

		<label class="btn preset-outlined-surface-500 cursor-pointer">
			<!-- `webkitdirectory` reads a folder once; for a backup somebody unzipped. -->
			<input bind:this={folderInput} type="file" class="sr-only" multiple webkitdirectory disabled={working} onchange={(e) => void restore(e)} />
			Restore from a folder
		</label>
	</div>

	<p class="hint">
		A backup is an ordinary zip of locked files — any unzip tool opens it, and nobody without your
		passkey can read what is inside. Restoring over what is here is always safe.
	</p>

	{#if says}<p class="text-sm" aria-live="polite">{says}</p>{/if}
</div>
