<script lang="ts">
	/*
	 * A club asks its host to put it forward (ADR-Q-019 addendum, 6 October
	 * 2026). Trust travels down: a club on a host is registered with Incubator
	 * only through its host. The club's founder sends this link; the host's
	 * caretaker, in role, signs once with the host's key and their own, and
	 * Incubator countersigns. Then the club registers itself.
	 */
	import { Status } from '@inqbeta/q-ui';
	import { signerFor, type Identity } from '@inqbeta/q-core/passkey';
	import { openFederationKey } from '@inqbeta/q-core/membership';
	import { putForward } from '@inqbeta/q-core/registration';
	import { incubatorOrigin } from '$lib/registry';
	import type { FederationRecord } from '$lib/federations';

	let { identity, record, club, name, acting, ondone }: { identity: Identity; record: FederationRecord; club: string; name: string; acting: boolean; ondone?: () => void } = $props();

	let busy = $state(false);
	let said = $state<{ good: boolean; text: string } | null>(null);
	async function send() {
		busy = true;
		said = null;
		try {
			const key = await openFederationKey(record.sealedKey, identity);
			const p = await putForward(signerFor(key), signerFor(identity), { club, name });
			const r = await fetch(`${incubatorOrigin()}/api/registry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ putForward: p }) });
			const out = (await r.json().catch(() => ({}))) as { ok?: boolean; says?: string };
			said = !r.ok || !out.ok ? { good: false, text: out.says ?? `Incubator said ${r.status}.` } : { good: true, text: `Done. ${name} can now register with Incubator through ${record.founding.name}.` };
			if (said.good) ondone?.();
		} catch (e) {
			said = { good: false, text: e instanceof Error ? e.message : String(e) };
		}
		busy = false;
	}
</script>

<section class="card preset-outlined-primary-500 p-5 flex flex-col gap-3 max-w-2xl" aria-labelledby="put-forward-title">
	<div class="flex flex-wrap items-center gap-3">
		<h3 id="put-forward-title" class="h5 flex-1">{name} asks to be put forward</h3>
		<Status tone="needs-you">Waiting for you</Status>
	</div>
	<p class="text-sm">It’s a club on {record.founding.name}. Putting it forward tells Incubator it lives on your host, so it can register. It holds only while your host is registered.</p>
	{#if !acting}
		<p class="text-sm card preset-tonal p-3">Take up your role as caretaker first, then answer.</p>
	{/if}
	<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={busy || !acting || said?.good} onclick={() => void send()}>{busy ? 'Signing… touch your passkey' : 'Sign and put it forward'}</button>
	{#if said}<p class="card p-3 text-sm {said.good ? 'preset-tonal-success' : 'preset-tonal-error'}" aria-live="polite">{said.text}</p>{/if}
</section>
