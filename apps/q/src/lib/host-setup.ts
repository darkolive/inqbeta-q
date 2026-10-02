/*
 * Setting up this computer's host, from the browser side (ADR-Q-018 §1–2).
 *
 * Only ever on a development copy: the deployed Q has no /api/host and never
 * runs set-up. The founding itself happens here, in the browser, with the
 * passkey — the same founding every federation has (foundFromDraft) — and the
 * server is handed only what is public: the host file and the logo.
 */
import { dev } from '$app/environment';
import { newDraft, type FederationDraft } from '@inqbeta/q-core/federations';
import { sealWith } from '@inqbeta/q-core/seal';
import type { Identity } from '@inqbeta/q-core/passkey';
import { foundFromDraft, invite } from '$lib/federations';
import { HOME_SCHEMA, type HomeFile } from '$lib/home';

export interface LocalHost {
	local: true;
	mark: { federation: string; founder: string; how: 'founded' | 'claimed'; at: string } | null;
	/** The host file this copy came with, if any. */
	file: { federation: string; name: string; founder: string | null; holds: boolean } | null;
}

/** What this copy has. Null on a deployed site, or if the dev server can't say. */
export async function localHost(): Promise<LocalHost | null> {
	if (!dev) return null;
	try {
		const r = await fetch('/api/host', { cache: 'no-store' });
		return r.ok ? ((await r.json()) as LocalHost) : null;
	} catch {
		return null;
	}
}

async function said(r: Response): Promise<string> {
	try {
		const b = (await r.json()) as { message?: string };
		return b.message ?? `The set-up server said no (${r.status}).`;
	} catch {
		return `The set-up server said no (${r.status}).`;
	}
}

export interface HostAnswers {
	name: string;
	purpose: string;
	agreement: string;
	/** A data: URL, already made small (logoFrom). */
	logo?: string;
}

/** The draft a host is founded from: open to anyone, sends news, an association. */
export function hostDraft(a: HostAnswers): FederationDraft {
	return {
		...newDraft(),
		name: a.name.trim(),
		purpose: a.purpose.trim(),
		agreement: a.agreement.trim(),
		strand: 'association',
		joinPolicy: 'open',
		notifies: true
	};
}

/**
 * Found the host: sign the founding with the passkey (kept in the vault, as
 * every federation is), make the standing invitation, and hand the public
 * host file and logo to this computer's dev server.
 */
export async function foundHost(identity: Identity, a: HostAnswers): Promise<{ ok: true; federation: string } | { ok: false; says: string }> {
	const founded = await foundFromDraft(identity, hostDraft(a));
	if (!founded.ok) return { ok: false, says: founded.says };
	const record = founded.record;
	const inv = await invite(identity, record, { for: 'Everyone who signs up', days: 90 });
	if (!inv.ok) return { ok: false, says: inv.says };
	const file: HomeFile = {
		schema: HOME_SCHEMA,
		federation: record.founding.federation,
		name: record.founding.name,
		purpose: record.manifest.constitution.purpose,
		invitation: inv.link.slice(inv.link.indexOf('#') + 1),
		until: new Date(inv.invitation.offer.exp * 1000).toISOString()
	};
	const r = await fetch('/api/host', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ kind: 'found', file, ...(a.logo ? { logo: a.logo } : {}) })
	});
	if (!r.ok) return { ok: false, says: await said(r) };
	return { ok: true, federation: record.founding.federation };
}

/** "I'm this host's founder": prove it with a fresh signed claim. */
export async function claimHost(identity: Identity, federation: string): Promise<{ ok: true } | { ok: false; says: string }> {
	const proof = await sealWith(identity, { schema: 'inqbeta.host-claim/1', source: 'inqbeta:q/setup', federation, at: new Date().toISOString() });
	const r = await fetch('/api/host', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'claim', proof }) });
	return r.ok ? { ok: true } : { ok: false, says: await said(r) };
}

/**
 * Make a logo small enough to keep: SVG as it is, anything else drawn onto a
 * canvas no bigger than 512 pixels and saved as WebP.
 */
export async function logoFrom(file: File): Promise<{ ok: true; dataUrl: string } | { ok: false; says: string }> {
	if (!file.type.startsWith('image/')) return { ok: false, says: 'That isn’t a picture.' };
	const read = (f: Blob) =>
		new Promise<string>((res, rej) => {
			const fr = new FileReader();
			fr.onload = () => res(String(fr.result));
			fr.onerror = () => rej(fr.error);
			fr.readAsDataURL(f);
		});
	if (file.type === 'image/svg+xml') {
		if (file.size > 512 * 1024) return { ok: false, says: 'That SVG is too big.' };
		return { ok: true, dataUrl: await read(file) };
	}
	try {
		const bmp = await createImageBitmap(file);
		const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bmp.width * scale);
		canvas.height = Math.round(bmp.height * scale);
		canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.9));
		if (!blob) return { ok: false, says: 'That picture couldn’t be read.' };
		return { ok: true, dataUrl: await read(blob) };
	} catch {
		return { ok: false, says: 'That picture couldn’t be read.' };
	}
}
