/*
 * The language Q speaks.
 *
 * Deliberately small: a dictionary per language, one reactive choice, and
 * `t(key)`. Templates that call `t` re-render when the choice changes, so a
 * change of language is instant and nothing reloads.
 *
 * The choice is a device preference (storage.ts: `q-lang`) — it survives
 * sign-out, because the next person to sit down is best served by the language
 * the page was last read in. With nothing chosen, the browser's own language
 * is used when Q has it, and English when it does not.
 */
import en, { type Book, type Key } from './en';
import fr from './fr';
import de from './de';
import es from './es';
import cy from './cy';
import zh from './zh';

/** In the order the menu shows them, each named in its own language. */
export const LANGS = [
	{ code: 'en', name: 'English', html: 'en-GB' },
	{ code: 'cy', name: 'Cymraeg', html: 'cy' },
	{ code: 'fr', name: 'Français', html: 'fr' },
	{ code: 'de', name: 'Deutsch', html: 'de' },
	{ code: 'es', name: 'Español', html: 'es' },
	/* Simplified Chinese, in thanks to MiniMax and the Chinese open-source community (1 October 2026). */
	{ code: 'zh', name: '简体中文', html: 'zh-CN' }
] as const;

export type Lang = (typeof LANGS)[number]['code'];
export type { Key };

const BOOKS: Record<Lang, Book> = { en, cy, fr, de, es, zh };
const known = (v: unknown): v is Lang => LANGS.some((l) => l.code === v);

let current = $state<Lang>('en');

function show(l: Lang) {
	current = l;
	if (typeof document !== 'undefined') document.documentElement.lang = LANGS.find((x) => x.code === l)!.html;
}

export const language = {
	get current(): Lang {
		return current;
	},
	/** Chosen on purpose: remembered on this device. */
	choose(l: Lang) {
		show(l);
		try {
			localStorage.setItem('q-lang', l);
		} catch {
			/* Private windows may refuse; the choice still holds for this visit. */
		}
	},
	/** On load: the remembered choice, else the browser's language, else English. */
	start() {
		let saved: string | null = null;
		try {
			saved = localStorage.getItem('q-lang');
		} catch {
			saved = null;
		}
		if (known(saved)) return show(saved);
		/* Chinese in Traditional script (Taiwan, Hong Kong, Macau) is not offered Simplified unasked. */
		const traditional = (x: string) => /^zh-(tw|hk|mo|hant)/i.test(x);
		const asked = (navigator.languages ?? [navigator.language])
			.filter((x) => !traditional(x))
			.map((x) => x.slice(0, 2).toLowerCase())
			.find(known);
		show(asked ?? 'en');
	}
};

/** The words for `key` in the current language, English if it has none. */
export function t(key: Key): string {
	return BOOKS[current][key] ?? en[key];
}
