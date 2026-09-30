/*
 * Sites, in and out of the vault. The rules are q-core/sites.ts (ADR-Q-003).
 *
 * One file per site, `sites/<domain>.json`, locked like everything else and
 * signed by the founder:
 *
 *   founding   the two-signature site.founded receipt — public in itself
 *   sealedKey  the site key's seed, sealed to the owner — only their passkey opens it
 *   grant      the site → founder UCAN, as bytes (also kept in ucan/ so the
 *              ordinary token machinery sees it)
 *
 * THE SITE KEY IS AN ASSET, NOT A PART OF YOU (Darren, 2026-09-24). It is not
 * derived from the passkey, so it can be handed on — and so it is lost if the
 * vault is. Q says that when a site is founded, not later.
 */
import { foundSite, checkFounding, openSiteKey, type Founding } from '@inqbeta/q-core/sites';
import { seal, type SealedToPeople } from '@inqbeta/q-core/seal';
import { signerFor, type Identity } from '@inqbeta/q-core/passkey';
import { readItem, saveLocked, type FolderItem } from '@inqbeta/q-core/folder';
import { folderStore, readDelegation, type Delegation } from '@inqbeta/q-core/ucan/index';
import { b64url, unb64url } from '@inqbeta/q-core/canonical';

export const SITE_RECORD_SCHEMA = 'inqbeta.site-record/1';

export interface SiteRecord {
	schema: typeof SITE_RECORD_SCHEMA;
	source: 'inqbeta:q/site';
	founding: Founding;
	sealedKey: SealedToPeople;
	/** The site → founder delegation, UCAN bytes, base64url. */
	grant: string;
}

export function isSiteRecord(x: unknown): x is SiteRecord {
	const r = x as SiteRecord;
	return !!r && r.schema === SITE_RECORD_SCHEMA && !!r.founding && !!r.sealedKey && typeof r.grant === 'string';
}

export async function addSite(
	identity: Identity,
	o: { name: string; domain: string }
): Promise<{ ok: true; record: SiteRecord } | { ok: false; says: string }> {
	try {
		const founded = await foundSite(signerFor(identity), o);
		const record: SiteRecord = {
			schema: SITE_RECORD_SCHEMA,
			source: 'inqbeta:q/site',
			founding: founded.founding,
			sealedKey: founded.sealedKey,
			grant: b64url(founded.grant.bytes)
		};
		const signed = await seal(record);
		await saveLocked('sites', `${founded.founding.domain}.json`, JSON.stringify(signed, null, 2), 'application/json');
		await folderStore.put(founded.grant).catch(() => {
			/* The record carries the grant as well; the token store is a convenience. */
		});
		return { ok: true, record };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

export async function siteFrom(item: FolderItem): Promise<SiteRecord | null> {
	try {
		const json = JSON.parse(new TextDecoder().decode((await readItem(item)).data)) as { content?: unknown };
		const content = json?.content ?? json;
		return isSiteRecord(content) ? content : null;
	} catch {
		return null;
	}
}

export async function grantOf(record: SiteRecord): Promise<Delegation> {
	return readDelegation(unb64url(record.grant));
}

/** Everything that can be said about a site from its record, checked. */
export async function standing(record: SiteRecord, identity: Identity | null) {
	const founding = await checkFounding(record.founding);
	let key: { ok: boolean; says: string } = { ok: false, says: 'Sign in to check the key opens.' };
	if (identity) {
		try {
			const k = await openSiteKey(record.sealedKey, identity);
			key = { ok: k.did === record.founding.site, says: 'The site key opens with your passkey.' };
		} catch (e) {
			key = { ok: false, says: e instanceof Error ? e.message : String(e) };
		}
	}
	let grant: { ok: boolean; says: string };
	try {
		const g = await grantOf(record);
		const ok = g.payload.iss === record.founding.site && g.payload.sub === record.founding.site && g.payload.aud === record.founding.root;
		grant = { ok, says: ok ? 'The site has given its founder everything it can do.' : 'The grant is not from this site to its founder.' };
	} catch {
		grant = { ok: false, says: 'The grant could not be read.' };
	}
	return { founding, key, grant };
}

/** The DNS record that makes the domain name the site's key. */
export function dnsRecord(record: SiteRecord) {
	return { type: 'TXT', name: `_inqbeta.${record.founding.domain}`, value: `site=${record.founding.site}` };
}

/*
 * Setting a site aside. A founding is a receipt and receipts are not deleted —
 * so a site founded by mistake (the wrong domain, a test) is set aside by a
 * second signed receipt saying so. It stops being listed and offered in Write;
 * its record, and its key, stay in the vault exactly as they were.
 */
export const SET_ASIDE_SCHEMA = 'inqbeta.site-set-aside/1';

export function isSetAside(x: unknown): x is { schema: string; site: string; domain: string } {
	const r = x as { schema?: string; site?: unknown };
	return !!r && r.schema === SET_ASIDE_SCHEMA && typeof r.site === 'string';
}

export async function setAside(record: SiteRecord, reason = ''): Promise<void> {
	const note = {
		schema: SET_ASIDE_SCHEMA,
		source: 'inqbeta:q/site-set-aside',
		site: record.founding.site,
		domain: record.founding.domain,
		reason,
		at: new Date().toISOString()
	};
	await saveLocked('sites', `${record.founding.domain}-set-aside.json`, JSON.stringify(await seal(note), null, 2), 'application/json');
}
