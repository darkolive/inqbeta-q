/*
 * Your activity, in sentences (1 October 2026). Darren: under your profile,
 * "a dashboard of activity … your recent receipts, recent messages, recent
 * conversations."
 *
 * Every line comes from a receipt in your vault, said the way a person would
 * say it, with the other person's picture where their card gave one. Nothing
 * here is tracked; it's your own records, read back.
 */
import type { Ledger } from '$lib/ledger';
import type { IconName } from '@inqbeta/q-ui/icons';

export interface Activity {
	id: string;
	at: string;
	/** A whole sentence: "Sam linked with you". */
	says: string;
	/** A second, quieter line. */
	more?: string;
	who?: { name: string; picture?: string };
	icon: IconName;
	href: string;
}

type Card = Record<string, string>;
const nameOf = (c: Card | undefined) => c?.['q:person/called'] || [c?.['q:person/first'], c?.['q:person/last']].filter(Boolean).join(' ') || '';

export function activityFrom(ledger: Ledger | null, myDid: string): Activity[] {
	if (!ledger) return [];
	const out: Activity[] = [];
	/* Who's who, from the cards people linked with: their DID → name and picture. */
	const people = new Map<string, { name: string; picture?: string }>();
	for (const r of ledger.receipts) {
		const c = (r.json as { content?: { schema?: string; with?: string; card?: { details?: Card }; receipt?: { from?: string; card?: Card } } } | undefined)?.content;
		if (c?.schema === 'inqbeta.linked/1' && c.with && c.card?.details) people.set(c.with, { name: nameOf(c.card.details) || 'Someone', picture: c.card.details['q:person/picture'] });
		if (c?.schema === 'inqbeta.received/1' && c.receipt?.from && c.receipt.card) people.set(c.receipt.from, { name: nameOf(c.receipt.card) || 'Someone', picture: c.receipt.card['q:person/picture'] });
	}

	let profile: Activity | null = null;
	for (const r of ledger.receipts) {
		const json = r.json as { content?: Record<string, unknown>; steps?: { did: string; content?: { event?: string; seconds?: number; media?: string[] } }[] } | undefined;
		const c = json?.content as
			| { schema?: string; setId?: string; from?: string; title?: string; collectedAt?: string; with?: string; card?: { name?: string; details?: Card }; receipt?: { schema?: string; from?: string; card?: Card }; answers?: Record<string, { value?: unknown }> }
			| undefined;

		/* A message, invitation or link-up that came through the bell. */
		if (c?.schema === 'inqbeta.received/1') {
			const them = c.receipt?.from ? people.get(c.receipt.from) : undefined;
			const name = them?.name ?? c.from ?? 'Someone';
			out.push(
				c.receipt?.schema === 'inqbeta.linked-back/1'
					? { id: r.id, at: c.collectedAt ?? r.at, says: `${name} linked with you`, more: 'You can reach each other now', who: { name, picture: them?.picture }, icon: 'contacts', href: '/contacts' }
					: { id: r.id, at: c.collectedAt ?? r.at, says: `${name} sent you “${c.title ?? 'a message'}”`, who: { name, picture: them?.picture }, icon: 'message', href: '/receipts' }
			);
			continue;
		}
		/* You linked with someone's card. */
		if (c?.schema === 'inqbeta.linked/1') {
			const name = nameOf(c.card?.details) || 'someone';
			out.push({ id: r.id, at: r.at, says: `You linked with ${name}`, who: { name, picture: c.card?.details?.['q:person/picture'] }, icon: 'contacts', href: '/contacts' });
			continue;
		}
		/* A call: the chain of receipts both sides signed. */
		if (Array.isArray(json?.steps) && json.steps.length) {
			const other = json.steps.map((s) => s.did).find((d) => d !== myDid);
			const them = other ? people.get(other) : undefined;
			const ended = json.steps.map((s) => s.content).find((s) => s?.event === 'call.ended' && s.seconds);
			const mins = ended?.seconds ? Math.max(1, Math.round(ended.seconds / 60)) : 0;
			const video = json.steps.some((s) => s.content?.media?.includes('video'));
			out.push({
				id: r.id,
				at: r.at,
				says: `${video ? 'Video call' : 'Call'} with ${them?.name ?? 'someone'}`,
				more: mins ? `${mins} minute${mins === 1 ? '' : 's'}` : 'Not answered',
				who: them,
				icon: 'phone',
				href: '/receipts'
			});
			continue;
		}
		/* Your card changed: said once, for the newest. */
		if (c?.setId === 'q/your-profile') {
			if (!profile || r.at > profile.at) profile = { id: r.id, at: r.at, says: 'You updated your card', icon: 'card', href: '/cards?tab=personal' };
			continue;
		}
		if (c?.setId === 'q/a-card') {
			const n = c.answers?.['q:card/name']?.value;
			out.push({ id: r.id, at: r.at, says: `You made your ${typeof n === 'string' ? n : ''} card`.replace('  ', ' '), icon: 'card', href: '/cards' });
			continue;
		}
		/* Quiet housekeeping never makes the list. */
		if (c?.setId === 'q/your-settings') continue;
	}

	if (profile) out.push(profile);

	/* Federations you founded or joined. */
	for (const f of ledger.found) {
		if (f.kind === 'membership') out.push({ id: `f:${f.key}`, at: f.at, says: `You joined ${f.title}`, icon: 'federations', href: '/federations' });
		else if (f.kind === 'federation') out.push({ id: `f:${f.key}`, at: f.at, says: `You founded ${f.title}`, icon: 'federations', href: '/federations' });
	}

	const seen = new Set<string>();
	return out
		.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
		.sort((a, b) => b.at.localeCompare(a.at));
}

/** Today, This week, Earlier. */
export function whenGroup(iso: string, now = Date.now()): string {
	const d = new Date(iso);
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	if (d.getTime() >= today.getTime()) return 'Today';
	if (d.getTime() >= today.getTime() - 6 * 86400000) return 'This week';
	return 'Earlier';
}
