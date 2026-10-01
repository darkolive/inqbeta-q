/*
 * Your profile (1 October 2026): one place for everything about you, filled
 * in like a form, each detail either shown on cards or just for you.
 *
 * Stored the way everything else is — an answering of `q/your-profile`
 * (lib/questions/your-profile.ts), signed and locked in your vault. "Just for
 * you" is an answer too (q:profile/just-for-me), and cardView in q-core
 * honours it above any card.
 */
import { newestPerSet, type AnswerSet, type AnswerValue } from '@inqbeta/q-core/questions';
import { JUST_FOR_ME } from '@inqbeta/q-core/cards';
import type { Identity } from '@inqbeta/q-core/passkey';
import { YOUR_PROFILE } from '$lib/questions/your-profile';
import { saveAnswers } from '$lib/answers';

export { JUST_FOR_ME };

/** The details, in the order a profile reads, with the words a person would use. */
export const DETAILS: { id: string; label: string; kind: 'text' | 'longtext' | 'picture' | 'cover'; hint?: string; required?: boolean }[] = [
	{ id: 'q:person/cover', label: 'Cover image', kind: 'cover' },
	{ id: 'q:person/picture', label: 'Your picture', kind: 'picture' },
	{ id: 'q:person/called', label: 'Your name', kind: 'text', required: true },
	{ id: 'q:person/role', label: 'What you do', kind: 'text', hint: 'However you’d say it out loud: “sound engineer”.' },
	{ id: 'q:org/name', label: 'Who for', kind: 'text', hint: 'A company, a practice, or your own name.' },
	{ id: 'q:person/near', label: 'Roughly where you are', kind: 'text', hint: 'A town or a region — never an address.' },
	{ id: 'q:person/site', label: 'Your page', kind: 'text', hint: '“darkolive.co.uk” is enough.' },
	{ id: 'q:person/about', label: 'About you', kind: 'longtext' },
	{ id: 'q:person/email', label: 'Email', kind: 'text', hint: 'A button on your card opens their email to you.' },
	{ id: 'q:person/phone', label: 'Phone', kind: 'text', hint: 'A Call button on your card. Include +44 if you’ll share it abroad.' },
	{ id: 'q:person/whatsapp', label: 'WhatsApp', kind: 'text', hint: 'A WhatsApp button on your card. The number, with +44.' }
];
export const LABEL = Object.fromEntries(DETAILS.map((d) => [d.id, d.label]));

/** What you've said now: the newest value of each detail, across every answering. */
export function profileNow(answers: AnswerSet[], did: string): Record<string, AnswerValue> {
	const now: Record<string, { value: AnswerValue; at: string }> = {};
	for (const set of newestPerSet(answers.filter((a) => a.did === did)))
		for (const [id, a] of Object.entries(set.answers)) if (!now[id] || set.at > now[id].at) now[id] = { value: a.value, at: set.at };
	return Object.fromEntries(Object.entries(now).map(([id, v]) => [id, v.value]));
}

export function justForMe(now: Record<string, AnswerValue>): string[] {
	const v = now[JUST_FOR_ME];
	return Array.isArray(v) ? v : [];
}

/** As words, for drawing. */
export const asText = (v: AnswerValue | undefined): string =>
	v === undefined ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);

/** Save the profile: a new answering, signed, kept; the old one stays as evidence. */
export async function saveProfile(identity: Identity, values: Record<string, string>, privateIds: string[]) {
	const clean: Record<string, unknown> = {};
	for (const d of DETAILS) if (values[d.id]?.trim()) clean[d.id] = values[d.id].trim();
	const kept = privateIds.filter((id) => clean[id] !== undefined);
	if (kept.length) clean[JUST_FOR_ME] = kept;
	return saveAnswers(identity, YOUR_PROFILE, clean);
}
