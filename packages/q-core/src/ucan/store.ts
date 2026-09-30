/*
 * Where UCANs are kept.
 *
 * In the locked folder, tokens sit beside the locked files as `ucan/<cid>.ucan`
 * and revocations as `ucan/revoked/<cid>.ucan`. They are not encrypted: a
 * token holds DIDs, a command and hashes — never content — and it exists to be
 * shown to whoever checks it, like a receipt. Each file is named by its own
 * CID, so copy locations can carry them with the same "never overwrite, check
 * the name" rule as locked files.
 *
 * A site with no folder keeps its tokens in this browser as one container.
 */
import { primaryHandle } from '../folder';
import { children, writeIn } from '../fsx';
import { CID } from './cid';
import { readContainerTokens, writeContainer } from './container';
import { REVOKE_COMMAND, asRevocation } from './revoke';
import { readToken, type Delegation, type Token } from './token';
import type { KnownRevocation } from './validate';

export const UCAN_DIR = 'ucan';
export const REVOKED_DIR = 'revoked';
export const UCAN_EXT = '.ucan';

export interface TokenStore {
	put(token: Token): Promise<void>;
	all(): Promise<Token[]>;
}

export function isRevocation(t: Token): boolean {
	return t.kind === 'invocation' && t.payload.cmd === REVOKE_COMMAND;
}

/** Is `name` (`<cid>.ucan`) the CID of `bytes`? null when the name is not a CID. */
export async function tokenMatchesName(name: string, bytes: Uint8Array): Promise<boolean | null> {
	if (!name.endsWith(UCAN_EXT)) return null;
	let named: CID;
	try {
		named = CID.parse(name.slice(0, -UCAN_EXT.length));
	} catch {
		return null;
	}
	return named.equals(await CID.of(bytes, named.codec));
}

type Dir = FileSystemDirectoryHandle;

async function dirs(create: boolean) {
	const root = primaryHandle();
	if (!root) return null;
	try {
		const ucan = await root.getDirectoryHandle(UCAN_DIR, { create });
		const revoked = await ucan.getDirectoryHandle(REVOKED_DIR, { create });
		return { ucan: ucan as Dir, revoked: revoked as Dir };
	} catch {
		return null;
	}
}

async function readDir(d: Dir): Promise<Token[]> {
	const out: Token[] = [];
	for await (const h of children(d)) {
		if (h.kind !== 'file' || !h.name.endsWith(UCAN_EXT)) continue;
		const bytes = new Uint8Array(await (await (h as FileSystemFileHandle).getFile()).arrayBuffer());
		if ((await tokenMatchesName(h.name, bytes)) !== true) continue;
		try {
			out.push(await readToken(bytes));
		} catch {
			/* a damaged or foreign file is skipped, never trusted */
		}
	}
	return out;
}

/** The tokens in the open locked folder. */
export const folderStore: TokenStore = {
	async put(token) {
		const d = await dirs(true);
		if (!d) throw new Error('Open your folder first.');
		const into = isRevocation(token) ? d.revoked : d.ucan;
		const name = token.cid.toString() + UCAN_EXT;
		try {
			await into.getFileHandle(name);
			return; // already there — same name, same bytes
		} catch {
			/* not yet */
		}
		await writeIn(into, name, token.bytes);
	},
	async all() {
		const d = await dirs(false);
		if (!d) return [];
		return [...(await readDir(d.ucan)), ...(await readDir(d.revoked))];
	}
};

/** Tokens kept in this browser, for a site with no folder. */
export function browserStore(key = 'q-ucan'): TokenStore {
	const load = async (): Promise<Token[]> => {
		try {
			const text = localStorage.getItem(key);
			return text ? await readContainerTokens(text) : [];
		} catch {
			return [];
		}
	};
	return {
		async put(token) {
			const tokens = await load();
			if (tokens.some((t) => t.cid.equals(token.cid))) return;
			try {
				localStorage.setItem(key, (await writeContainer([...tokens, token])) as string);
			} catch {
				/* storage unavailable: the token still exists wherever it was sent */
			}
		},
		all: load
	};
}

/** Delegations and known revocations from a store, ready for checkInvocation. */
export async function gather(store: TokenStore): Promise<{ delegations: Delegation[]; revocations: KnownRevocation[] }> {
	const tokens = await store.all();
	const delegations = tokens.filter((t): t is Delegation => t.kind === 'delegation');
	const revocations: KnownRevocation[] = [];
	for (const t of tokens)
		if (isRevocation(t) && t.kind === 'invocation') {
			try {
				revocations.push(asRevocation(t));
			} catch {
				/* malformed: ignored */
			}
		}
	return { delegations, revocations };
}
