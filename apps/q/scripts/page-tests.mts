/*
 * The runner's written tests for pages' own "AI can check" items (6 October
 * 2026). Each is keyed by checklist and check, starts on the list's page,
 * signed out, in a fresh tab, and answers true (it works) or what went wrong.
 * A check with no test here stays "not checked": add one to cover it.
 *
 * Tests read what a person sees (words, buttons by their names, where a link
 * goes), not how the page is built, so they survive a change of look.
 */
import type { Page } from 'playwright';

export interface Ctx {
	page: Page;
	site: string;
	/** Open a path on the site and let it settle. */
	go: (path: string) => Promise<void>;
}
export type Test = (c: Ctx) => Promise<true | string>;

const settle = (page: Page, ms = 600) => page.waitForTimeout(ms);
const body = (page: Page) => page.innerText('body');

/** All these words are on the page. */
const sees =
	(...want: string[]): Test =>
	async ({ page }) => {
		const b = await body(page);
		const missing = want.filter((w) => !b.includes(w));
		return missing.length ? `Didn’t find: “${missing.join('”, “')}”` : true;
	};
/** None of these words are on the page. */
const doesntSee =
	(...not: string[]): Test =>
	async ({ page }) => {
		const b = await body(page);
		const there = not.filter((w) => b.includes(w));
		return there.length ? `Shouldn’t show: “${there.join('”, “')}”` : true;
	};
const all =
	(...tests: Test[]): Test =>
	async (c) => {
		for (const t of tests) {
			const r = await t(c);
			if (r !== true) return r;
		}
		return true;
	};
/** Pressing the link or button named `name` lands on a path containing `to`. */
const goesTo =
	(name: string | RegExp, to: string, within = 'main'): Test =>
	async ({ page }) => {
		const el = page.locator(within).getByRole('link', { name }).first();
		if (!(await el.count())) return `No link called “${name}”.`;
		const href = await el.getAttribute('href');
		if (!href?.includes(to)) return `“${name}” points to ${href}, not ${to}.`;
		return true;
	};
const press = async (page: Page, name: string | RegExp, role: 'button' | 'link' | 'radio' = 'button') => {
	const el = page.getByRole(role, { name }).first();
	await el.click({ timeout: 5000 });
	await settle(page);
};

/** A picture story: Next and Previous step it on and back (Previous greyed on the first picture), and Play turns into Pause. */
const storyPlays: Test = async ({ page }) => {
	const at = async () => (await page.locator('[aria-current="step"]').first().getAttribute('aria-label').catch(() => null)) ?? '';
	const prev = page.getByRole('button', { name: /^Previous$/ }).first();
	const next = page.getByRole('button', { name: /^Next$/ }).first();
	if (!(await next.count())) return 'No story controls (Next) found.';
	if (!(await prev.isDisabled())) return 'Previous should be greyed out on the first picture.';
	const first = await at();
	await next.click();
	await settle(page, 900);
	const second = await at();
	if (first === second) return `Next didn’t move the story on (still ${first || 'no step shown'}).`;
	if (await prev.isDisabled()) return 'Previous stayed greyed out after Next.';
	await prev.click();
	await settle(page, 900);
	if ((await at()) !== first) return 'Previous didn’t go back.';
	/* Play and Pause are one button: pressing it turns one into the other. */
	const toggle = page.getByRole('button', { name: /^(Play|Play again|Pause)$/ }).first();
	if (!(await toggle.count())) return 'No Play or Pause button.';
	const before = await toggle.getAttribute('aria-label');
	await toggle.click();
	await settle(page, 400);
	const after = await page.getByRole('button', { name: /^(Play|Play again|Pause)$/ }).first().getAttribute('aria-label');
	if (before === after) return `Pressing ${before} didn’t change it.`;
	return true;
};

const SIGN_IN = ['Where is your passkey?', 'Lost key'];
const signInShows = sees(...SIGN_IN);
const locked = (...also: string[]) => sees('Locked', ...also);

/** A legal page's own button in the row is marked as the current page. */
const legalCurrent =
	(name: string): Test =>
	async ({ page }) => {
		const el = page.locator('nav').getByRole('link', { name, exact: true }).first();
		return (await el.getAttribute('aria-current')) === 'page' ? true : `“${name}” isn’t marked as the current page.`;
	};
const lastUpdated = sees('Last updated');

export const TESTS: Record<string, Record<string, Test>> = {
	'home-front-door': {
		'sign-in-fills-screen': sees('Where is your passkey?', 'This device', 'Key'),
		'place-hint-changes': async (c) => {
			await c.page.getByRole('radio', { name: 'Key', exact: true }).check({ force: true });
			await settle(c.page);
			return sees('A YubiKey — plug in or tap')(c);
		},
		'first-time-switch': async (c) => {
			await press(c.page, 'First time');
			return sees('Name it (optional)', 'Make my key', 'I have a key')(c);
		},
		'have-key-switch-back': async (c) => {
			await press(c.page, 'First time');
			await press(c.page, 'I have a key');
			return all(sees('Sign in', 'First time'), doesntSee('Name it (optional)'))(c);
		},
		'below-fold-sections': async ({ page }) => {
			const b = await body(page);
			const order = ['What people use', 'Keep'];
			const at = order.map((w) => b.indexOf(w));
			if (at.some((i) => i < 0)) return `Didn’t find: ${order.filter((_, i) => at[i] < 0).join(', ')}`;
			return at[0] < at[1] ? true : 'The sections are out of order.';
		},
		'story-player': storyPlays
	},
	keys: { 'story-plays': storyPlays, 'signed-out-sign-in': all(signInShows, sees('Lost key')) },
	devices: { 'story-plays': storyPlays, 'signed-out-locked': sees('Not signed in') },
	'cards-personal': { 'signed-out': signInShows },
	questions: { 'signed-out': signInShows },
	contacts: { 'story-plays': storyPlays, 'signed-out-locked': locked() },
	communication: {
		'story-plays': storyPlays,
		'messages-tile': goesTo(/Messages/, '/messages'),
		'call-tile': goesTo(/Video call/, '/call'),
		'lead-says-sealed': sees('sealed')
	},
	messages: { 'signed-out': signInShows },
	'call-call': { 'signed-out': signInShows },
	agreements: { 'signed-out': all(signInShows, doesntSee('Write an agreement')) },
	'agreements-new': { 'signed-out': signInShows },
	balance: { 'signed-out': signInShows, 'story-plays': storyPlays },
	data: { 'signed-out-locked': sees('Locked', 'Sign in with my passkey') },
	receipts: { 'signed-out-locked': sees('Locked', 'Sign in with my passkey') },
	'federations-list': { 'signed-out-locked': sees('Locked') },
	'federations-join': {
		'bad-link': async (c) => {
			await c.go('/federations/join#');
			return sees('This link can’t be read')(c);
		}
	},
	network: { 'signed-out': signInShows },
	attest: {
		'bad-link': async (c) => {
			await c.go('/attest#');
			return sees('This link can’t be read')(c);
		}
	},
	directory: {
		cards: async ({ page }) => ((await page.getByRole('link', { name: 'Its receipt' }).count()) || (await body(page)).includes('Nobody listed yet') ? true : 'No cards and no “Nobody listed yet”.'),
		'go-to-site': async (c) => ((await c.page.getByRole('link', { name: 'Its receipt' }).count()) ? goesTo('Go to site', 'http')(c) : true),
		receipt: async (c) => ((await c.page.getByRole('link', { name: 'Its receipt' }).count()) ? goesTo('Its receipt', '/registered/')(c) : true)
	},
	exchanges: { 'signed-out': locked() },
	'publishing-sites': { 'signed-out': signInShows },
	'publishing-write': { 'signed-out': signInShows },
	'publishing-my-pages': { 'signed-out': signInShows },
	'dostudy-courses': { 'signed-out': locked() },
	'settings-identity-security': { 'signed-out': locked() },
	'open-search': {
		blank: sees('Search'),
		'nav-result': async (c) => {
			await c.go('/search?q=receipt');
			return sees('Receipts')(c);
		},
		'settings-result': async (c) => {
			await c.go('/search?q=settings');
			return sees('Settings')(c);
		}
	},
	'open-contact': {
		frame: doesntSee('Fold to icons'),
		lead: all(sees('inbox'), async ({ page }) => (/[\w.+-]+@[\w-]+\.[\w.]+/.test(await page.locator('main').innerText()) ? 'An email address is shown on the page.' : true)),
		required: async ({ page }) => {
			const required = await page.locator('main input[required], main textarea[required]').count();
			return required >= 2 ? true : `Only ${required} boxes are marked required.`;
		},
		'bad-email': async ({ page }) => ((await page.locator('main input[type="email"]').count()) ? true : 'The email box isn’t an email field, so the browser won’t check it.'),
		security: goesTo(/security|privately|advisor/i, 'github.com')
	},
	'open-stories': {
		index: async ({ page }) => ((await page.locator('main ol li, main nav li').count()) >= 2 ? true : 'No list of stories.'),
		link: async (c) => {
			await c.go('/stories#vault');
			return (c.page.url().endsWith('#vault') ? true : `The address became ${c.page.url()}.`) as true | string;
		}
	},
	'open-stories-make': { start: sees('Start a new book') },
	'open-link': { 'signed-out': sees('Sign in to see who'), frame: doesntSee('Fold to icons') },
	'open-legal': {
		list: sees('Privacy', 'Terms', 'Accessibility', 'Licences'),
		links: all(goesTo(/Privacy/, '/legal/privacy', 'article'), goesTo(/Terms/, '/legal/terms', 'article'), goesTo(/Accessibility/, '/legal/accessibility', 'article'), goesTo(/Licences/, '/legal/licences', 'article')),
		tabs: async ({ page }) => ((await page.locator('nav [aria-current="page"]').count()) === 0 ? true : 'A legal button is marked current on /legal.')
	},
	'open-legal-accessibility': { current: legalCurrent('Accessibility'), date: lastUpdated, contact: goesTo(/tell us/i, '/contact', 'article') },
	'open-legal-licences': {
		current: legalCurrent('Licences'),
		parts: sees('Affero', 'Apache', 'Creative Commons', 'Not covered'),
		'source-links': all(goesTo(/LICENSING/, 'github.com', 'article'), goesTo(/NOTICE/, 'github.com', 'article'), goesTo(/TRADEMARKS/, 'github.com', 'article')),
		darkolive: goesTo(/Dark Olive/, 'darkolive.co.uk', 'article')
	},
	'open-legal-privacy': { current: legalCurrent('Privacy'), date: lastUpdated },
	'open-legal-terms': { current: legalCurrent('Terms'), date: lastUpdated, links: all(goesTo(/report it privately/i, 'github.com', 'article'), goesTo(/licences/i, '/legal/licences', 'article')) },
	'open-docs': {
		frame: doesntSee('Fold to icons'),
		shelves: sees('Start here', 'Decisions', 'Origins'),
		links: async ({ page }) => {
			const hrefs = await page.locator('main a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
			const gh = hrefs.filter((h) => h.includes('github.com'));
			return gh.length >= 6 ? true : `Only ${gh.length} links go to the source on GitHub.`;
		},
		'footer-link': goesTo(/Documentation/, '/docs', 'footer')
	},
	'open-channels-google': {
		'no-code': sees('Back to'),
		error: async (c) => {
			await c.go('/channels/google?error=access_denied');
			return sees('Google Drive')(c);
		},
		'back-link': goesTo(/Back to/, '/nodes')
	}
};
