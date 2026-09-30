/*
 * A backup that can be checked on its own.
 *
 * Decided 2026-09-25 (audit: storage channels and the incubator doctrine).
 * "Back up now" used to say "Backed up" before anything had left the browser,
 * and the zip it made carried no list of what should be in it — so a file
 * missing from a backup could never be noticed. ADR-Q-003 asks for backups
 * that are "proven, not assumed"; the incubator's evidence-root spec (§3.3,
 * §3.6) says a backup manifest is an evidence manifest: every member listed,
 * each hash recorded before the root, and the root recomputable by anyone.
 *
 * So every backup now carries `backup.json`:
 *
 *   members  — path, sha256, size, sorted by path (stable order for the root)
 *   root     — sha256 (hex) of the canonical manifest without the root itself
 *
 * and `makeBackup` does not hand a zip over until it has read its OWN bytes
 * back and checked every member against the manifest. That proves the file
 * that leaves is whole. Where it goes after that (Downloads, iCloud through
 * the share sheet) Q cannot see, so the copy is recorded as TOLD, not checked
 * — lifecycle.ts's distinction, kept honest.
 *
 * Pure: no window, no folder, no identity. Tested in Node.
 */
import { canonical } from './canonical';
import { matchesName, sha256Hex } from './vault';
import { unzip, zip, type ZipEntry } from './zip';

export const BACKUP_MANIFEST = 'backup.json';
export const BACKUP_SCHEMA = 'inqbeta.backup-manifest/1';

export interface BackupMember {
	path: string;
	sha256: string;
	bytes: number;
}

export interface BackupManifest {
	schema: typeof BACKUP_SCHEMA;
	/** Whose vault — the DID every locked file inside is sealed to. */
	did: string | null;
	made: string;
	members: BackupMember[];
	/** sha256 over the canonical manifest with `root` left out. */
	root: string;
}

async function rootOf(m: Omit<BackupManifest, 'root'>): Promise<string> {
	return sha256Hex(new TextEncoder().encode(canonical({ schema: m.schema, did: m.did, made: m.made, members: m.members })));
}

/** The manifest for a set of files. Hashes first, root last. */
export async function buildManifest(entries: ZipEntry[], did: string | null, made = new Date().toISOString()): Promise<BackupManifest> {
	const members: BackupMember[] = [];
	for (const e of entries) {
		if (e.name === BACKUP_MANIFEST) continue;
		members.push({ path: e.name, sha256: await sha256Hex(e.bytes), bytes: e.bytes.length });
	}
	members.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	const base = { schema: BACKUP_SCHEMA, did, made, members } as const;
	return { ...base, root: await rootOf(base) };
}

export interface BackupCheck {
	ok: boolean;
	/** Members that checked out. */
	files: number;
	root: string | null;
	/** Listed in the manifest, not in the archive. */
	missing: string[];
	/** In the archive, but not what the manifest (or the file's own name) says. */
	damaged: string[];
	/** One line for a person. */
	says: string;
}

/**
 * Check an unpacked backup against its own manifest.
 *
 * An archive with no manifest is an older backup: `root` is null, `ok` is
 * true if every content-named file still matches its name, and it says so.
 */
export async function checkBackup(entries: ZipEntry[]): Promise<BackupCheck> {
	const byPath = new Map(entries.map((e) => [e.name, e.bytes]));
	const damaged: string[] = [];
	const missing: string[] = [];

	/* A content-named file must match its own name, manifest or not. */
	for (const e of entries) {
		const name = e.name.split('/').pop() ?? e.name;
		if ((await matchesName(name, e.bytes)) === false) damaged.push(e.name);
	}

	const raw = byPath.get(BACKUP_MANIFEST);
	if (!raw) {
		const ok = damaged.length === 0;
		return {
			ok,
			files: entries.length - damaged.length,
			root: null,
			missing,
			damaged,
			says: ok
				? 'An older backup with no list of contents. Every file that can be checked is whole.'
				: `${damaged.length} ${damaged.length === 1 ? 'file is' : 'files are'} damaged in this backup.`
		};
	}

	let m: BackupManifest;
	try {
		m = JSON.parse(new TextDecoder().decode(raw)) as BackupManifest;
		if (m.schema !== BACKUP_SCHEMA || !Array.isArray(m.members)) throw new Error();
	} catch {
		return { ok: false, files: 0, root: null, missing, damaged, says: 'This backup’s list of contents cannot be read.' };
	}

	if ((await rootOf(m)) !== m.root) {
		return { ok: false, files: 0, root: m.root, missing, damaged, says: 'This backup’s list of contents has been changed since it was made.' };
	}

	let files = 0;
	for (const member of m.members) {
		const bytes = byPath.get(member.path);
		if (!bytes) {
			missing.push(member.path);
			continue;
		}
		if (bytes.length !== member.bytes || (await sha256Hex(bytes)) !== member.sha256) {
			if (!damaged.includes(member.path)) damaged.push(member.path);
			continue;
		}
		if (!damaged.includes(member.path)) files++;
	}

	const ok = missing.length === 0 && damaged.length === 0;
	const parts: string[] = [];
	if (missing.length) parts.push(`${missing.length} missing`);
	if (damaged.length) parts.push(`${damaged.length} damaged`);
	return {
		ok,
		files,
		root: m.root,
		missing,
		damaged,
		says: ok ? `All ${files} ${files === 1 ? 'file' : 'files'} are whole.` : `This backup is not whole: ${parts.join(', ')}.`
	};
}

export type MadeBackup =
	| { ok: true; bytes: Uint8Array; manifest: BackupManifest; check: BackupCheck }
	| { ok: false; says: string; check?: BackupCheck };

/**
 * Zip the files with their manifest, then read the zip back and check it.
 * Nothing is handed over that has not passed.
 */
export async function makeBackup(entries: ZipEntry[], did: string | null, made?: string): Promise<MadeBackup> {
	const manifest = await buildManifest(entries, did, made);
	const listing: ZipEntry = { name: BACKUP_MANIFEST, bytes: new TextEncoder().encode(JSON.stringify(manifest, null, '\t')), at: new Date(manifest.made) };
	const bytes = zip([...entries.filter((e) => e.name !== BACKUP_MANIFEST), listing]);
	let back: ZipEntry[];
	try {
		back = await unzip(bytes);
	} catch (e) {
		return { ok: false, says: `The backup could not be read back: ${e instanceof Error ? e.message : String(e)}` };
	}
	const check = await checkBackup(back);
	if (!check.ok || check.root !== manifest.root || check.files !== manifest.members.length) {
		return { ok: false, says: `The backup did not check out, so it was not handed over. ${check.says}`, check };
	}
	return { ok: true, bytes, manifest, check };
}

/**
 * Whose vault an archive is, read without unlocking anything: the backup
 * manifest names the DID, as do the continuity envelope (ADR-Q-005) and the
 * vault's own `dostudy.json` (which older backups, made before manifests, carry). null when neither says.
 *
 * The passkey comes first, so there is always a DID to compare this with
 * before a single file goes in (Darren, 2026-09-25: "there has to be a source
 * to hash from").
 */
export function backupOwner(entries: { name: string; bytes: Uint8Array }[]): string | null {
	for (const want of [BACKUP_MANIFEST, 'continuity.json', 'dostudy.json']) {
		const e = entries.find((x) => x.name === want || x.name.endsWith(`/${want}`));
		if (!e) continue;
		try {
			const did = (JSON.parse(new TextDecoder().decode(e.bytes)) as { did?: unknown }).did;
			if (typeof did === 'string' && did) return did;
		} catch {
			/* unreadable — try the next one */
		}
	}
	return null;
}
