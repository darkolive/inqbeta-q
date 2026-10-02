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

const root = () => process.cwd();
const HOME = () => path.resolve(root(), 'static', 'incubator.json');
const MARK = () => path.resolve(root(), 'host.local.json');
const LOGO_DIR = () => path.resolve(root(), 'static', 'host');

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
	writeFileSync(HOME(), JSON.stringify(f, null, 2) + '\n');
}

const LOGO_TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' };
export const LOGO_MOST_BYTES = 512 * 1024;

/**
 * Keep the host's logo in static/host/, named by its type, and return the path
 * the host file names: /host/logo.webp?v=<fingerprint>. Throws a sentence.
 */
export function writeLogo(dataUrl: string): string {
	const m = /^data:([a-z+/]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
	const ext = m ? LOGO_TYPES[m[1]] : undefined;
	if (!m || !ext) throw new Error('The logo needs to be a picture: WebP, PNG, JPEG or SVG.');
	const bytes = Buffer.from(m[2], 'base64');
	if (bytes.length > LOGO_MOST_BYTES) throw new Error('The logo is too big. Try a smaller picture.');
	if (ext === 'svg' && /<script|on[a-z]+\s*=|javascript:/i.test(bytes.toString('utf8')))
		throw new Error('That SVG has scripts in it. Use a plain picture.');
	mkdirSync(LOGO_DIR(), { recursive: true });
	writeFileSync(path.join(LOGO_DIR(), `logo.${ext}`), bytes);
	const v = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
	return `/host/logo.${ext}?v=${v}`;
}
