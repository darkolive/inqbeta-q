/*
 * Q's navigation, as sections and plugins.
 *
 * Darren, 2026-09-24: "these things we're building out like sites and write
 * … are all kind of plugins … organise it really well so it collapses down
 * into respective icons."
 *
 * So there are two kinds of thing in the menu:
 *
 *   SECTIONS  Q itself — who you are, and your vault. Always
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
	/** Other pages that belong to this link (a hub and the pages it opens). */
	also?: string[];
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

/*
 * Rearranged 3 October 2026, Darren: "You … should be your homepage … no need
 * for overview." Cards are Information ("it's how you inform people");
 * Questions folded into it. Credits and Communication are yours, so they live
 * under You; Communication is a hub for messages and calls. The vault keeps
 * files, receipts and backups. Exchange is the Market plugin; Federations is a
 * plugin; Plugins has a Marketplace and what's Installed.
 */
export const SECTIONS: NavGroup[] = [
	{
		id: 'you',
		label: 'You',
		icon: 'fingerprint',
		kind: 'section',
		about: 'Your home, your keys, what you tell people, and the people you know',
		links: [
			{ href: '/', label: 'You', icon: 'home' },
			{ href: '/keys', label: 'Keys', icon: 'keys' },
			{ href: '/devices', label: 'Devices', icon: 'devices' },
			{ href: '/cards', label: 'Information', icon: 'card', also: ['/questions'] },
			{ href: '/contacts', label: 'Address book', icon: 'contacts' },
			{ href: '/communication', label: 'Communication', icon: 'message', also: ['/messages', '/call'] },
			{ href: '/balance', label: 'Credits', icon: 'wallet' }
		]
	},
	{
		id: 'vault',
		label: 'Vault',
		icon: 'lock',
		kind: 'section',
		about: 'Your files, your receipts, and your backups',
		links: [
			{ href: '/data', label: 'Files', icon: 'files' },
			{ href: '/receipts', label: 'Receipts', icon: 'receipts' },
			{ href: '/nodes', label: 'Backups', icon: 'nodes' }
		]
	}
];

export const PLUGINS: NavGroup[] = [
	{
		id: 'plugins',
		label: 'Plugins',
		icon: 'plus',
		kind: 'plugin',
		about: 'Find plugins, and see the ones you have',
		links: [
			{ href: '/marketplace', label: 'Marketplace', icon: 'search' },
			{ href: '/plugins', label: 'Installed', icon: 'check' }
		]
	},
	{
		id: 'federations',
		label: 'Federations',
		icon: 'federations',
		kind: 'plugin',
		about: 'The groups you founded and the ones you belong to, and where their work is kept',
		links: [
			{ href: '/federations', label: 'Federations', icon: 'federations' },
			{ href: '/network', label: 'Network', icon: 'network' }
		]
	},
	{
		id: 'market',
		label: 'Market',
		icon: 'exchange',
		kind: 'plugin',
		about: 'Exchanges: what you give and receive',
		links: [{ href: '/exchanges', label: 'Exchange', icon: 'exchange' }]
	},
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

/** Whether `path` is this link's page, one under it, or a page it gathers. */
export function isHereLink(l: NavLink, path: string): boolean {
	return isHere(l.href, path) || !!l.also?.some((h) => isHere(h, path));
}

/** The group the current page belongs to. */
export function groupOf(path: string): NavGroup | undefined {
	return NAV.find((g) => g.links.some((l) => isHereLink(l, path)));
}

/** Installed plugins: everything in the plugins area but the Plugins group itself. */
export const INSTALLED = PLUGINS.filter((g) => g.id !== 'plugins');
