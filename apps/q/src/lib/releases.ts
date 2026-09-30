/*
 * Releasing a site, from Q. The rules are q-core/releases.ts (ADR-Q-003 §5);
 * the building and carrying happen on this computer (api/local-site/release).
 *
 *   build   the site's own build, every file hashed into a map
 *   sign    the map, with the site's authority (/site/publish)
 *   keep    the release in your vault: sites/<domain>/releases/
 *   carry   to Vercel, which serves it — then the live copy is checked
 *
 * A CARRIER is somewhere that serves a release. None is trusted: every file
 * is named by its hash, and the release is signed. What a carrier needs to
 * take a release (for Vercel, a token) is sealed to you in the vault, like
 * the site's key: sites/<domain>/carriers/vercel.json.
 */
import { seal, sealTo, openWith, type SealedToPeople } from '@inqbeta/q-core/seal';
import { saveLocked, readItem, type FolderItem } from '@inqbeta/q-core/folder';
import { signRelease } from '@inqbeta/q-core/releases';
import type { Identity } from '@inqbeta/q-core/passkey';
import { grantOf, type SiteRecord } from '$lib/sites';

export const CARRIER_SCHEMA = 'inqbeta.site-carrier/1';
const TOKEN_SCHEMA = 'inqbeta.carrier-token/1';

export interface CarrierRecord {
	schema: typeof CARRIER_SCHEMA;
	source: 'inqbeta:q/site-carrier';
	site: string;
	domain: string;
	carrier: 'vercel';
	/** The token, sealed to you. */
	sealed: SealedToPeople;
	at: string;
}

export function isCarrierRecord(x: unknown): x is CarrierRecord {
	const r = x as CarrierRecord;
	return !!r && r.schema === CARRIER_SCHEMA && typeof r.site === 'string' && !!r.sealed;
}

export async function keepVercelToken(identity: Identity, site: SiteRecord, token: string): Promise<void> {
	const t = token.trim();
	if (!/^[A-Za-z0-9_-]{8,200}$/.test(t)) throw new Error('That does not look like a Vercel token.');
	const { sealed } = await sealTo({ schema: TOKEN_SCHEMA, carrier: 'vercel', token: t }, [identity.did], `Vercel, for ${site.founding.domain}`);
	const record: CarrierRecord = {
		schema: CARRIER_SCHEMA,
		source: 'inqbeta:q/site-carrier',
		site: site.founding.site,
		domain: site.founding.domain,
		carrier: 'vercel',
		sealed,
		at: new Date().toISOString()
	};
	await saveLocked(`sites/${site.founding.domain}/carriers`, 'vercel.json', JSON.stringify(await seal(record), null, 2), 'application/json');
}

export async function carrierFrom(item: FolderItem): Promise<CarrierRecord | null> {
	try {
		const json = JSON.parse(new TextDecoder().decode((await readItem(item)).data)) as { content?: unknown };
		const c = json?.content ?? json;
		return isCarrierRecord(c) ? c : null;
	} catch {
		return null;
	}
}

async function tokenOf(identity: Identity, carrier: CarrierRecord | null): Promise<string | undefined> {
	if (!carrier) return undefined;
	const opened = await openWith(carrier.sealed, identity);
	if (!opened.ok) throw new Error(`Your Vercel token would not open: ${opened.says}`);
	return (opened.body as { token?: string }).token;
}

export type Step = 'build' | 'sign' | 'carry' | 'done';
export type Released = { ok: true; says: string; at: string; checked: boolean } | { ok: false; says: string; log?: string };

async function call(method: 'POST' | 'PUT', domain: string, body?: unknown) {
	const r = await fetch(`/api/local-site/release?domain=${encodeURIComponent(domain)}`, {
		method,
		headers: { 'content-type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
	return (await r.json().catch(() => ({ ok: false, says: `${r.status}` }))) as Record<string, unknown> & { ok: boolean; says: string; log?: string };
}

/** Build, sign, keep and carry. `onStep` says where it has got to. */
export async function releaseSite(identity: Identity, site: SiteRecord, carrier: CarrierRecord | null, onStep: (s: Step) => void): Promise<Released> {
	try {
		const domain = site.founding.domain;
		onStep('build');
		const built = await call('POST', domain);
		if (!built.ok) return { ok: false, says: built.says, log: built.log };

		onStep('sign');
		const release = await signRelease(identity, built.map as never, { site: site.founding.site, grants: [await grantOf(site)] });
		const stamp = release.signedAt.replace(/[:.]/g, '-');
		await saveLocked(`sites/${domain}/releases`, `${stamp}.json`, JSON.stringify(release, null, 2), 'application/json');

		onStep('carry');
		const carried = await call('PUT', domain, { release, founding: site.founding, token: await tokenOf(identity, carrier) });
		onStep('done');
		if (!carried.ok) return { ok: false, says: carried.says, log: carried.log };
		const proof = carried.proof as { release: boolean; home: boolean };
		return { ok: true, says: carried.says, at: String(carried.at), checked: proof.release && proof.home };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}
