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
import { HOST_SENT_SCHEMA, HOST_SERVICE_SCHEMA, endsOf, isSecret, type HostSentRecord, type HostServiceRecord, type ServiceState } from '$lib/host-services';

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

/** Which services this copy has keys for, and whether a restart is waiting. Null on a deployed site. */
export async function hostServices(): Promise<{ services: ServiceState[]; restart: boolean } | null> {
	if (!dev) return null;
	try {
		const r = await fetch('/api/host/services', { cache: 'no-store' });
		return r.ok ? ((await r.json()) as { services: ServiceState[]; restart: boolean }) : null;
	} catch {
		return null;
	}
}

/**
 * Set one service setting on this computer: sign a record naming it (and
 * never more of a secret than its last four), then hand both to this copy's
 * dev server, which writes .env and keeps the record.
 */
export async function setService(identity: Identity, host: string, service: string, setting: string, value: string): Promise<{ ok: true } | { ok: false; says: string }> {
	const record: HostServiceRecord = {
		schema: HOST_SERVICE_SCHEMA,
		source: 'inqbeta:q/host',
		host,
		service,
		setting,
		ends: endsOf(value, isSecret(setting)),
		at: new Date().toISOString()
	};
	const signed = await sealWith(identity, record);
	const r = await fetch('/api/host/services', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ record: signed, value: value.trim() }) });
	return r.ok ? { ok: true } : { ok: false, says: await said(r) };
}

/** A random value for a setting Q makes for you: 32 bytes for the seed, 48 for the sign-in secret, base64url. */
export function madeForYou(setting: string): string {
	const bytes = crypto.getRandomValues(new Uint8Array(setting === 'Q_SERVICE_SEED' ? 32 : 48));
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Save a renewed host file straight into this copy (development only). */
export async function renewHost(file: HomeFile): Promise<{ ok: true } | { ok: false; says: string }> {
	const r = await fetch('/api/host', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'renew', file }) });
	return r.ok ? { ok: true } : { ok: false, says: await said(r) };
}

export interface VercelView {
	connected: boolean;
	project?: string;
	says?: string;
	settings?: { key: string; target: string[]; type: string; updatedAt?: number }[];
	others?: number;
}

/** What the live site's Vercel project has, by name only. Null on a deployed site. */
export async function hostVercel(): Promise<VercelView | null> {
	if (!dev) return null;
	try {
		const r = await fetch('/api/host/vercel', { cache: 'no-store' });
		return r.ok ? ((await r.json()) as VercelView) : null;
	} catch {
		return null;
	}
}

/** Send one setting from this computer's .env to the live site. The page signs; it never sees the key. */
export async function sendSetting(identity: Identity, host: string, setting: string, ends: string, project: string): Promise<{ ok: true; places: number } | { ok: false; says: string }> {
	const record: HostSentRecord = { schema: HOST_SENT_SCHEMA, source: 'inqbeta:q/host', host, setting, ends, to: 'vercel', project, at: new Date().toISOString() };
	const signed = await sealWith(identity, record);
	const r = await fetch('/api/host/vercel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ record: signed }) });
	if (!r.ok) return { ok: false, says: await said(r) };
	return { ok: true, places: ((await r.json()) as { places: number }).places };
}
