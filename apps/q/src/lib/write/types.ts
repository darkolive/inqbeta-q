/* Shapes Write's block editor passes around. */
import type { Block } from '@inqbeta/q-core/blocks';

export interface SitePicture {
	address: string;
	path: string;
	thumb: string;
	name: string;
}

/** A block as the editor holds it: settings always present. */
export type EditBlock = Block & { settings: Record<string, string | number | boolean | string[]>; children?: EditBlock[] };

export interface EditorContext {
	pictures: SitePicture[];
	/** Where the site's own files are served from, for thumbnails. */
	origin: string;
}

export const newId = (kind: string) => `${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const say = (b: EditBlock, k: string) => {
	const v = b.settings[`q:block/${k}`];
	return typeof v === 'string' ? v : '';
};
