/*
 * The sites this computer can edit through Write — development only.
 *
 * Read from local-sites.json beside this app (gitignored: it names folders on
 * your own disk). Copy local-sites.example.json to start. Paths are relative
 * to that file. No file, no sites: Write simply has nothing local to edit.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type LocalSite = {
	/** The site's pages folder (content/pages). */
	dir: string;
	/** Its image manifest. */
	manifest: string;
	/** Its static folder, for picture thumbnails. */
	static: string;
	/** Where its dev server runs. */
	preview: string;
	/** Section → route prefix. */
	routes: Record<string, string>;
};

export function localSites(): Record<string, LocalSite> {
	const file = path.resolve(process.cwd(), process.env.Q_LOCAL_SITES || 'local-sites.json');
	if (!existsSync(file)) return {};
	const base = path.resolve(file, '..');
	const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, LocalSite>;
	return Object.fromEntries(
		Object.entries(raw).map(([domain, s]) => [
			domain,
			{ ...s, dir: path.resolve(base, s.dir), manifest: path.resolve(base, s.manifest), static: path.resolve(base, s.static) }
		])
	);
}
