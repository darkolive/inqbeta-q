/*
 * Q's own checklists (6 October 2026): one per page, or per tab of a page,
 * written from what each page actually does. q-core checks.ts adds the checks
 * every page gets and one per language. Claims and reports live on the host's
 * node (/checks), signed by the tester.
 *
 * To change a list, edit checklists.json: its version changes, and reports on
 * the old version show as out of date, so nothing passes on a list it wasn't
 * tested against.
 */
import LISTS from './checklists.json';
import { checkItem, listVersion, standing, type Checklist, type ClaimReceipt, type ReportReceipt, type Standing } from '@inqbeta/q-core/checks';
import { readHome } from '$lib/home';

export const CHECKLISTS = LISTS as Checklist[];

export const GROUP_NAMES: Record<string, string> = {
	frame: 'Around every page',
	you: 'You',
	vault: 'Vault',
	federations: 'Federations',
	market: 'Market',
	publishing: 'Publishing',
	dostudy: 'DoStudy',
	plugins: 'Plugins',
	settings: 'Settings',
	open: 'Pages anyone can open'
};

export const listById = (id: string) => CHECKLISTS.find((l) => l.id === id) ?? null;

/** A page to open for a list: the route itself, unless it needs a value (then null, and the list's "needs" says what). */
export const pageHref = (l: Checklist) => (l.page === '*' || l.page.includes('[') || l.page === '/federations/one' ? null : l.page);

export async function checksNode(): Promise<string | null> {
	const home = await readHome().catch(() => null);
	return home?.ok && home.services.storage ? home.services.storage.replace(/\/$/, '') : null;
}

/** Every claim and report the node keeps, each checked here. */
export async function readChecks(): Promise<(ClaimReceipt | ReportReceipt)[]> {
	const node = await checksNode();
	if (!node) return [];
	const r = await fetch(`${node}/checks`).catch(() => null);
	const items = r?.ok ? (((await r.json().catch(() => null)) as { items?: unknown[] } | null)?.items ?? []) : [];
	const out: (ClaimReceipt | ReportReceipt)[] = [];
	for (const x of items) if ((await checkItem(x)).ok) out.push(x as ClaimReceipt | ReportReceipt);
	return out;
}

export async function standings(items: (ClaimReceipt | ReportReceipt)[]): Promise<Map<string, Standing>> {
	const out = new Map<string, Standing>();
	for (const l of CHECKLISTS) out.set(l.id, standing(l, await listVersion(l), items));
	return out;
}

/** Send a signed claim or report to the node. */
export async function sendCheck(x: ClaimReceipt | ReportReceipt): Promise<{ ok: true } | { ok: false; says: string }> {
	const node = await checksNode();
	if (!node) return { ok: false, says: 'This host has no storage node to keep test reports yet.' };
	const r = await fetch(`${node}/checks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(x) }).catch(() => null);
	if (r?.ok) return { ok: true };
	const body = r ? ((await r.json().catch(() => ({}))) as { says?: string }) : {};
	return { ok: false, says: body.says ?? (r ? `The node said ${r.status}.` : 'The node didn’t answer.') };
}
