/*
 * Cards, in and out of the folder.
 *
 * A card is written like every other receipt: signed by the passkey, locked to
 * it, in the folder. What it contains is a list of question ids and a list of
 * channel ids — never a value. See q-core/cards.ts for why.
 *
 * Changing a card writes a NEW receipt. The earlier one keeps its signature and
 * its time, so the record says what was shown, and when, rather than only what
 * is shown now.
 *
 * A CARD IS WRITTEN AS ANSWERS. It answers `q/a-card` — a name, the questions
 * it shows, the ways to be reached it carries — so it is stored the same way
 * everything else is, and a new KIND of card is a question set rather than new
 * code. Cards written before this change are still read, for ever: a receipt
 * already signed keeps its own signature, and rewriting it to a newer taste is
 * the one thing an append-only folder must not do.
 *
 * NOT HERE YET: giving a card to a named person. That has an audience, and an
 * audience means a UCAN delegation scoped to the card and revocable on its own
 * (permissions.ts `grant`, which is built and tested). It is the next
 * increment, deliberately left out of this one so that what exists is finished.
 */
import { CARD_QUESTIONS, readCard, type Card } from '@inqbeta/q-core/cards';
import { buildAnswerSet } from '@inqbeta/q-core/questions';
import { seal } from '@inqbeta/q-core/seal';
import { readItem, saveLocked, type FolderItem } from '@inqbeta/q-core/folder';
import type { Identity } from '@inqbeta/q-core/passkey';
import { A_CARD } from '$lib/questions/a-card';

export type CardKind = 'personal' | 'business' | 'own';
export type KindCard = Card & { kind: CardKind };

/** Cards written before kinds existed: read by their name. */
function kindOf(answers: unknown, name: string): CardKind {
	const k = (answers as { answers?: Record<string, { value?: unknown }> })?.answers?.['q:card/kind']?.value;
	if (k === 'personal' || k === 'business' || k === 'own') return k;
	if (/business/i.test(name)) return 'business';
	if (/^(personal|basic|friends|contact)$/i.test(name.trim())) return 'personal';
	return 'own';
}

export async function saveCard(
	identity: Identity,
	name: string,
	shows: string[],
	channels: string[] = [],
	kind: CardKind = 'own'
): Promise<{ ok: true; card: Card; storedAs: string } | { ok: false; says: string }> {
	const answered = await buildAnswerSet({
		did: identity.did,
		set: A_CARD,
		values: {
			[CARD_QUESTIONS.name]: name,
			[CARD_QUESTIONS.shows]: shows,
			[CARD_QUESTIONS.channels]: channels,
			'q:card/kind': kind
		}
	});
	if (!answered.ok) return { ok: false, says: answered.says.join(' ') };

	const card = await readCard(answered.answers);
	if (!card) return { ok: false, says: 'A card has to show something, or carry a way to reach you.' };

	try {
		const sealed = await seal({ ...answered.answers, namespace: 'cards' });
		const storedAs = await saveLocked(
			'cards',
			`card-${card.id}.json`,
			JSON.stringify(sealed, null, 2),
			'application/json'
		);
		return { ok: true, card, storedAs };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : 'The card could not be saved.' };
	}
}

/** Read a card back out of a folder item — either shape — or null if it is not one. */
export async function cardFrom(item: FolderItem): Promise<KindCard | null> {
	try {
		const json = JSON.parse(new TextDecoder().decode((await readItem(item)).data)) as { content?: unknown };
		const content = json?.content ?? json;
		const card = await readCard(content);
		return card ? { ...card, kind: kindOf(content, card.name) } : null;
	} catch {
		return null;
	}
}
