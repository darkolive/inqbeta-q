/*
 * Your plugins (3 October 2026). Darren: plugins "only appear in the
 * navigation if they're installed … remove them as well, and disappear just
 * by deactivating … make them draggable so you can order them."
 *
 * Which installed plugins are switched on, and their order, are yours: kept in
 * this browser for speed and in your vault with your other settings
 * (lib/kept-settings.ts), so they follow you to any device.
 */
import { INSTALLED, type NavGroup } from './nav';

export interface PluginPrefs {
	/** Plugin ids in the order you set. Any not listed go after, in their usual order. */
	order: string[];
	/** Plugin ids you switched off. */
	off: string[];
}

const KEY = 'q.plugins';
const EMPTY: PluginPrefs = { order: [], off: [] };

function read(): PluginPrefs {
	try {
		const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PluginPrefs | null;
		return p && Array.isArray(p.order) && Array.isArray(p.off) ? p : EMPTY;
	} catch {
		return EMPTY;
	}
}

export const plugins = $state<{ prefs: PluginPrefs }>({ prefs: typeof window === 'undefined' ? EMPTY : read() });

function save(p: PluginPrefs) {
	plugins.prefs = p;
	try {
		localStorage.setItem(KEY, JSON.stringify(p));
	} catch {
		/* kept for this visit, and in the vault */
	}
}

/** Every installed plugin, in your order. */
export function ordered(prefs: PluginPrefs = plugins.prefs): NavGroup[] {
	const rank = (id: string) => {
		const i = prefs.order.indexOf(id);
		return i === -1 ? prefs.order.length + INSTALLED.findIndex((g) => g.id === id) : i;
	};
	return [...INSTALLED].sort((a, b) => rank(a.id) - rank(b.id));
}

/** The plugins that show in the menu: switched on, in your order. */
export function active(prefs: PluginPrefs = plugins.prefs): NavGroup[] {
	return ordered(prefs).filter((g) => !prefs.off.includes(g.id));
}

export function setOn(id: string, on: boolean) {
	const off = new Set(plugins.prefs.off);
	if (on) off.delete(id);
	else off.add(id);
	save({ ...plugins.prefs, off: [...off] });
}

export function setOrder(ids: string[]) {
	save({ ...plugins.prefs, order: ids });
}

/** Move one plugin up or down a place (for keyboards, and as well as dragging). */
export function move(id: string, by: -1 | 1) {
	const ids = ordered().map((g) => g.id);
	const i = ids.indexOf(id);
	const j = i + by;
	if (i < 0 || j < 0 || j >= ids.length) return;
	[ids[i], ids[j]] = [ids[j], ids[i]];
	setOrder(ids);
}

/** Back from the vault after signing in. */
export function restorePlugins(p: PluginPrefs | undefined) {
	if (p && Array.isArray(p.order) && Array.isArray(p.off)) save(p);
}
