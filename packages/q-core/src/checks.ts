/*
 * Testing Q, page by page (6 October 2026).
 *
 * Darren: "every dashboard title, menu item, needs a checklist of all the
 * tests to go through to confirm … what AI can go through and run and confirm
 * 100%, but also as a human verifying a run through … translation … final
 * proofreads … that can share out jobs as well, because each of those can be
 * taken by somebody who tests, confirms, and reports back any issue."
 *
 *   checklist   one page, or one tab of a page: its own checks, then the
 *               checks every page gets, then one per language.
 *   claim       "I'll take this one": signed, for two days.
 *   report      what you found, check by check (passed, a problem, or not
 *               checked), signed. By a person, or by the AI runner with its
 *               own key. A report names the checklist's version, so a report
 *               on an older list shows as out of date rather than passing.
 *
 * Testers are whoever the host's door lets in (tester passes, ADR-Q-034): the
 * node keeps claims and reports only from them.
 *
 * Pure: no storage, no window.
 */
import { canonical, sha256 } from './canonical';
import { checkReceipt, sealWith, type SealedReceipt } from './seal';
import type { Identity } from './passkey';

export type How = 'ai' | 'human' | 'both';
export type Area = 'works' | 'layout' | 'words' | 'access' | 'money' | 'safety' | 'languages';
export interface Check {
	id: string;
	says: string;
	how: How;
	area: Area;
}
export interface Checklist {
	id: string;
	/** The route, e.g. /balance/[mint]; '*' for the frame around every page. */
	page: string;
	tab?: string;
	title: string;
	group: string;
	/** What the tester needs first. */
	needs: string;
	checks: Check[];
}

export const AREAS: Record<Area, string> = {
	works: 'Does it work',
	safety: 'Safe and right',
	money: 'Money',
	layout: 'Layout',
	access: 'Everyone can use it',
	words: 'Words',
	languages: 'Languages'
};

/** What every page is checked for, whatever it does. */
export const EVERY_PAGE: Check[] = [
	{ id: 'every-loads', says: 'It opens with no errors in the browser console and no blank or half-drawn screen.', how: 'ai', area: 'works' },
	{ id: 'every-title', says: 'It has one main heading, and the browser tab names the page.', how: 'ai', area: 'works' },
	{ id: 'every-signed-out', says: 'Signed out, it shows what anyone may read or asks you to sign in; it never breaks.', how: 'ai', area: 'works' },
	{ id: 'every-phone', says: 'At phone width (390 pixels) nothing scrolls sideways and nothing overlaps.', how: 'ai', area: 'layout' },
	{ id: 'every-wide', says: 'On a wide screen it uses the space well, and lines of text aren’t too long to read comfortably.', how: 'human', area: 'layout' },
	{ id: 'every-dark', says: 'In dark mode every word, icon and picture can be read and seen.', how: 'both', area: 'layout' },
	{ id: 'every-looks-like-q', says: 'It looks like the rest of Q: the same styles, and each colour keeps its one meaning.', how: 'human', area: 'layout' },
	{ id: 'every-keyboard', says: 'Everything can be reached and used with the keyboard alone, and you can always see where you are.', how: 'both', area: 'access' },
	{ id: 'every-targets', says: 'Every button and link is big enough to tap (at least 44 pixels tall).', how: 'ai', area: 'access' },
	{ id: 'every-alt', says: 'Every picture has words for a screen reader, or is marked as decoration.', how: 'ai', area: 'access' },
	{ id: 'every-no-placeholders', says: 'No box you type into has grey example text inside it.', how: 'ai', area: 'access' },
	{ id: 'every-contrast', says: 'Text stands out clearly from what’s behind it, in light and dark.', how: 'both', area: 'access' },
	{ id: 'every-screen-reader', says: 'With a screen reader on, the page reads in a sensible order and every button says what it does.', how: 'human', area: 'access' },
	{ id: 'every-proofread', says: 'Proofread: spelling, grammar and punctuation, in British English.', how: 'human', area: 'words' },
	{ id: 'every-plain', says: 'Plain words: one thing at a time, it says what to do next, no jargon, nothing alarming.', how: 'human', area: 'words' }
];

/** The languages Q speaks besides English, each proofread by someone who speaks it. */
export const CHECK_LANGUAGES = [
	{ code: 'cy', name: 'Welsh' },
	{ code: 'fr', name: 'French' },
	{ code: 'de', name: 'German' },
	{ code: 'es', name: 'Spanish' },
	{ code: 'zh', name: 'Simplified Chinese' }
] as const;

export const LANGUAGE_CHECKS: Check[] = [
	{ id: 'lang-keys', says: 'In every language, no label shows as a raw key or is left blank.', how: 'ai', area: 'languages' },
	...CHECK_LANGUAGES.map((l) => ({ id: `lang-${l.code}`, says: `In ${l.name}: it reads naturally, means the same as the English, and nothing is left in English or cut off.`, how: 'human' as const, area: 'languages' as const }))
];

/** Every check for a list: its own, then every page's, then the languages. */
export function allChecks(l: Checklist): Check[] {
	return [...l.checks, ...EVERY_PAGE, ...LANGUAGE_CHECKS];
}

/** A list's version: changing any check changes it. */
export async function listVersion(l: Checklist): Promise<string> {
	return (await sha256(canonical({ id: l.id, page: l.page, checks: allChecks(l) }))).slice(0, 16);
}

export const CLAIM_SCHEMA = 'inqbeta.check-claim/1';
export const REPORT_SCHEMA = 'inqbeta.check-report/1';
export const CLAIM_DAYS = 2;
const LIST_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

export interface Claim {
	schema: typeof CLAIM_SCHEMA;
	list: string;
	version: string;
	/** A person, or the AI runner. */
	by: 'human' | 'ai';
	name?: string;
	until: string;
	at: string;
}
export type Outcome = 'pass' | 'fail' | 'skip';
export interface Result {
	check: string;
	outcome: Outcome;
	/** What went wrong, or why it wasn't checked. */
	note?: string;
}
export interface Report {
	schema: typeof REPORT_SCHEMA;
	list: string;
	version: string;
	by: 'human' | 'ai';
	name?: string;
	/** Where it was tested, and the Q it ran. */
	site: string;
	runs?: { release?: string; commit?: string };
	/** Phone, browser, screen reader: what it was tested on. */
	device?: string;
	results: Result[];
	at: string;
}
export type ClaimReceipt = SealedReceipt & { content: Claim };
export type ReportReceipt = SealedReceipt & { content: Report };
type Signer = Pick<Identity, 'did' | 'publicKey' | 'signing'>;

export async function claim(who: Signer, l: Checklist, o: { by?: 'human' | 'ai'; name?: string } = {}, now = new Date()): Promise<ClaimReceipt> {
	const content: Claim = {
		schema: CLAIM_SCHEMA,
		list: l.id,
		version: await listVersion(l),
		by: o.by ?? 'human',
		...(o.name?.trim() ? { name: o.name.trim().slice(0, 80) } : {}),
		until: new Date(now.getTime() + CLAIM_DAYS * 86_400_000).toISOString(),
		at: now.toISOString()
	};
	return (await sealWith(who, content)) as ClaimReceipt;
}

export async function report(
	who: Signer,
	l: Checklist,
	o: { by?: 'human' | 'ai'; name?: string; site: string; runs?: Report['runs']; device?: string; results: Result[] },
	now = new Date()
): Promise<ReportReceipt> {
	const known = new Set(allChecks(l).map((c) => c.id));
	const results = o.results.filter((r) => known.has(r.check));
	if (!results.length) throw new Error('Nothing was checked.');
	if (results.some((r) => r.outcome === 'fail' && !r.note?.trim())) throw new Error('Say what went wrong for each problem.');
	const content: Report = {
		schema: REPORT_SCHEMA,
		list: l.id,
		version: await listVersion(l),
		by: o.by ?? 'human',
		...(o.name?.trim() ? { name: o.name.trim().slice(0, 80) } : {}),
		site: o.site,
		...(o.runs ? { runs: o.runs } : {}),
		...(o.device?.trim() ? { device: o.device.trim().slice(0, 120) } : {}),
		results: results.map((r) => ({ check: r.check, outcome: r.outcome, ...(r.note?.trim() ? { note: r.note.trim().slice(0, 2000) } : {}) })),
		at: now.toISOString()
	};
	return (await sealWith(who, content)) as ReportReceipt;
}

/** Is this a claim or report the node may keep: well formed and signed? */
export async function checkItem(x: unknown): Promise<{ ok: true; kind: 'claim' | 'report' } | { ok: false; says: string }> {
	const r = x as SealedReceipt & { content: Claim | Report };
	const c = r?.content;
	if (c?.schema !== CLAIM_SCHEMA && c?.schema !== REPORT_SCHEMA) return { ok: false, says: 'This isn’t a claim or a test report.' };
	if (!LIST_ID.test(String(c.list)) || typeof c.version !== 'string' || (c.by !== 'human' && c.by !== 'ai')) return { ok: false, says: 'It doesn’t name a checklist.' };
	if (c.schema === REPORT_SCHEMA && (!Array.isArray(c.results) || !c.results.length || c.results.length > 200)) return { ok: false, says: 'It reports nothing.' };
	if (!(await checkReceipt(r)).ok) return { ok: false, says: 'It isn’t signed by who it says.' };
	return { ok: true, kind: c.schema === CLAIM_SCHEMA ? 'claim' : 'report' };
}

export type State = 'open' | 'claimed' | 'passed' | 'issues' | 'part' | 'out-of-date';
export interface Problem {
	check: string;
	says: string;
	note: string;
	by: 'human' | 'ai';
	tester: string;
	name?: string;
	at: string;
}
export interface Standing {
	list: string;
	state: State;
	/** The claim that's running, if any. */
	claimed?: { tester: string; name?: string; until: string; by: 'human' | 'ai' };
	latest: { human?: ReportReceipt; ai?: ReportReceipt };
	/** Checks the latest reports passed, of all of them. */
	passed: number;
	total: number;
	problems: Problem[];
}

/**
 * How a list stands, from the claims and reports kept for it (already checked
 * by the caller). The latest report by a person and the latest by the AI are
 * read together: a check passes if either passed it and neither found a
 * problem; a problem in either shows.
 */
export function standing(l: Checklist, version: string, items: (ClaimReceipt | ReportReceipt)[], now = new Date()): Standing {
	const mine = items.filter((x) => x.content.list === l.id).sort((a, b) => a.content.at.localeCompare(b.content.at));
	const reports = mine.filter((x): x is ReportReceipt => x.content.schema === REPORT_SCHEMA);
	const claims = mine.filter((x): x is ClaimReceipt => x.content.schema === CLAIM_SCHEMA);
	const current = reports.filter((r) => r.content.version === version);
	const latest = { human: current.filter((r) => r.content.by === 'human').at(-1), ai: current.filter((r) => r.content.by === 'ai').at(-1) };
	const checks = allChecks(l);
	const says = new Map(checks.map((c) => [c.id, c.says]));
	const outcome = new Map<string, Outcome>();
	const problems: Problem[] = [];
	for (const r of [latest.ai, latest.human]) {
		if (!r) continue;
		for (const res of r.content.results) {
			if (!says.has(res.check)) continue;
			if (res.outcome === 'fail') {
				outcome.set(res.check, 'fail');
				problems.push({ check: res.check, says: says.get(res.check)!, note: res.note ?? '', by: r.content.by, tester: r.did, ...(r.content.name ? { name: r.content.name } : {}), at: r.content.at });
			} else if (res.outcome === 'pass' && outcome.get(res.check) !== 'fail') outcome.set(res.check, 'pass');
		}
	}
	const passed = checks.filter((c) => outcome.get(c.id) === 'pass').length;
	const last = mine.at(-1);
	const running = claims.filter((c) => Date.parse(c.content.until) > now.getTime() && !reports.some((r) => r.did === c.did && r.content.at > c.content.at)).at(-1);
	const claimed = running ? { tester: running.did, ...(running.content.name ? { name: running.content.name } : {}), until: running.content.until, by: running.content.by } : undefined;
	let state: State;
	if (problems.length) state = 'issues';
	else if (passed === checks.length) state = 'passed';
	else if (claimed) state = 'claimed';
	else if (passed > 0) state = 'part';
	else if (reports.length && !current.length && last) state = 'out-of-date';
	else state = 'open';
	return { list: l.id, state, ...(claimed ? { claimed } : {}), latest, passed, total: checks.length, problems };
}

export const STATE_WORDS: Record<State, string> = {
	open: 'Not started',
	claimed: 'Being tested',
	part: 'Partly done',
	passed: 'Passed',
	issues: 'Problems found',
	'out-of-date': 'List changed since tested'
};
