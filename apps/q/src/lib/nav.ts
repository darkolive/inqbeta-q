/*
 * Q's navigation, as sections and plugins.
 *
 * Darren, 2026-09-24: "these things we're building out like sites and write
 * … are all kind of plugins … organise it really well so it collapses down
 * into respective icons."
 *
 * So there are two kinds of thing in the menu:
 *
 *   SECTIONS  Q itself — who you are, your vault, energy, federations. Always
 *             there, in this order.
 *   PLUGINS   things Q can do that it did not have to: publishing websites,
 *             DoStudy's courses. Each declares its own name, icon and pages,
 *             and is listed after the sections. Adding one is adding an entry
 *             here; nothing else in the shell changes.
 *
 * Every group has an icon, so the whole menu folds down to one icon per
 * group, and opens out beside it on a click.
 *
 * No placeholder links. A menu item that goes nowhere is a promise the page
 * does not keep.
 */
import type { IconName } from '@inqbeta/q-ui';

export interface NavLink {
	href: string;
	label: string;
	icon: IconName;
}

export interface NavGroup {
	id: string;
	label: string;
	icon: IconName;
	/** Sections are Q; plugins are added to it. */
	kind: 'section' | 'plugin';
	/** One line on what the group is for — shown when it is folded. */
	about: string;
	links: NavLink[];
}

export const SECTIONS: NavGroup[] = [
	{
		id: 'you',
		label: 'You',
		icon: 'fingerprint',
		kind: 'section',
		about: 'Your identity, your keys and what you show',
		links: [
			{ href: '/', label: 'Overview', icon: 'overview' },
			{ href: '/keys', label: 'Keys', icon: 'keys' },
			{ href: '/devices', label: 'Devices', icon: 'devices' },
			{ href: '/cards', label: 'Cards', icon: 'card' },
			{ href: '/questions', label: 'Questions', icon: 'info' },
			{ href: '/contacts', label: 'Address book', icon: 'contacts' }
		]
	},
	{
		id: 'vault',
		label: 'Vault',
		icon: 'lock',
		kind: 'section',
		about: 'What you keep, and where copies of it are',
		links: [
			{ href: '/data', label: 'Files', icon: 'files' },
			{ href: '/receipts', label: 'Receipts', icon: 'receipts' },
			{ href: '/nodes', label: 'Backups', icon: 'nodes' },
			{ href: '/network', label: 'Network', icon: 'network' }
		]
	},
	{
		id: 'energy',
		label: 'Energy',
		icon: 'activity',
		kind: 'section',
		about: 'What you give and receive',
		links: [
			{ href: '/exchanges', label: 'Exchange', icon: 'exchange' },
			{ href: '/balance', label: 'Balance sheet', icon: 'balance' }
		]
	},
	{
		id: 'communication',
		label: 'Communication',
		icon: 'message',
		kind: 'section',
		about: 'Talking to people directly, with a receipt that you did',
		links: [{ href: '/call', label: 'Video call', icon: 'video' }]
	},
	{
		id: 'federations',
		label: 'Federations',
		icon: 'federations',
		kind: 'section',
		about: 'The groups you founded and the ones you belong to',
		links: [{ href: '/federations', label: 'Federations', icon: 'federations' }]
	}
];

export const PLUGINS: NavGroup[] = [
	{
		id: 'publishing',
		label: 'Publishing',
		icon: 'documents',
		kind: 'plugin',
		about: 'Websites you own, and the articles on them',
		links: [
			{ href: '/sites', label: 'Sites', icon: 'cloud' },
			{ href: '/write', label: 'Write', icon: 'file' },
			{ href: '/my-pages', label: 'My pages', icon: 'tree' }
		]
	},
	{
		id: 'dostudy',
		label: 'DoStudy',
		icon: 'courses',
		kind: 'plugin',
		about: 'Courses and the evidence you keep for them',
		links: [{ href: '/f/dostudy', label: 'Courses', icon: 'courses' }]
	}
];

export const NAV: NavGroup[] = [...SECTIONS, ...PLUGINS];

/** Whether `path` is this link's page, or a page under it. */
export function isHere(href: string, path: string): boolean {
	return href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
}

/** The group the current page belongs to. */
export function groupOf(path: string): NavGroup | undefined {
	return NAV.find((g) => g.links.some((l) => isHere(l.href, path)));
}
