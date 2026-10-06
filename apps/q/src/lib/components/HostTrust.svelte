<script lang="ts">
	/*
	 * Before you join (ADR-Q-019 addendum, 6 October 2026). Trust travels down:
	 * Incubator → the host → its clubs. Shown wherever someone is about to join,
	 * so they can see whether the host is registered, and what it runs. A club
	 * is only as checked as the host it lives on, so for a club both are shown.
	 * Nothing is stopped: it's your choice, made knowing.
	 */
	import { Icon, Status } from '@inqbeta/q-ui';
	import { hostTrust, incubatorOrigin, type HostTrust } from '$lib/registry';
	import { readHome } from '$lib/home';

	let { federation, name }: { federation: string; name: string } = $props();

	type Line = { name: string; federation: string; trust: HostTrust; host: boolean };
	let lines = $state<Line[] | null>(null);
	$effect(() => {
		const fed = federation;
		void (async () => {
			const home = await readHome();
			const out: Line[] = [];
			if (home.ok && home.federation !== fed) out.push({ name: home.name, federation: home.federation, trust: await hostTrust(home.federation), host: true });
			out.push({ name, federation: fed, trust: await hostTrust(fed), host: home.ok && home.federation === fed });
			lines = out;
		})();
	});
	const page = (fed: string) => `${incubatorOrigin()}/registered/${encodeURIComponent(fed)}`;
	const hostNot = $derived(!!lines?.find((l) => l.host && l.trust.state === 'not'));
	const tone = (t: HostTrust) => (t.state === 'registered' ? 'good' : t.state === 'not' ? 'needs-you' : 'plain');
	const called = (t: HostTrust) => (t.state === 'registered' ? 'Registered' : t.state === 'branch' ? 'A branch of Q' : t.state === 'unchecked' ? 'Testing' : 'Not registered');
</script>

{#if lines}
	<section class="card p-4 flex flex-col gap-3 {hostNot ? 'preset-tonal-warning' : 'preset-outlined-surface-200-800'}" aria-label="Who stands behind this">
		{#each lines as l (l.federation)}
			<div class="flex flex-wrap items-start gap-3 text-sm">
				<Status tone={tone(l.trust)}>{called(l.trust)}</Status>
				<p class="flex-1 min-w-48">
					<span class="font-bold">{l.name}{l.host && lines.length > 1 ? ', the host' : ''}.</span>
					{l.trust.says}
					{#if l.trust.state !== 'not'}<a class="anchor whitespace-nowrap" href={page(l.federation)} rel="noopener">Its receipt <Icon name="arrowRight" size={14} /></a>{/if}
				</p>
			</div>
		{/each}
		{#if hostNot}
			<p class="text-sm">You can still join. Your keys and receipts stay yours wherever you go. Only you can decide whether you trust whoever runs it.</p>
		{/if}
		<p class="text-xs opacity-70">From Incubator’s public registry. Only the federation’s name was looked up; nothing about you.</p>
	</section>
{/if}
