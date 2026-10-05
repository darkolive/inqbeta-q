/*
 * This computer's own host (ADR-Q-018): development only.
 *
 * Two files, both beside this app:
 *
 *   static/incubator.json   the host file every Q reads (lib/home.ts). Public,
 *                           committed: it is what the live site serves.
 *   host.local.json         which host this copy runs and who founded it.
 *                           Gitignored: it says something about this computer,
 *                           not about the host. No such file means set-up
 *                           hasn't been done here yet.
 *
 * A copy of the master arrives with the master's own host file. That is why
 * the mark exists: the file alone can't say whether this computer is the
 * master's founder or a newcomer who should found their own.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { HomeFile } from '$lib/home';

/*
 * The development site is its own host (ADR-Q-034 §5): a copy run with
 * PUBLIC_Q_SITE=development keeps its host files under static/dev/ and its
 * mark in host.dev.local.json, so founding it never touches inqbeta.com's.
 */
const root = () => process.cwd();
/* Read from the process (set by `pnpm dev:site`), so this file needs nothing of SvelteKit's and runs in tests. */
const devSite = () => process.env.PUBLIC_Q_SITE?.trim() === 'development';
const BASE = () => (devSite() ? path.resolve(root(), 'static', 'dev') : path.resolve(root(), 'static'));
const URL_BASE = () => (devSite() ? '/dev' : '');
const HOME = () => path.resolve(BASE(), 'incubator.json');
const MARK = () => path.resolve(root(), devSite() ? 'host.dev.local.json' : 'host.local.json');
const LOGO_DIR = () => path.resolve(BASE(), 'host');

export interface HostMark {
	schema: 'inqbeta.host-local/1';
	/** The host's federation DID. */
	federation: string;
	/** The founder's DID: whoever proved it on this computer. */
	founder: string;
	/** 'founded' here, or 'claimed' (the founder of a host file that came with the copy). */
	how: 'founded' | 'claimed';
	at: string;
}

export function readHomeFile(): HomeFile | null {
	try {
		if (!existsSync(HOME())) return null;
		const f = JSON.parse(readFileSync(HOME(), 'utf8')) as HomeFile;
		return f?.schema === 'inqbeta.home-federation/1' ? f : null;
	} catch {
		return null;
	}
}

export function readMark(): HostMark | null {
	try {
		if (!existsSync(MARK())) return null;
		const m = JSON.parse(readFileSync(MARK(), 'utf8')) as HostMark;
		return m?.schema === 'inqbeta.host-local/1' ? m : null;
	} catch {
		return null;
	}
}

export function writeMark(m: Omit<HostMark, 'schema' | 'at'>): HostMark {
	const mark: HostMark = { schema: 'inqbeta.host-local/1', ...m, at: new Date().toISOString() };
	writeFileSync(MARK(), JSON.stringify(mark, null, 2) + '\n');
	return mark;
}

export function writeHomeFile(f: HomeFile): void {
	mkdirSync(BASE(), { recursive: true });
	writeFileSync(HOME(), JSON.stringify(f, null, 2) + '\n');
}

const LOGO_TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' };
export const LOGO_MOST_BYTES = 512 * 1024;

/**
 * Keep the host's logo in static/host/, named by its type, and return the path
 * the host file names: /host/logo.webp?v=<fingerprint>. Throws a sentence.
 */
export function writeLogo(dataUrl: string): string {
	return writePicture(dataUrl, 'logo');
}

/** Keep the coin's own picture (ADR-Q-035) beside the logo: /host/coin.<ext>?v=<fingerprint>. Throws a sentence. */
export function writeCoinImage(dataUrl: string): string {
	return writePicture(dataUrl, 'coin');
}

function writePicture(dataUrl: string, name: 'logo' | 'coin'): string {
	const m = /^data:([a-z+/]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
	const ext = m ? LOGO_TYPES[m[1]] : undefined;
	if (!m || !ext) throw new Error('The logo needs to be a picture: WebP, PNG, JPEG or SVG.');
	const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
	if (bytes.length > LOGO_MOST_BYTES) throw new Error('The logo is too big. Try a smaller picture.');
	if (ext === 'svg' && /<script|on[a-z]+\s*=|javascript:/i.test(new TextDecoder().decode(bytes)))
		throw new Error('That SVG has scripts in it. Use a plain picture.');
	mkdirSync(LOGO_DIR(), { recursive: true });
	/* One picture per name: an older one of another type is left, but nothing points at it. */
	writeFileSync(path.join(LOGO_DIR(), `${name}.${ext}`), bytes);
	const v = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
	return `${URL_BASE()}/host/${name}.${ext}?v=${v}`;
}

/*
 * The host's service records (ADR-Q-018 §4), public, at static/host/services.json:
 * the newest signed record for each setting. No secret is in any of them.
 */
const SERVICES = () => path.resolve(BASE(), 'host', 'services.json');
export interface ServicesFile {
	schema: 'inqbeta.host-services/1';
	host: string;
	records: { content: { setting: string; at: string } & Record<string, unknown> }[];
	/** The money publication (ADR-Q-027 §7): signed by the founder, once, for good. */
	money?: unknown;
}

export function readServicesFile(): ServicesFile | null {
	try {
		if (!existsSync(SERVICES())) return null;
		const f = JSON.parse(readFileSync(SERVICES(), 'utf8')) as ServicesFile;
		return f?.schema === 'inqbeta.host-services/1' && Array.isArray(f.records) ? f : null;
	} catch {
		return null;
	}
}

/** Keep a signed record, replacing any older one for the same setting. */
export function keepServiceRecord(host: string, record: ServicesFile['records'][number]): void {
	const was = readServicesFile();
	const others = (was?.host === host ? was.records : []).filter((r) => r.content?.setting !== record.content.setting);
	mkdirSync(LOGO_DIR(), { recursive: true });
	const file: ServicesFile = { schema: 'inqbeta.host-services/1', host, records: [...others, record].sort((a, b) => a.content.setting.localeCompare(b.content.setting)), ...(was?.host === host && was.money ? { money: was.money } : {}) };
	writeFileSync(SERVICES(), JSON.stringify(file, null, 2) + '\n');
}

/** Keep the money publication. Once: a host already published can't publish again. */
export function keepMoneyPublication(host: string, publication: unknown): boolean {
	const was = readServicesFile();
	if (was?.money) return false;
	mkdirSync(LOGO_DIR(), { recursive: true });
	const file: ServicesFile = { schema: 'inqbeta.host-services/1', host, records: was?.host === host ? was.records : [], money: publication };
	writeFileSync(SERVICES(), JSON.stringify(file, null, 2) + '\n');
	return true;
}
