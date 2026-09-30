<script lang="ts">
	/*
	 * Leave no trace — the bottom of the dashboard (q-core/leave.ts).
	 *
	 * One button, then one honest check: is everything held somewhere else?
	 * Q asks Google Drive right now rather than trusting a date. If nothing
	 * outside this browser holds all of it, it says how much would be lost and
	 * asks a second time. Then it clears, and lands on a plain page that clears
	 * again once Q has let go of its databases.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { signOut } from '@inqbeta/q-core/passkey';
	import { folderState, unexported } from '@inqbeta/q-core/folder';
	import { leaveNoTrace, STAYS_BEHIND } from '@inqbeta/q-core/leave';
	import { syncCloudNow } from '$lib/autosync';
	import NoteTouch from './NoteTouch.svelte';

	type Stage = 'idle' | 'checking' | 'safe' | 'unsafe' | 'leaving';
	let stage = $state<Stage>('idle');
	let where = $state('');
	let losing = $state(0);
	const onDisk = $derived.by(() => {
		const f = folderState();
		return f.kind === 'ready' && !f.inBrowser ? f.name : '';
	});

	async function check() {
		stage = 'checking';
		const clouds = await syncCloudNow().catch(() => []);
		const holder = clouds.find((c) => c.holdsAll);
		if (holder) {
			where = holder.called;
			stage = 'safe';
			return;
		}
		losing = await unexported().catch(() => 0);
		stage = 'unsafe';
	}

	/* First, offer to note on the passkey where the vault now is, before this
	 * browser forgets it — the next device reads it at sign-in, offline
	 * (ADR-Q-012). Asked in Q's own words; leaving carries on either way. */
	let noting = $state(false);
	function leave() {
		noting = true;
	}
	async function leaveNow() {
		stage = 'leaving';
		await leaveNoTrace({ signOut, siteData: '/api/leave' });
		location.replace('/gone.html');
	}
</script>

<section class="card preset-outlined-surface-500 p-5 flex flex-col gap-4" aria-labelledby="leave-title">
	<div class="flex items-center gap-3">
		<Icon name="eye-off" size={32} stroke={2.5} />
		<div>
			<h2 id="leave-title" class="h4">Leave no trace</h2>
			<p class="text-sm text-surface-700-300">Clear everything Q keeps in this browser. Your copies elsewhere stay.</p>
		</div>
	</div>

	{#if stage === 'idle'}
		<button type="button" class="btn preset-tonal-error font-semibold min-h-11 self-start" onclick={() => void check()}>
			<Icon name="eye-off" size={20} stroke={2.5} /><span>Leave no trace</span>
		</button>
	{:else if stage === 'checking'}
		<p class="font-medium" aria-live="polite">Checking your copies are complete…</p>
	{:else if stage === 'leaving'}
		<p class="font-medium" aria-live="polite">Clearing this browser…</p>
	{:else}
		{#if stage === 'safe'}
			<p class="card preset-tonal-success p-4 font-medium" role="status">Everything is on {where}, checked just now.</p>
		{:else}
			<p class="card preset-tonal-warning p-4 font-medium" role="alert">
				Nothing outside this browser holds all of it.
				{losing ? `${losing} ${losing === 1 ? 'thing' : 'things'} since your last backup would be lost.` : 'Back up or connect Google Drive first.'}
			</p>
		{/if}
		{#if onDisk}
			<p class="text-sm">Your {onDisk} folder on this computer stays. Q only forgets it.</p>
		{/if}
		<div class="text-sm">
			<p class="font-semibold">Q can’t clear these — they’re yours to deal with:</p>
			<ul class="list-disc pl-5 mt-1 space-y-1">
				{#each STAYS_BEHIND as s (s.id)}<li>{s.says}</li>{/each}
			</ul>
		</div>
		<div class="flex flex-wrap gap-3">
			<button type="button" class="btn preset-filled-error-500 font-semibold min-h-11" onclick={() => void leave()}>
				<Icon name="eye-off" size={20} stroke={2.5} /><span>{stage === 'safe' ? 'Leave now' : 'Leave anyway'}</span>
			</button>
			<button type="button" class="btn preset-tonal font-semibold min-h-11" onclick={() => (stage = 'idle')}>Not now</button>
		</div>
	{/if}
</section>

<NoteTouch bind:open={noting} title="note.title.leave" onfinish={() => void leaveNow()} />
