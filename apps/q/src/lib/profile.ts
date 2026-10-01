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
import { profileSet, type OwnDetail, type OwnKind } from '$lib/questions/your-profile';
export type { OwnDetail, OwnKind };
import { saveAnswers } from '$lib/answers';

export { JUST_FOR_ME };

export type DetailKind = 'text' | 'longtext' | 'date' | 'number' | 'yesno' | 'link' | 'picture' | 'cover';
export type Detail = { id: string; label: string; kind: DetailKind; hint?: string; own?: boolean };

/** The details, in the order a profile reads, with the words a person would use. */
export const DETAILS: Detail[] = [
	{ id: 'q:person/cover', label: 'Cover image', kind: 'cover' },
	{ id: 'q:person/picture', label: 'Your picture', kind: 'picture' },
	{ id: 'q:person/first', label: 'First name', kind: 'text' },
	{ id: 'q:person/last', label: 'Last name', kind: 'text' },
	{ id: 'q:person/called', label: 'What people call you', kind: 'text', hint: 'Leave it empty and your card says your first and last name.' },
	{ id: 'q:person/pronouns', label: 'Pronouns', kind: 'text', hint: '“she/her”, “he/him”, “they/them” — however you say them.' },
	{ id: 'q:person/gender', label: 'Gender', kind: 'text', hint: 'In your own words. Starts just for you.' },
	{ id: 'q:person/birthday', label: 'Birthday', kind: 'date', hint: 'Starts just for you.' },
	{ id: 'q:person/role', label: 'What you do', kind: 'text', hint: 'However you’d say it out loud: “sound engineer”.' },
	{ id: 'q:org/name', label: 'Who for', kind: 'text', hint: 'A company, a practice, or your own name.' },
	{ id: 'q:person/near', label: 'Roughly where you are', kind: 'text', hint: 'A town or a region.' },
	{ id: 'q:person/address', label: 'Home address', kind: 'longtext', hint: 'Starts just for you. Only on a card if you put it there.' },
	{ id: 'q:person/about', label: 'About you', kind: 'longtext' },
	{ id: 'q:person/email', label: 'Email', kind: 'text', hint: 'A button on your card opens their email to you.' },
	{ id: 'q:person/phone', label: 'Phone', kind: 'text', hint: 'A Call button on your card. Include +44 if you’ll share it abroad.' },
	{ id: 'q:person/whatsapp', label: 'WhatsApp', kind: 'text', hint: 'A WhatsApp button on your card. The number, with +44.' },
	{ id: 'q:person/site', label: 'Website', kind: 'link', hint: '“darkolive.co.uk” is enough.' }
];

/** Sharper details start as just for you, so filling one in never shows it. */
export const QUIET = ['q:person/address', 'q:person/gender', 'q:person/birthday'];

/** The building blocks: kinds of detail you can add yourself. */
export const OWN_KINDS: { kind: OwnKind; label: string }[] = [
	{ kind: 'text', label: 'Words' },
	{ kind: 'longtext', label: 'A few lines' },
	{ kind: 'date', label: 'A date' },
	{ kind: 'number', label: 'A number' },
	{ kind: 'yesno', label: 'Yes or no' },
	{ kind: 'link', label: 'A web address' },
	{ kind: 'picture', label: 'A picture' }
];

/** Your own details, read back from your profile. */
export function ownDetails(now: Record<string, AnswerValue>): OwnDetail[] {
	try {
		const list = JSON.parse(String(now['q:profile/own-details'] ?? '[]')) as OwnDetail[];
		return Array.isArray(list) ? list.filter((d) => d && /^q:own\/[a-z0-9-]+$/.test(d.id) && d.label) : [];
	} catch {
		return [];
	}
}

/** Every detail: Q's, then yours. */
export function allDetails(own: OwnDetail[]): Detail[] {
	return [...DETAILS, ...own.map((d) => ({ id: d.id, label: d.label, kind: d.kind, own: true }))];
}

/** A fresh id for a detail you're adding: readable, and never one you've used. */
export function newOwnId(label: string, taken: string[]): string {
	const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'detail';
	let id = `q:own/${base}`;
	for (let n = 2; taken.includes(id); n++) id = `q:own/${base}-${n}`;
	return id;
}

/** Your name for a card: what people call you, else first and last. */
export function nameFrom(v: Record<string, string>): string {
	return v['q:person/called']?.trim() || [v['q:person/first'], v['q:person/last']].filter((x) => x?.trim()).join(' ').trim();
}

/**
 * Labels for details a holder's Q wouldn't know (your own ones), carried with a
 * card as one extra entry so they travel wherever the card goes.
 */
export const LABELS_KEY = 'q:card/labels';
export function withLabels(details: Record<string, string>, own: OwnDetail[]): Record<string, string> {
	const used = own.filter((d) => details[d.id] !== undefined);
	return used.length ? { ...details, [LABELS_KEY]: JSON.stringify(Object.fromEntries(used.map((d) => [d.id, { label: d.label, kind: d.kind }]))) } : details;
}

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
export async function saveProfile(identity: Identity, values: Record<string, string>, privateIds: string[], own: OwnDetail[] = []) {
	const clean: Record<string, unknown> = {};
	for (const d of allDetails(own)) {
		const v = values[d.id]?.trim();
		if (!v) continue;
		clean[d.id] = d.kind === 'yesno' ? v === 'yes' : v;
	}
	/* Your card always has a name: what people call you, else first and last. */
	const name = nameFrom(values);
	if (name) clean['q:person/called'] = name;
	const keptOwn = own.filter((d) => clean[d.id] !== undefined);
	if (keptOwn.length) clean['q:profile/own-details'] = JSON.stringify(keptOwn);
	const kept = privateIds.filter((id) => clean[id] !== undefined);
	if (kept.length) clean[JUST_FOR_ME] = kept;
	return saveAnswers(identity, profileSet(keptOwn), clean);
}
