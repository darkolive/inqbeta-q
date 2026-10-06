<script lang="ts">
	/*
	 * Where an evidence report or an external verification lands (ADR-Q-038,
	 * 6 October 2026). The packet is in the #fragment, never sent to a server.
	 *
	 *   a REPORT         read what was checked, the finding, and the author's
	 *                    declaration, word for word. A verifier of another
	 *                    federation, in role, weighs it and signs.
	 *   a VERIFICATION   back at the author: the outcome, what was found, and
	 *                    the verifier's own declaration. Kept with the report.
	 *
	 * Darren: "an external verifier would just need to look at the evidence
	 * report … know that they are an employee, so does the report suggest any
	 * conflict or bias, and if not accept the report as a good and honest
	 * answer."
	 */
	import { onMount } from 'svelte';
	import { Page, Section, Status, Empty } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import ShareLink from '$lib/components/ShareLink.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { isEvidenceReport, isExternalVerification, unpack, type Packet } from '@inqbeta/q-core/membership';
	import { FINDINGS, OUTCOMES, checkReport, checkVerification, declaredBy, type EvidenceReportReceipt, type Outcome } from '@inqbeta/q-core/attestation';
	import { officeKind } from '@inqbeta/q-core/offices';
	import { role } from '$lib/role.svelte';
	import { verify, keepVerification } from '$lib/attestation';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	let packet = $state<Packet | null>(null);
	let unreadable = $state(false);
	let check = $state<{ ok: boolean; says: string } | null>(null);
	onMount(async () => {
		const hash = location.hash;
		if (!hash || hash.length < 2) return void (unreadable = true);
		packet = await unpack(hash);
		if (!packet || !(isEvidenceReport(packet) || isExternalVerification(packet))) return void (unreadable = true);
		if (isEvidenceReport(packet)) check = await checkReport(packet);
	});

	const onDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
	const officeOf = (o: string) => officeKind(o)?.called ?? o;

	/* A verification is checked against the report it names, from your own vault. */
	const reportFor = $derived.by(() => {
		if (!packet || !isExternalVerification(packet)) return null;
		const h = packet.content.report;
		return (ledger?.state === 'ready' ? ledger.receipts : []).map((r) => r.json).find((j): j is EvidenceReportReceipt => isEvidenceReport(j) && j.contentHash === h) ?? null;
	});
	$effect(() => {
		const v = packet;
		const r = reportFor;
		if (v && isExternalVerification(v) && r) void checkVerification(v, r).then((c) => (check = c));
	});

	/* Verifying: only as a verifier, in role, in another federation. */
	const acting = $derived(role.acting);
	const canVerify = $derived(!!packet && isEvidenceReport(packet) && acting?.office === 'verifier' && acting.federation !== packet.content.federation);
	let outcome = $state<Outcome | ''>('');
	let says = $state('');
	let found = $state('');
	let busy = $state(false);
	let said = $state<{ tone: 'good' | 'bad'; text: string } | null>(null);
	let back = $state<string | null>(null);
	let kept = $state(false);
	const ready = $derived(!!outcome && !!says.trim() && (outcome === 'accepted' || !!found.trim()));
	async function sign() {
		if (!identity || !packet || !isEvidenceReport(packet) || !outcome || !acting) return;
		busy = true;
		said = null;
		const out = await verify(identity, role.proof(acting.federation), packet, { outcome, says, found });
		busy = false;
		if (!out.ok) return void (said = { tone: 'bad', text: out.says });
		said = { tone: 'good', text: 'Signed and kept. Send it back to whoever wrote the report.' };
		back = out.link;
	}
	async function keep() {
		if (!packet || !isExternalVerification(packet)) return;
		await keepVerification(packet);
		kept = true;
		await refreshLedger();
	}
</script>

<svelte:head><title>{packet && isExternalVerification(packet) ? 'An external verification' : 'An evidence report'} — Q</title></svelte:head>

<Page title={packet && isExternalVerification(packet) ? 'An external verification' : 'An evidence report'} lead="Everything here is checked on this device. Nothing about it was sent to a server.">
	{#if unreadable}
		<Empty icon="receipts" title="This link can’t be read" description="It may have been cut short when it was copied. Ask for it again." />
	{:else if !packet}
		<p class="opacity-60">Reading the link…</p>
	{:else if !identity}
		<SignIn />
	{:else}
		{#if said}
			<div class="card p-4 mb-6 {said.tone === 'good' ? 'preset-tonal-success' : 'preset-tonal-error'}" role="status"><p>{said.text}</p></div>
		{/if}
		{#if back}<div class="mb-6"><ShareLink link={back} label="Send this back" note="Opening it keeps your verification with their report." /></div>{/if}

		{#if isEvidenceReport(packet)}
			{@const r = packet}
			{@const c = r.content}
			<Section title={c.subject} description="{officeOf(c.acting.office)} of {c.acting.takenUp.content.name} · {onDay(c.at)}">
				<div class="flex flex-col gap-4 max-w-3xl">
					<div class="flex flex-wrap items-center gap-3">
						<Status tone={c.finding === 'meets' ? 'good' : c.finding === 'meets-with-notes' ? 'needs-you' : 'bad'}>{FINDINGS.find((f) => f.id === c.finding)?.called}</Status>
						{#if check}<Status tone={check.ok ? 'good' : 'bad'}>{check.ok ? 'Signed and in role' : 'Doesn’t hold'}</Status>{/if}
					</div>
					<p class="whitespace-pre-line">{c.says}</p>
					<!-- What the author declared when they took up the office: the first thing a verifier weighs. -->
					<div class="card preset-outlined-warning-500 p-4 flex flex-col gap-1">
						<p class="text-sm font-bold">What its author declared</p>
						<p>{declaredBy(r)}</p>
					</div>
					{#if check}<p class="text-sm">{check.says}</p>{/if}
				</div>
			</Section>

			{#if canVerify}
				<Section title="Verify it" description="You’re acting as verifier of {acting?.name}. Weigh the report knowing what its author declared: does it show any conflict or bias?">
					<div class="flex flex-col gap-4 max-w-3xl">
						<div class="flex flex-col gap-2" role="radiogroup" aria-label="Outcome">
							{#each OUTCOMES as o (o.id)}
								<button type="button" role="radio" aria-checked={outcome === o.id} class="btn min-h-11 justify-start {outcome === o.id ? (o.id === 'not-accepted' ? 'preset-filled-error-500' : 'preset-filled-primary-500') : 'preset-tonal'}" onclick={() => (outcome = o.id)}>{o.called}</button>
							{/each}
						</div>
						{#if outcome && outcome !== 'accepted'}
							<label class="label"><span class="label-text">What you found: the bias, conflict or gap</span><textarea class="textarea" rows="3" bind:value={found}></textarea></label>
						{/if}
						<label class="label"><span class="label-text">What you weighed, in plain words</span><textarea class="textarea" rows="3" bind:value={says}></textarea></label>
						<p class="text-sm">Your own declaration goes with it.</p>
						<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={!ready || busy || !!back} onclick={() => void sign()}>{busy ? 'Signing…' : 'Sign the verification'}</button>
					</div>
				</Section>
			{:else if acting?.office === 'verifier'}
				<p class="card preset-tonal p-4">You’re a verifier of the same federation that wrote this. An external verifier comes from another one.</p>
			{:else}
				<p class="card preset-tonal p-4">To verify it, take up your office as verifier in your own federation, then open this link again.</p>
			{/if}
		{:else if isExternalVerification(packet)}
			{@const v = packet.content}
			<Section title={OUTCOMES.find((o) => o.id === v.outcome)?.called ?? 'Verified'} description="By the verifier of {v.acting.takenUp.content.name} · {onDay(v.at)}">
				<div class="flex flex-col gap-4 max-w-3xl">
					{#if check}<Status tone={check.ok ? 'good' : 'bad'}>{check.ok ? 'Holds, against your report' : 'Doesn’t hold'}</Status>{:else if !reportFor}<p class="text-sm">Your report isn’t in this vault, so it can’t be checked against it here.</p>{/if}
					{#if v.found}<div class="card preset-tonal-error p-4"><p class="text-sm font-bold">What they found</p><p>{v.found}</p></div>{/if}
					<p class="whitespace-pre-line">{v.says}</p>
					<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-1">
						<p class="text-sm font-bold">What they weighed: the author’s declaration</p>
						<p>{v.authorDeclared}</p>
					</div>
					<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-1">
						<p class="text-sm font-bold">What the verifier declared</p>
						<p>{v.acting.takenUp.content.words}</p>
					</div>
					{#if !kept}<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" onclick={() => void keep()}>Keep it with my report</button>{:else}<p class="text-sm">Kept.</p>{/if}
				</div>
			</Section>
		{/if}
	{/if}
</Page>
