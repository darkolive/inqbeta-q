<script lang="ts">
	/*
	 * Approve a site's or device's link request — at the root.
	 *
	 * The request arrives as a line of text or a small file (a site shows it, or
	 * saves it). Q checks the key signed it, shows who is asking, and on Approve
	 * answers it with a UCAN powerline delegation, keeps both tokens in your
	 * folder, and hands them back — one line of text — to be given to the site.
	 * Older JSON requests (KeyLink) are still approved the old way.
	 * Nothing is looked up anywhere.
	 */
	import {
		approveLink,
		approveLinkUcan,
		checkLink,
		linkId,
		readLinkParcel,
		requestIn,
		type Link
	} from '@inqbeta/q-core/links';
	import { current, signerFor } from '@inqbeta/q-core/passkey';
	import { download, openWithPicker, saveLocked, folderState } from '@inqbeta/q-core/folder';
	import { folderStore, writeContainer, type Invocation } from '@inqbeta/q-core/ucan/index';
	import { Item, Status } from '@inqbeta/q-ui';
	import { refreshLedger } from '$lib/ledger';

	interface Asking {
		label: string;
		key: string;
		origin?: string;
		at: string;
		says: string;
		ucan?: Invocation;
		json?: Link;
	}

	let text = $state('');
	let request = $state<Asking | null>(null);
	let done = $state<{ label: string; text: string; name: string; type: string } | null>(null);
	let says = $state('');
	let working = $state(false);

	async function read(raw: string) {
		request = null;
		done = null;
		says = '';
		let parcel;
		try {
			parcel = await readLinkParcel(raw);
		} catch (e) {
			says = e instanceof Error ? e.message : String(e);
			return;
		}
		if (parcel.kind === 'json') {
			const c = await checkLink(parcel.link);
			if (!c.ok) return void (says = c.says);
			if (c.complete) return void (says = 'That link is already complete.');
			const l = parcel.link;
			request = { label: l.label, key: l.key, origin: l.origin, at: l.at, says: c.says, json: l };
			return;
		}
		const asked = requestIn(parcel.tokens);
		if (!asked) return void (says = 'There is no link request in that text.');
		if (parcel.tokens.some((t) => t.kind === 'delegation')) return void (says = 'That link is already complete.');
		const iat = asked.payload.iat;
		request = {
			label: asked.args.label,
			key: asked.payload.iss,
			origin: asked.args.origin,
			at: iat ? new Date(iat * 1000).toISOString() : new Date().toISOString(),
			says: 'Signed by the key that is asking.',
			ucan: asked
		};
	}

	async function fromFile() {
		const [p] = await openWithPicker({ from: 'downloads' }).catch(() => []);
		if (p) await read(new TextDecoder().decode(p.data));
	}

	async function approve() {
		const id = current();
		if (!id || !request) return;
		working = true;
		try {
			const root = signerFor(id);
			if (request.ucan) {
				const approval = await approveLinkUcan(root, request.ucan);
				if (folderState().kind === 'ready') {
					await folderStore.put(request.ucan);
					await folderStore.put(approval);
				}
				const out = (await writeContainer([request.ucan, approval])) as string;
				done = { label: request.label, text: out, name: `link-${approval.cid.toString().slice(-12)}.ucan.txt`, type: 'text/plain' };
			} else if (request.json) {
				const link = await approveLink(root, request.json);
				const json = JSON.stringify(link, null, '\t');
				const name = `link-${await linkId(link)}.json`;
				if (folderState().kind === 'ready') await saveLocked('links', name, json, 'application/json');
				done = { label: link.label, text: json, name, type: 'application/json' };
			}
			request = null;
			text = '';
			void refreshLedger();
		} catch (e) {
			says = e instanceof Error ? e.message : String(e);
		} finally {
			working = false;
		}
	}

	async function copy() {
		if (!done) return;
		try {
			await navigator.clipboard.writeText(done.text);
			says = 'Copied. Paste it into the site that asked.';
		} catch {
			says = 'Could not copy — use Download instead.';
		}
	}
</script>

<div class="stack-tight">
	<label class="label">
		<span class="label-text">Paste a link request</span>
		<textarea class="textarea role-token" rows="3" bind:value={text}></textarea>
	</label>
	<div class="actions">
		<button type="button" class="btn btn-sm preset-outlined-surface-500" disabled={!text.trim()} onclick={() => void read(text)}>Check it</button>
		<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={() => void fromFile()}>Open a request file…</button>
	</div>

	{#if request}
		<Item icon="network" title={request.label} subtitle={request.origin} meta={`Asked ${new Date(request.at).toLocaleString('en-GB')}`}>
			{#snippet status()}<Status tone="needs-you">Asking to be linked</Status>{/snippet}
			<p class="role-token" data-role="token">{request.key}</p>
			<p class="role-meta" data-role="meta">{request.says} Approving means this key can sign as you from now on, until you unlink it.</p>
			{#snippet actions()}
				<button type="button" class="btn btn-sm preset-filled-primary-500" disabled={working} onclick={() => void approve()}>Approve</button>
				<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={() => (request = null)}>Not now</button>
			{/snippet}
		</Item>
	{/if}

	{#if done}
		<Item icon="verified" title={`${done.label} is linked`} description="Give this back to the site that asked — paste it there, or open the file there.">
			{#snippet status()}<Status tone="good">Linked</Status>{/snippet}
			{#snippet actions()}
				<button type="button" class="btn btn-sm preset-filled-primary-500" onclick={() => void copy()}>Copy</button>
				<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={() => done && download(done.name, done.text, done.type)}>Download</button>
			{/snippet}
		</Item>
	{/if}

	{#if says}<p class="role-meta text-warning-700-300" aria-live="polite">{says}</p>{/if}
</div>
