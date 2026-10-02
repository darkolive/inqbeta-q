/*
 * Read marks and the notifications card, kept in your vault as well as in
 * the browser (questions/your-settings.ts says why).
 *
 * Loading: the newest answering of Your settings, merged with what this
 * browser holds. Saving: a moment after the last change (one answering for a
 * burst of clicks, not one per click), only when something actually changed,
 * and never when there is no vault open — the browser copy carries on alone.
 */
import { newestPerSet, type AnswerSet } from '@inqbeta/q-core/questions';
import type { Identity } from '@inqbeta/q-core/passkey';
import { YOUR_SETTINGS } from '$lib/questions/your-settings';
import { saveAnswers } from '$lib/answers';
import type { Reach } from '$lib/notify';
import type { PluginPrefs } from '$lib/plugins.svelte';

export interface KeptSettings {
	read: string[];
	notify: Record<string, Reach>;
	plugins?: PluginPrefs;
}

export function keptFrom(answers: AnswerSet[], did: string): KeptSettings | null {
	const set = newestPerSet(answers.filter((a) => a.did === did && a.setId === YOUR_SETTINGS.id))[0];
	if (!set) return null;
	const read = set.answers['q:settings/read']?.value;
	let notify: Record<string, Reach> = {};
	try {
		notify = JSON.parse(String(set.answers['q:settings/notify']?.value ?? '{}'));
	} catch {
		/* an unreadable card is an empty one */
	}
	let plugins: PluginPrefs | undefined;
	try {
		const raw = set.answers['q:settings/plugins']?.value;
		plugins = raw ? JSON.parse(String(raw)) : undefined;
	} catch {
		plugins = undefined;
	}
	return { read: Array.isArray(read) ? read : [], notify, plugins };
}

const same = (a: KeptSettings, b: KeptSettings) =>
	JSON.stringify([[...a.read].sort(), Object.entries(a.notify).sort(), a.plugins ?? null]) === JSON.stringify([[...b.read].sort(), Object.entries(b.notify).sort(), b.plugins ?? null]);

let last: KeptSettings | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** What the vault holds now, so a save that changes nothing is skipped. */
export function knownKept(k: KeptSettings | null): void {
	last = k;
}

export function keepSoon(identity: Identity, next: KeptSettings, canSave: boolean): void {
	if (!canSave) return;
	/* Read marks only ever grow: one browser never un-reads another's. */
	next = { ...next, read: [...new Set([...(last?.read ?? []), ...next.read])] };
	if (last && same(last, next)) return;
	if (timer) clearTimeout(timer);
	timer = setTimeout(async () => {
		timer = null;
		if (last && same(last, next)) return;
		const values: Record<string, unknown> = {};
		if (next.read.length) values['q:settings/read'] = next.read;
		if (Object.keys(next.notify).length) values['q:settings/notify'] = JSON.stringify(next.notify);
		if (next.plugins && (next.plugins.order.length || next.plugins.off.length)) values['q:settings/plugins'] = JSON.stringify(next.plugins);
		if (!Object.keys(values).length) return;
		const out = await saveAnswers(identity, YOUR_SETTINGS, values).catch(() => null);
		if (out?.ok) last = next;
	}, 1500);
}
