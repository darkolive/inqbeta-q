/*
 * Your Personal card as it goes to someone (shared by CardArrived and offer
 * links): the details it shows, never what's just for you, the picture made
 * small so it fits a message.
 */
import type { Identity } from '@inqbeta/q-core/passkey';
import type { AnswerSet } from '@inqbeta/q-core/questions';
import { answersFrom } from '$lib/answers';
import { newestPerKey } from '$lib/features/dostudy';
import { profileNow, justForMe, asText } from '$lib/profile';
import { CARD_PRESETS } from '$lib/questions/presets';
import { thumbnail } from '$lib/pictures';
import type { Ledger } from '$lib/ledger';

export async function myCardDetails(identity: Identity, ledger: Ledger | null): Promise<Record<string, string>> {
	const found = ledger ? newestPerKey(ledger.found) : [];
	const answers = (await Promise.all(found.filter((f) => f.kind === 'answers').map((f) => answersFrom(f.item)))).filter((a): a is AnswerSet => !!a);
	const now = profileNow(answers, identity.did);
	const kept = justForMe(now);
	const ids = CARD_PRESETS.find((p) => p.id === 'personal')?.shows ?? [];
	const out: Record<string, string> = {};
	for (const id of ids) {
		if (id === 'q:person/cover' || kept.includes(id) || now[id] === undefined) continue;
		const v = asText(now[id]);
		out[id] = id === 'q:person/picture' && v.startsWith('data:') ? await thumbnail(v) : v;
	}
	return out;
}
