/** Light or dark. First visit follows the OS; after that the choice sticks. */
export type Mode = 'light' | 'dark';

export const STORAGE_KEY = 'inqbeta-q-mode';

export function systemMode(): Mode {
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function read(): Mode {
	try {
		const v = localStorage.getItem(STORAGE_KEY);
		if (v === 'light' || v === 'dark') return v;
	} catch {
		/* private browsing, blocked storage — fall through to the OS */
	}
	return systemMode();
}

export function write(mode: Mode) {
	try {
		localStorage.setItem(STORAGE_KEY, mode);
	} catch {
		/* not fatal — the choice just won't persist */
	}
}

export function apply(mode: Mode) {
	document.documentElement.classList.toggle('dark', mode === 'dark');
}
