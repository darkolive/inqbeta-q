<script lang="ts">
	/*
	 * Build a card from blocks (1 October 2026). Darren: "you start with one
	 * row and it gives you your little options … then press add, and you can
	 * add a row and a row and a row, and whether it's visible."
	 *
	 * Each row is one detail: one you already have, or something new (words, a
	 * date, a number, a picture…). Something new joins your profile too, so a
	 * card still only NAMES details and follows them when they change.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import type { Identity } from '@inqbeta/q-core/passkey';
	import type { AnswerValue } from '@inqbeta/q-core/questions';
	import CardFace from '$lib/components/CardFace.svelte';
	import DetailInput from '$lib/components/DetailInput.svelte';
	import { allDetails, ownDetails, justForMe, asText, saveProfile, newOwnId, withLabels, OWN_KINDS, type OwnDetail, type OwnKind } from '$lib/profile';
	import { saveCard } from '$lib/cards';

	let { identity, now, onMade, onCancel }: { identity: Identity; now: Record<string, AnswerValue>; onMade: () => void; onCancel: () => void } = $props();

	type Row = { key: string; pick: string; label: string; kind: OwnKind; value: string; shown: boolean };
	const NEW = 'new';
	const mine = $derived(justForMe(now));
	const own = $derived(ownDetails(now));
	const text = (id: string) => {
		const v = now[id];
		return typeof v === 'boolean' ? (v ? 'yes' : 'no') : asText(v);
	};
	/* What a row can be: your details that are filled in and allowed on cards. */
	const have = $derived(allDetails(own).filter((d) => now[d.id] !== undefined && !mine.includes(d.id) && d.id !== 'q:person/first' && d.id !== 'q:person/last'));

	const blank = (): Row => ({ key: crypto.randomUUID(), pick: '', label: '', kind: 'text', value: '', shown: true });
	let name = $state('');
	let rows = $state<Row[]>([blank()]);
	let busy = $state(false);
	let says = $state('');

	const ready = (r: Row) => (r.pick === NEW ? !!r.label.trim() && !!r.value.trim() : !!r.pick);
	const fresh = $derived.by(() => {
		const taken = allDetails(own).map((d) => d.id);
		return rows.filter((r) => r.pick === NEW && ready(r)).map((r) => {
			const id = newOwnId(r.label, taken);
			taken.push(id);
			return { row: r, detail: { id, label: r.label.trim(), kind: r.kind } as OwnDetail };
		});
	});
	const shownIds = $derived(
		rows.filter((r) => r.shown && ready(r)).map((r) => (r.pick === NEW ? fresh.find((f) => f.row.key === r.key)!.detail.id : r.pick))
	);
	const preview = $derived.by(() => {
		const d: Record<string, string> = {};
		for (const r of rows) {
			if (!r.shown || !ready(r)) continue;
			if (r.pick === NEW) {
				const f = fresh.find((x) => x.row.key === r.key)!;
				d[f.detail.id] = r.kind === 'yesno' ? (r.value === 'yes' ? 'Yes' : 'No') : r.value;
			} else d[r.pick] = asText(now[r.pick]);
		}
		return withLabels(d, [...own, ...fresh.map((f) => f.detail)]);
	});

	async function make() {
		busy = true;
		says = '';
		/* Something new goes into your profile first, so the card can name it. */
		if (fresh.length) {
			const all = [...own, ...fresh.map((f) => f.detail)];
			const values = Object.fromEntries(allDetails(own).map((d) => [d.id, text(d.id)]));
			for (const f of fresh) values[f.detail.id] = f.row.value;
			const saved = await saveProfile(identity, values, mine, all);
			if (!saved.ok) {
				busy = false;
				return void (says = saved.says.join(' '));
			}
		}
		const out = await saveCard(identity, name, shownIds, [], 'own');
		busy = false;
		if (!out.ok) return void (says = out.says);
		onMade();
	}
</script>

<div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
	<div class="flex flex-col gap-4">
		<label class="label">
			<span class="label-text">What do you call this card?</span>
			<input class="input" bind:value={name} />
		</label>

		{#each rows as r, i (r.key)}
			<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-3">
				<div class="flex flex-wrap items-end gap-3">
					<label class="label flex-1 min-w-48">
						<span class="label-text">Row {i + 1}</span>
						<select class="select" bind:value={r.pick}>
							<option value="" disabled>Choose a detail…</option>
							{#each have as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
							<option value={NEW}>Something new…</option>
						</select>
					</label>
					<div class="flex rounded-base preset-outlined-surface-300-700" role="group" aria-label="Row {i + 1} on the card">
						<button type="button" class="btn btn-sm min-h-11 {r.shown ? 'preset-filled-primary-500' : ''}" aria-pressed={r.shown} onclick={() => (r.shown = true)}>Shown</button>
						<button type="button" class="btn btn-sm min-h-11 {r.shown ? '' : 'preset-filled-surface-500'}" aria-pressed={!r.shown} onclick={() => (r.shown = false)}>Hidden</button>
					</div>
					{#if rows.length > 1}
						<button type="button" class="btn btn-sm preset-tonal min-h-11" aria-label="Remove row {i + 1}" onclick={() => (rows = rows.filter((x) => x.key !== r.key))}><Icon name="close" size={14} /></button>
					{/if}
				</div>
				{#if r.pick === NEW}
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="label">
							<span class="label-text">What is it called?</span>
							<input class="input" bind:value={r.label} />
						</label>
						<label class="label">
							<span class="label-text">What kind of thing?</span>
							<select class="select" bind:value={r.kind} onchange={() => (r.value = '')}>
								{#each OWN_KINDS as k (k.kind)}<option value={k.kind}>{k.label}</option>{/each}
							</select>
						</label>
					</div>
					<DetailInput kind={r.kind} label={r.label || 'The detail'} bind:value={r.value} onerror={(m) => (says = m)} />
					<p class="text-xs opacity-60">It joins your profile too, shown on cards. You can change that in your profile.</p>
				{:else if r.pick}
					<p class="text-sm opacity-70 truncate">{r.pick === 'q:person/picture' || r.pick === 'q:person/cover' ? 'Your picture, as in your profile' : asText(now[r.pick])}</p>
				{/if}
			</div>
		{/each}

		<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => (rows = [...rows, blank()])}><Icon name="plus" size={16} /> Add a row</button>

		<div class="flex flex-wrap gap-3">
			<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy || !name.trim() || !shownIds.length} onclick={() => void make()}>{busy ? 'Making…' : 'Make this card'}</button>
			<button type="button" class="btn preset-tonal min-h-11" onclick={onCancel}>Not now</button>
		</div>
		{#if !name.trim() || !shownIds.length}<p class="text-xs opacity-70">Give it a name and fill in one shown row, and the button wakes up.</p>{/if}
		{#if says}<p class="text-sm text-warning-700-300" aria-live="polite">{says}</p>{/if}
	</div>

	<aside class="flex flex-col gap-2 lg:sticky lg:top-4 self-start">
		<p class="text-sm opacity-70">What the person you give it to will see.</p>
		<CardFace details={preview} did={identity.did} badge={name.trim() || 'New card'} />
		<p class="text-xs opacity-60">Hidden rows stay off it.</p>
	</aside>
</div>
