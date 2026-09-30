/*
 * Pages, in and out of the folder.
 *
 * A page is written like every other receipt: the COMPILED page (q-core/
 * pages.ts), signed by the passkey, locked, in the folder. Publishing again
 * writes a new one — what was shared before keeps its own address, and anybody
 * holding a link to it still sees what they were given.
 *
 * WHAT IS STORED IS THE PUBLISHED PAGE, NOT THE DRAFT. The draft is a list of
 * blocks somebody is still moving around; the published page is the merged,
 * self-contained thing with one address. Storing the draft would mean a page
 * whose meaning depends on what else is in the folder, which is the lookup
 * publishing exists to remove.
 */
import { publish, type Page, type Published } from '@inqbeta/q-core/pages';
import type { Block, Plugin } from '@inqbeta/q-core/blocks';
import { seal } from '@inqbeta/q-core/seal';
import { readItem, saveLocked, type FolderItem } from '@inqbeta/q-core/folder';
import type { Identity } from '@inqbeta/q-core/passkey';

export const PAGE_SOURCE = 'inqbeta:page/1';

export async function savePage(
	identity: Identity,
	called: string,
	blocks: Block[],
	plugins: Plugin[] = []
): Promise<({ ok: true; storedAs: string } & Published) | { ok: false; says: string }> {
	const built = await publish(called, blocks, plugins);
	if (!built.ok) {
		const detail = built.wrong.map((w) => (w.at ? `Block ${w.at}: ${w.says}` : w.says)).join(' ');
		return { ok: false, says: `${built.says} ${detail}`.trim() };
	}

	try {
		const sealed = await seal({ ...built.page, source: PAGE_SOURCE, namespace: 'pages' });
		const storedAs = await saveLocked(
			'pages',
			`page-${called.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`,
			JSON.stringify(sealed, null, 2),
			'application/json'
		);
		return { ok: true, storedAs, page: built.page, address: built.address, reads: built.reads, authors: built.authors };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : 'The page could not be saved.' };
	}
}

/** Read a published page back out of a folder item, or null if it is not one. */
export async function pageFrom(item: FolderItem): Promise<Page | null> {
	try {
		const json = JSON.parse(new TextDecoder().decode((await readItem(item)).data)) as { content?: unknown };
		const content = (json?.content ?? json) as Page;
		return content && content.schema === 'inqbeta.page/1' && Array.isArray(content.blocks) ? content : null;
	} catch {
		return null;
	}
}
