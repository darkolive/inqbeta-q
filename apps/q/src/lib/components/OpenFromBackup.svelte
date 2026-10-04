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
	 *
	 * 3 October 2026 (ADR-Q-028 §1, opening from the newest copy): your passkey
	 * may carry a sealed note of your own bucket, and say where the newest copy
	 * was. Then the first choice is the bucket — one press, nothing to find —
	 * and the note says which copy is newest. A host holding files for you
	 * passes them on in the first sync after.
	 */
	import { isEmpty, primaryHandle, restoreVault, watchFolder } from '@inqbeta/q-core/folder';
	import { watch, current } from '@inqbeta/q-core/passkey';
	import { watchPointer, type PointerRead } from '@inqbeta/q-core/pointer';
	import { bucketChannel, type BucketConfig } from '@inqbeta/q-core/s3';
	import { folderChannel, syncChannels } from '@inqbeta/q-core/storage-channels';
	import { bucketShown, keepBucket, openBucketNote } from '$lib/bucket';
	import { refreshLedger } from '$lib/ledger';
	import { syncCloudNow } from '$lib/autosync';

	let signedIn = $state(false);
	let ready = $state(false);
	let empty = $state(false);
	let over = $state(false);
	let working = $state(false);
	let says = $state('');
	let good = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	$effect(() => watch((id) => (signedIn = !!id)));

	/* The passkey's note: where the newest copy was, and (sealed) your own bucket. */
	let note = $state<PointerRead>({ pointer: null, carried: null });
	$effect(() => watchPointer((r) => (note = r)));
	let bucket = $state<BucketConfig | null>(null);
	$effect(() => {
		const sealed = note.pointer?.bucket;
		const me = current();
		if (!signedIn || !sealed || !me) return void (bucket = null);
		void openBucketNote(me, sealed).then((c) => (bucket = c));
	});
	async function openFromBucket() {
		const me = current();
		const main = primaryHandle();
		if (!me || !main || !bucket) return;
		working = true;
		says = '';
		try {
			const vault = folderChannel(main, { id: 'vault', called: 'this vault', kind: 'this-browser' });
			const r = await syncChannels(vault, bucketChannel(bucket, me.did), me.did);
			if (!(await bucketShown())) await keepBucket(bucket);
			await refreshLedger();
			good = !r.damaged.length && !r.failed.length;
			says = `Opened ${r.received} ${r.received === 1 ? 'file' : 'files'} from your bucket.` + (bucket.mode === 'pass' ? ' Your bucket is a pass-through, so it only held what hadn’t reached your cloud yet: connect your cloud too, in Backups.' : '') + (r.damaged.length ? ' Some files didn’t match their names and were left out.' : '');
			empty = await isEmpty().catch(() => false);
			void syncCloudNow();
		} catch (e) {
			good = false;
			says = e instanceof Error ? e.message : String(e);
		}
		working = false;
	}
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
			{#if note.pointer}
				<p class="text-sm">Your passkey says your newest vault was noted {new Date(note.pointer.at).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} on {note.pointer.from}{note.pointer.copies.length ? `, with copies in ${note.pointer.copies.join(', ')}` : ''}.</p>
			{/if}
			{#if bucket}
				<div>
					<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void openFromBucket()}>
						{working ? 'Opening…' : `Open from your bucket (${bucket.bucket})`}
					</button>
				</div>
				<p class="text-sm opacity-80">Or:</p>
			{/if}
			<p class="text-sm opacity-80">
				Drop your last backup here — the zip that <strong>Back up now</strong> made — and your vault opens where you left it.
				It is checked against your passkey and file by file before anything goes in.
			</p>
			<div>
				<button type="button" class="btn {bucket ? 'preset-tonal' : 'preset-filled-primary-500'}" disabled={working} onclick={() => input?.click()}>
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
