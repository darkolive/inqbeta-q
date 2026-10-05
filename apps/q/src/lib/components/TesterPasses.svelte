<script lang="ts">
	/*
	 * Tester passes (ADR-Q-034 step 6), on the founder's own computer.
	 *
	 * While the host is in test, the door on its storage (the gate) and its
	 * mint let in only the founder's root and people holding a pass. Here the
	 * founder gives a pass (a DID, for so many days), takes one back, and sees
	 * who holds one. Each is a receipt signed by the root and sent to the
	 * door. Names are kept only on this computer; the door sees DIDs.
	 *
	 * Your own other keys (your inqbeta.com passkey, say) come in the same way:
	 * give that key a pass for a year.
	 */
	import { Section, Status, Empty } from '@inqbeta/q-ui';
	import type { Identity } from '@inqbeta/q-core/passkey';
	import { givePass, takePass, passList, PASS_DAYS, type PassHeld } from '@inqbeta/q-core/door';

	let { identity, host, gate }: { identity: Identity; host: string; gate: string } = $props();

	interface DoorFile {
		on: boolean;
		open: boolean;
		root: string | null;
		host: string | null;
		items: unknown[];
	}
	let door = $state<DoorFile | null>(null);
	let asked = $state(false);
	let passes = $state<PassHeld[]>([]);
	let names = $state<Record<string, string>>({});
	let holder = $state('');
	let name = $state('');
	let days = $state(PASS_DAYS);
	let busy = $state('');
	let said = $state<{ tone: 'good' | 'bad'; text: string } | null>(null);

	const base = $derived(gate.replace(/\/$/, ''));
	const short = (d: string) => (d.length > 26 ? `${d.slice(0, 16)}…${d.slice(-6)}` : d);
	const onDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

	function loadNames() {
		try {
			names = JSON.parse(localStorage.getItem('q.door.names') ?? '{}') as Record<string, string>;
		} catch {
			names = {};
		}
	}
	function keepName(did: string, n: string) {
		if (!n.trim()) return;
		names = { ...names, [did]: n.trim().slice(0, 60) };
		try {
			localStorage.setItem('q.door.names', JSON.stringify(names));
		} catch {
			/* kept for this visit */
		}
	}

	async function load() {
		loadNames();
		const r = await fetch(`${base}/door`, { cache: 'no-store' }).catch(() => null);
		door = r?.ok ? ((await r.json().catch(() => null)) as DoorFile | null) : null;
		asked = true;
		const held = door?.items ? await passList(door.items, { root: identity.did, host }) : new Map();
		passes = [...held.values()].sort((a, b) => b.at.localeCompare(a.at));
	}
	$effect(() => void load());

	async function send(receipt: unknown): Promise<string | null> {
		const r = await fetch(`${base}/door`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(receipt) }).catch(() => null);
		if (!r) return 'The storage didn’t answer. Try again in a moment.';
		if (!r.ok) return ((await r.json().catch(() => ({}))) as { says?: string }).says ?? `The storage said ${r.status}.`;
		return null;
	}

	async function give(e: SubmitEvent) {
		e.preventDefault();
		said = null;
		const did = holder.trim();
		if (!/^did:key:z[1-9A-HJ-NP-Za-km-z]{20,}$/.test(did)) return void (said = { tone: 'bad', text: 'That isn’t a DID. It starts did:key:z… and the person can copy it from their Keys page.' });
		if (did === identity.did) return void (said = { tone: 'bad', text: 'That’s you: the founder is always let in.' });
		busy = 'give';
		const wrong = await send(await givePass(identity, { host, holder: did, days }));
		busy = '';
		if (wrong) return void (said = { tone: 'bad', text: wrong });
		keepName(did, name);
		said = { tone: 'good', text: `${name.trim() || short(did)} can come in for ${days} days. It takes up to a minute to reach every door.` };
		holder = '';
		name = '';
		await load();
	}

	async function takeBack(p: PassHeld) {
		said = null;
		busy = p.holder;
		const wrong = await send(await takePass(identity, { host, holder: p.holder }));
		busy = '';
		said = wrong ? { tone: 'bad', text: wrong } : { tone: 'good', text: `${names[p.holder] ?? short(p.holder)}’s pass is taken back. Within a minute, the door shuts for them.` };
		await load();
	}

	const nodeLines = $derived(`GATE_DOOR_ROOT=${identity.did}\nGATE_DOOR_HOST=${host}`);
	let copied = $state(false);
	async function copyLines() {
		try {
			await navigator.clipboard.writeText(nodeLines);
			copied = true;
		} catch {
			copied = false;
		}
	}
</script>

<Section title="Tester passes" description="While your host is in test, only you and the people you give a pass can buy, take storage, send or sell. Anyone can still look around.">
	<div class="flex flex-col gap-4 max-w-3xl">
		{#if !asked}
			<p class="card preset-tonal-surface p-4" aria-live="polite">Asking the door…</p>
		{:else if !door}
			<p class="card preset-tonal-warning p-4">The storage didn’t answer, so the door can’t be checked just now.</p>
		{:else if !door.on}
			<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-3">
				<p><Status tone="plain">No door yet</Status> Your storage lets everyone in. To lock it while in test, add these two lines to the node’s <code>.env</code>, then recreate the gate.</p>
				<pre class="pre text-xs whitespace-pre-wrap break-all">{nodeLines}</pre>
				<button type="button" class="btn btn-sm preset-tonal self-start min-h-11" onclick={() => void copyLines()}>{copied ? 'Copied' : 'Copy the two lines'}</button>
				<p class="text-sm">Wait until the development site has its own storage: today it shares this one, so the door would lock it too.</p>
			</div>
		{:else if door.open}
			<p><Status tone="good">Open</Status> Your host is live, so everyone is let in. Passes aren’t needed.</p>
		{:else}
			<p><Status tone="needs-you">Locked while in test</Status> You, and the people below, are let in.</p>
		{/if}

		{#if door?.on}
			<form class="card preset-outlined-primary-500 p-4 flex flex-col gap-3" onsubmit={give}>
				<h3 class="h6">Give a pass</h3>
				<label class="label">
					<span class="label-text">Their DID (from their Keys page)</span>
					<input class="input role-token border-2 border-primary-500" bind:value={holder} autocomplete="off" spellcheck="false" />
				</label>
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="label">
						<span class="label-text">Who it is (kept only on this computer)</span>
						<input class="input border-2 border-primary-500" bind:value={name} />
					</label>
					<label class="label">
						<span class="label-text">For how long</span>
						<select class="select border-2 border-primary-500" bind:value={days}>
							<option value={7}>A week</option>
							<option value={30}>30 days</option>
							<option value={90}>3 months</option>
							<option value={365}>A year (your own other keys)</option>
						</select>
					</label>
				</div>
				<button type="submit" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!!busy}>{busy === 'give' ? 'Signing…' : 'Give the pass'}</button>
			</form>

			{#if !passes.length}
				<Empty icon="key" title="Nobody else yet" description="When you give a pass, it shows here, with when it runs out." />
			{:else}
				<ul class="flex flex-col gap-2">
					{#each passes as p (p.holder)}
						<li class="card preset-outlined-surface-200-800 p-3 flex flex-wrap items-center gap-3">
							<div class="flex-1 min-w-56">
								<p>{names[p.holder] ?? 'Someone'} <span class="role-token text-xs opacity-70" title={p.holder}>{short(p.holder)}</span></p>
								<p class="text-sm">
									{#if p.current}<Status tone="good">Let in</Status> until {onDay(p.until)}{:else if p.event === 'pass.taken'}<Status tone="plain">Taken back</Status> on {onDay(p.at)}{:else}<Status tone="plain">Ran out</Status> on {onDay(p.until)}{/if}
								</p>
							</div>
							{#if p.current}<button type="button" class="btn btn-sm preset-tonal min-h-11" disabled={!!busy} onclick={() => void takeBack(p)}>{busy === p.holder ? 'Taking back…' : 'Take it back'}</button>{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
		{#if said}<p class="card p-3 text-sm {said.tone === 'good' ? 'preset-tonal-success' : 'preset-tonal-error'}" role="status">{said.text}</p>{/if}
	</div>
</Section>
