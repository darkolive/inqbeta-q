<script lang="ts">
	/*
	 * "Open your vault from a backup" — straight after the passkey.
	 *
	 * Darren, 2026-09-25: "Pass key first, because then you've got a DID for
	 * whatever action follows… there has to be a source to hash from."
	 *
	 * So this only appears once you are signed in, and only when this browser
	 * holds nothing yet (a new browser, or one Safari has cleared). Drop the zip
	 * "Back up now" made — or choose it — and Q checks it belongs to this passkey
	 * and that every file is whole before any of it goes in (folder.ts,
	 * backup.ts). A browser cannot look in Downloads by itself; you hand it the
	 * file, and that is on purpose.
	 */
	import { isEmpty, restoreVault, watchFolder } from '@inqbeta/q-core/folder';
	import { watch } from '@inqbeta/q-core/passkey';

	let signedIn = $state(false);
	let ready = $state(false);
	let empty = $state(false);
	let over = $state(false);
	let working = $state(false);
	let says = $state('');
	let good = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	$effect(() => watch((id) => (signedIn = !!id)));
	$effect(() =>
		watchFolder((s) => {
			ready = s.kind === 'ready';
			if (ready) void isEmpty().then((e) => (empty = e)).catch(() => (empty = false));
		})
	);

	async function open(files: FileList | null | undefined) {
		if (!files?.length) return;
		working = true;
		says = '';
		good = false;
		const out = await restoreVault(files);
		working = false;
		if (!out.ok) {
			says = out.says;
			return;
		}
		const { added, already, damaged, missing, checked } = out.opened;
		if (added === 0 && already === 0) {
			says = 'Nothing in that file belongs to a vault. Choose the zip that Back up now made.';
			return;
		}
		good = damaged === 0 && missing === 0;
		says =
			`Opened ${added + already} ${added + already === 1 ? 'file' : 'files'} from your backup.` +
			(checked ? ` ${checked}` : '') +
			(good ? '' : ' Damaged files were left out; an older backup may still hold good copies.');
		empty = await isEmpty().catch(() => false);
	}

	function drop(e: DragEvent) {
		e.preventDefault();
		over = false;
		void open(e.dataTransfer?.files);
	}
</script>

{#if signedIn && ready && (empty || says)}
	<div
		class="card p-6 text-center stack-tight border-2 border-dashed {over ? 'border-primary-500 preset-tonal-primary' : 'border-surface-300-700'}"
		role="region"
		aria-label="Open your vault from a backup"
		ondragover={(e) => {
			e.preventDefault();
			over = true;
		}}
		ondragleave={() => (over = false)}
		ondrop={drop}
	>
		{#if empty}
			<h2 class="h4">This browser has nothing for you yet</h2>
			<p class="text-sm opacity-80">
				Drop your last backup here — the zip that <strong>Back up now</strong> made — and your vault opens where you left it.
				It is checked against your passkey and file by file before anything goes in.
			</p>
			<div>
				<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => input?.click()}>
					{working ? 'Checking…' : 'Choose your backup'}
				</button>
				<input bind:this={input} type="file" class="sr-only" accept=".zip,application/zip" onchange={(e) => void open((e.currentTarget as HTMLInputElement).files)} />
			</div>
		{/if}
		{#if says}
			<p class="text-sm {good ? '' : 'text-error-600-400'}" role="status" aria-live="polite">{says}</p>
		{/if}
	</div>
{/if}
