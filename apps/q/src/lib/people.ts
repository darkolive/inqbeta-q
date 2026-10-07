/*
 * The people you're linked with, from your own receipts (ADR-Q-015): whose
 * card you linked up with, who linked up with yours, and who has written to
 * you. One per person, newest card wins, with where to write back to them.
 */
import type { Ledger } from '$lib/ledger';

export interface Person {
	did: string;
	name: string;
	picture?: string;
	/** Their card, as they shared it. */
	details: Record<string, string>;
	/** The card's badge: Personal, a business name. */
	cardName: string;
	/** Their inbox at the storage, so you can write to them. */
	inbox?: string;
	at: string;
	how: string;
}

type Card = Record<string, string>;
const nameOf = (c: Card | undefined) => c?.['q:person/called'] || [c?.['q:person/first'], c?.['q:person/last']].filter(Boolean).join(' ') || 'Someone';

export function peopleFrom(ledger: Ledger | null, me = ''): Person[] {
	const by = new Map<string, Person>();
	const put = (p: Person) => {
		const had = by.get(p.did);
		if (!had || p.at > had.at) by.set(p.did, { ...p, inbox: p.inbox ?? had?.inbox });
		else if (!had.inbox && p.inbox) had.inbox = p.inbox;
	};
	for (const r of ledger?.receipts ?? []) {
		const j = r.json as { did?: string; content?: Record<string, unknown> } | undefined;
		const c = j?.content as
			| { schema?: string; kind?: string; with?: string; card?: { name?: string; details?: Card; inbox?: string } & Card; receipt?: { card?: Card; from?: string; inbox?: string }; replyTo?: string; at?: string; collectedAt?: string }
			| undefined;
		if (!c) continue;
		if (c.schema === 'inqbeta.linked/1' && c.with && c.card?.details)
			put({ did: c.with, name: nameOf(c.card.details), picture: c.card.details['q:person/picture'], details: c.card.details, cardName: c.card.name ?? 'Card', inbox: c.card.inbox, at: c.at ?? r.at, how: 'You linked up with their card' });
		else if (c.schema === 'inqbeta.received/1' && c.receipt?.card && c.receipt.from)
			put({ did: c.receipt.from, name: nameOf(c.receipt.card), picture: c.receipt.card['q:person/picture'], details: c.receipt.card, cardName: 'Personal', inbox: c.receipt.inbox, at: c.collectedAt ?? r.at, how: 'They linked up with yours' });
		else if (c.schema === 'inqbeta.message/1' && j?.did && j.did !== me) {
			if (c.kind === 'linked-back' && c.card)
				put({ did: j.did, name: nameOf(c.card as Card), picture: (c.card as Card)['q:person/picture'], details: c.card as Card, cardName: 'Personal', inbox: c.replyTo, at: c.at ?? r.at, how: 'They linked up with yours' });
			else if (by.has(j.did) && c.replyTo && !by.get(j.did)!.inbox) by.get(j.did)!.inbox = c.replyTo;
		}
	}
	/* An inbox learned from an agreement step they sent (a buyer from your shop): only for people you know, and only if there's none yet. */
	for (const [did, inbox] of replyTos(ledger, me)) if (by.has(did) && !by.get(did)!.inbox) by.get(did)!.inbox = inbox;
	return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Inboxes learned from messages people sent you, newest first: who to answer, and where. Only your own signed notes count. */
export function replyTos(ledger: Ledger | null, me: string): Map<string, string> {
	const out = new Map<string, { inbox: string; at: string }>();
	for (const r of ledger?.receipts ?? []) {
		const j = r.json as { did?: string; content?: { schema?: string; with?: string; inbox?: string; at?: string } } | undefined;
		const c = j?.content;
		if (c?.schema !== 'inqbeta.reply-to/1' || j?.did !== me || !c.with || !c.inbox) continue;
		const had = out.get(c.with);
		if (!had || (c.at ?? '') > had.at) out.set(c.with, { inbox: c.inbox, at: c.at ?? '' });
	}
	return new Map([...out].map(([d, x]) => [d, x.inbox]));
}
