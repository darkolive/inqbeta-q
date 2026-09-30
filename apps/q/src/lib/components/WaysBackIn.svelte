<script lang="ts">
	/*
	 * Ways back in — ADR-Q-005, step 3.
	 *
	 * If the passkey you signed in with is lost, these open your vault as the
	 * same you: the same DID, the same sealed site keys, the same everything.
	 * Weakest news first: with no second way, that is the first thing said.
	 */
	import { watch, type Identity, type KeyPlace } from '@inqbeta/q-core/passkey';
	import { watchFolder } from '@inqbeta/q-core/folder';
	import { waysStanding, type Envelope, type Wrap } from '@inqbeta/q-core/continuity';
	import { addPasskeyWay, currentEnvelope, prepareRecoveryCard, removeWayAt, type PendingCard } from '@inqbeta/q-core/ways-back-in';

	let identity = $state<Identity | null>(null);
	let ready = $state(false);
	let env = $state<Envelope | null>(null);
	let working = $state(false);
	let says = $state('');
	let good = $state(false);
	let pending = $state<PendingCard | null>(null);
	let lastGroup = $state('');
	let removing = $state<number | null>(null);
	let adding = $state<KeyPlace | null>(null);
	let label = $state('');

	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchFolder((s) => (ready = s.kind === 'ready')));
	$effect(() => {
		if (identity && ready) void load();
	});

	async function load() {
		if (identity) env = await currentEnvelope(identity).catch(() => null);
	}

	const ways = $derived(env?.wraps ?? []);
	const standing = $derived(waysStanding(env));

	function tell(ok: boolean, text: string) {
		good = ok;
		says = text;
	}

	function kindOf(w: Wrap): string {
		if (w.kind === 'recovery') return 'Recovery card';
		const what = w.carrier === 'security-key' ? 'Security key' : 'Passkey in a keychain';
		return w.rpId ? `${what} · ${w.rpId}` : what;
	}

	async function makeCard() {
		if (!identity) return;
		working = true;
		tell(true, 'Touch the passkey you signed in with…');
		const out = await prepareRecoveryCard(identity);
		working = false;
		if (!out.ok) return tell(false, out.cancelled ? '' : out.says);
		says = '';
		pending = out.pending;
		lastGroup = '';
	}

	async function confirmCard() {
		if (!pending) return;
		working = true;
		const out = await pending.confirm(lastGroup);
		working = false;
		if (!out.ok) return tell(false, out.says);
		env = out.envelope;
		pending = null;
		tell(true, 'Your recovery card is now a way back in. Keep it somewhere safe and offline — anyone holding it can sign as you. Back up now so your backups carry it.');
	}

	function printCard() {
		if (!pending) return;
		const w = window.open('', '_blank', 'width=640,height=520');
		if (!w) return tell(false, 'The print window was blocked. Write the card down by hand instead.');
		const groups = pending.card.split('-');
		w.document.write(`<!doctype html><title>Q recovery card</title>
<style>body{font:16px system-ui;margin:40px;color:#111}h1{font-size:20px}code{font:600 22px ui-monospace,Menlo,monospace;letter-spacing:.08em}
.g{display:grid;grid-template-columns:repeat(4,auto);gap:10px 18px;justify-content:start;margin:24px 0}p{max-width:34em}</style>
<h1>Q — recovery card</h1><p>This opens your vault as ${identity?.did.slice(0, 16)}…${identity?.did.slice(-8)} if every passkey is lost.
Anyone holding it can sign as you. Keep it offline, somewhere safe. Never photograph or email it.</p>
<div class="g">${groups.map((g) => `<code>${g}</code>`).join('')}</div>
<p>Made ${new Date().toLocaleDateString()}.</p>`);
		w.document.close();
		w.focus();
		w.print();
	}

	async function addKey() {
		if (!identity || !adding) return;
		const place = adding;
		const name = label.trim() || (place === 'security-key' ? 'Security key' : 'Passkey on another device');
		working = true;
		tell(true, 'First, touch the passkey you signed in with. Then make the new one.');
		const out = await addPasskeyWay(identity, `Q — ${name}`, place);
		working = false;
		if (!out.ok) return tell(false, out.cancelled ? '' : out.says);
		env = out.envelope;
		adding = null;
		label = '';
		tell(true, `${name} is now a way back in. Back up now so your backups carry it.`);
	}

	async function remove(i: number) {
		if (!identity) return;
		working = true;
		const out = await removeWayAt(identity, i);
		working = false;
		removing = null;
		if (!out.ok) return tell(false, out.says);
		env = out.envelope;
		tell(true, 'Removed. It no longer opens your vault. Back up now so older copies are replaced.');
	}
</script>

{#if identity && ready}
	<div class="stack-tight">
		{#if ways.length === 0}
			<div class="card preset-tonal-warning p-4" role="status">
				<p class="font-medium">Your passkey is your only way in.</p>
				<p class="text-sm mt-1">
					If it is lost, your vault and everything sealed to you — site keys included — cannot be opened, however many backups you have.
					Add a second way: a recovery card, a security key, or a passkey on another device.
				</p>
			</div>
		{:else}
			{#if standing.level === 'warn'}
				<div class="card preset-tonal-warning p-3" role="status">
					<p class="text-sm">{standing.says} {standing.fix.replace('Keys → Ways back in: ', '')}</p>
				</div>
			{/if}
			<ul class="stack-tight" aria-label="Ways back in">
				<li class="text-sm opacity-80">The passkey you signed in with — always.</li>
				{#each ways as w, i (w.salt)}
					<li class="card preset-outlined-surface-500 p-3 flex items-center justify-between gap-3">
						<div>
							<p class="font-medium">{w.label}</p>
							<p class="text-xs opacity-70">{kindOf(w)} · added {new Date(w.added).toLocaleDateString()}</p>
						</div>
						{#if removing === i}
							<span class="flex gap-2 items-center">
								<span class="text-xs">{ways.length === 1 ? 'This is the last one.' : 'It will stop opening your vault.'}</span>
								<button type="button" class="btn btn-sm preset-filled-error-500" disabled={working || ways.length === 1} onclick={() => void remove(i)}>Remove</button>
								<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={() => (removing = null)}>Keep</button>
							</span>
						{:else}
							<button type="button" class="btn btn-sm preset-outlined-surface-500" disabled={working} onclick={() => (removing = i)}>Remove…</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if pending}
			<div class="card preset-tonal-primary p-4 stack-tight" role="region" aria-label="Your recovery card">
				<p class="font-medium">Your recovery card — shown once</p>
				<p class="text-sm">Write it down or print it. Keep it offline. Anyone holding it can sign as you; nobody, including Q, can show it again.</p>
				<p class="font-mono text-lg tracking-wider break-words" style="word-spacing:.4em">{pending.card.split('-').join(' ')}</p>
				<div class="actions">
					<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={printCard}>Print</button>
				</div>
				<label class="label">
					<span class="text-sm">To prove you have it, type the <strong>last group</strong> from your card</span>
					<input class="input font-mono uppercase" maxlength="5" autocomplete="off" spellcheck="false" bind:value={lastGroup} />
				</label>
				<div class="actions">
					<button type="button" class="btn preset-filled-primary-500" disabled={working || lastGroup.trim().length < 5} onclick={() => void confirmCard()}>I have it — save</button>
					<button type="button" class="btn preset-outlined-surface-500" disabled={working} onclick={() => (pending = null)}>Cancel</button>
				</div>
			</div>
		{:else if adding}
			<div class="card preset-outlined-surface-500 p-4 stack-tight">
				<p class="font-medium">{adding === 'security-key' ? 'Add a security key' : 'Add a passkey on another device'}</p>
				<p class="text-sm opacity-80">
					{adding === 'security-key'
						? 'Plug in or tap the key when asked. It must support FIDO2 hmac-secret — a YubiKey 5 does.'
						: 'The browser shows a QR code; scan it with the other phone or tablet.'}
					You will touch your current passkey first, then the new one.
				</p>
				<label class="label">
					<span class="text-sm">What to call it</span>
					<input class="input" placeholder={adding === 'security-key' ? 'YubiKey on my keys' : 'My iPad'} bind:value={label} />
				</label>
				<div class="actions">
					<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void addKey()}>{working ? 'Working…' : 'Add it'}</button>
					<button type="button" class="btn preset-outlined-surface-500" disabled={working} onclick={() => (adding = null)}>Cancel</button>
				</div>
			</div>
		{:else}
			<div class="actions">
				<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void makeCard()}>Make a recovery card</button>
				<button type="button" class="btn preset-outlined-surface-500" disabled={working} onclick={() => (adding = 'security-key')}>Add a security key</button>
				<button type="button" class="btn preset-outlined-surface-500" disabled={working} onclick={() => (adding = 'phone')}>Add a passkey on another device</button>
			</div>
		{/if}

		{#if says}<p class="text-sm {good ? '' : 'text-error-600-400'}" role="status" aria-live="polite">{says}</p>{/if}
	</div>
{/if}
