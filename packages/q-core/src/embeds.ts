/*
 * A film or recording, from the link a person would copy.
 *
 * Nobody should have to know that a film is written `youtube:pJWdgRogAcU`.
 * They copy the address from the browser; this reads it. The embed block
 * still holds a provider and an id and never the link — so what is stored
 * cannot be aimed anywhere else (blocks.ts).
 *
 * Pure.
 */
import type { Provider } from './blocks';

export interface MediaLink {
	provider: Provider;
	/** The id the provider knows it by: `pJWdgRogAcU`, `x8f2n8k`, `user/track`. */
	media: string;
}

const ID = /^[A-Za-z0-9_-]+$/;

/** Read a pasted link (or an already-written `provider:id`). null if it is not one we can play. */
export function parseMediaLink(input: string): MediaLink | null {
	const raw = input.trim();
	const written = /^(youtube|vimeo|dailymotion|soundcloud):(.+)$/i.exec(raw);
	if (written) return ok(written[1].toLowerCase() as Provider, written[2]);

	let url: URL;
	try {
		url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
	} catch {
		return null;
	}
	const host = url.hostname.replace(/^(www|m|music)\./, '');
	const parts = url.pathname.split('/').filter(Boolean);

	if (host === 'youtu.be') return ok('youtube', parts[0]);
	if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
		if (url.searchParams.get('v')) return ok('youtube', url.searchParams.get('v')!);
		if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) return ok('youtube', parts[1]);
		return null;
	}
	if (host === 'vimeo.com' || host === 'player.vimeo.com') return ok('vimeo', parts.find((p) => /^\d+$/.test(p)));
	if (host === 'dai.ly') return ok('dailymotion', parts[0]);
	if (host === 'dailymotion.com' || host === 'geo.dailymotion.com') {
		if (url.searchParams.get('video')) return ok('dailymotion', url.searchParams.get('video')!);
		const i = parts.indexOf('video');
		return ok('dailymotion', i >= 0 ? parts[i + 1]?.split('_')[0] : undefined);
	}
	if (host === 'soundcloud.com' && parts.length >= 2) return ok('soundcloud', `${parts[0]}/${parts[1]}`);
	return null;
}

function ok(provider: Provider, media: string | undefined): MediaLink | null {
	if (!media) return null;
	const clean = provider === 'soundcloud' ? media : media.split(/[?&#]/)[0];
	const valid = provider === 'soundcloud' ? clean.split('/').every((p) => ID.test(p.replace(/\./g, ''))) : ID.test(clean);
	return valid ? { provider, media: clean } : null;
}

/** The link a person would open to see it, for showing back to them. */
export function mediaUrl(m: MediaLink): string {
	switch (m.provider) {
		case 'youtube':
			return `https://www.youtube.com/watch?v=${m.media}`;
		case 'vimeo':
			return `https://vimeo.com/${m.media}`;
		case 'dailymotion':
			return `https://www.dailymotion.com/video/${m.media}`;
		case 'soundcloud':
			return `https://soundcloud.com/${m.media}`;
	}
}
