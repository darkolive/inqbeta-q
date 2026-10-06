/*
 * Trust travels down (ADR-Q-019 addendum, 6 October 2026).
 *
 * Darren: "it's either an authentic repo running, and so the hashes match.
 * And if anything changes, it just breaks … Or it's a branch and you can
 * follow through what's different and also still validate it as being a
 * Q-Core project."
 *
 *   core served     every build of Q puts its core (core-files.json) into one
 *                   self-contained chunk and writes /_q/core.json naming it.
 *                   Incubator fetches the chunk itself and fingerprints the
 *                   bytes the site actually serves.
 *   core release    Incubator's registrar signs each release's fingerprint as
 *                   Incubator runs it. The list of these is the master's word
 *                   on what its core looks like.
 *   the judgement   unchanged (matches a release), a named branch (differs,
 *                   but says where its source is, so anyone can follow what's
 *                   different), or changed (differs and says nothing). Only
 *                   the last can't be registered. It is the badge that
 *                   breaks, never the site: the licence lets anyone run it.
 *
 * Pure: no fetching, no storage.
 */
import { checkReceipt, sealWith, type SealedReceipt } from './seal';
import type { Identity } from './passkey';

export const CORE_SERVED_SCHEMA = 'inqbeta.core-served/1';
export const CORE_RELEASE_SCHEMA = 'inqbeta.core-release/1';
/** Where every build of Q says what its core is. */
export const CORE_SERVED_PATH = '/_q/core.json';
/** Where the master's source is, to compare a branch against. */
export const MASTER_REPO = 'https://github.com/darkolive/inqbeta-q';

const HEX64 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{7,40}$/;

/** What a site's /_q/core.json says. */
export interface CoreServed {
	schema: typeof CORE_SERVED_SCHEMA;
	release: string;
	commit: string;
	/** The chunk's path on the site. */
	kernel: string;
	sha256: string;
}

export function readCoreServed(x: unknown): CoreServed | null {
	const c = x as CoreServed | null;
	if (c?.schema !== CORE_SERVED_SCHEMA || typeof c.release !== 'string' || typeof c.commit !== 'string') return null;
	if (typeof c.kernel !== 'string' || !/^\/_app\/immutable\/chunks\/[A-Za-z0-9_-]+\.js$/.test(c.kernel)) return null;
	if (!HEX64.test(c.sha256)) return null;
	return c;
}

/** Where a branch's source is: named on the federation's card. */
export interface SourceOf {
	/** The repository, https. */
	repo: string;
	branch: string;
	commit: string;
}

export function sourceProblem(s: SourceOf): string | null {
	if (!/^https:\/\/[a-z0-9.-]+\/[^\s]+$/i.test(s.repo.trim())) return 'The repository’s address should start https://';
	if (!s.branch.trim()) return 'Name the branch.';
	if (!COMMIT.test(s.commit.trim())) return 'The commit is the long code Git gives it (letters a–f and numbers).';
	return null;
}

/** A link showing what differs from the master, when both are on GitHub; otherwise the branch's own page. */
export function compareLink(source: SourceOf, base: string | null): string {
	const repo = source.repo.replace(/\.git$/, '').replace(/\/$/, '');
	const gh = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(repo);
	if (gh && base) return `${MASTER_REPO}/compare/${base}...${gh[1]}:${gh[2]}:${source.commit}`;
	if (gh) return `${repo}/tree/${source.commit}`;
	return repo;
}

/** One release of Q's core, as Incubator ran it, signed by its registrar. */
export interface CoreRelease {
	schema: typeof CORE_RELEASE_SCHEMA;
	source: 'inqbeta:incubator/core';
	release: string;
	commit: string;
	sha256: string;
	at: string;
}
export type CoreReleaseReceipt = SealedReceipt & { content: CoreRelease };

export async function signCoreRelease(registrar: Pick<Identity, 'did' | 'publicKey' | 'signing'>, served: CoreServed, now = new Date()): Promise<CoreReleaseReceipt> {
	const content: CoreRelease = { schema: CORE_RELEASE_SCHEMA, source: 'inqbeta:incubator/core', release: served.release, commit: served.commit, sha256: served.sha256, at: now.toISOString() };
	return (await sealWith(registrar, content)) as CoreReleaseReceipt;
}

/** The releases in a list that Incubator's registrar really signed. */
export async function coreReleases(list: unknown[], registrar: string): Promise<CoreRelease[]> {
	const out: CoreRelease[] = [];
	for (const x of list) {
		const r = x as CoreReleaseReceipt;
		if (r?.content?.schema !== CORE_RELEASE_SCHEMA || r.did !== registrar || !HEX64.test(r.content.sha256)) continue;
		if ((await checkReceipt(r)).ok) out.push(r.content);
	}
	return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** What Incubator found, kept in the registration. */
export type CoreFinding =
	| { kind: 'unchanged'; release: string; commit: string; sha256: string }
	| { kind: 'branch'; release: string; sha256: string; source: SourceOf; nearest: string | null }
	| { kind: 'changed'; sha256: string | null };

/**
 * Judge a site's core. `fetched` is the sha256 of the chunk as Incubator
 * fetched it; the site's own word (core.json) must agree with it.
 */
export function judgeCore(o: { served: CoreServed | null; fetched: string | null; releases: CoreRelease[]; source?: SourceOf | null }): CoreFinding {
	const { served, fetched, releases, source } = o;
	if (!served || !fetched || served.sha256 !== fetched) return { kind: 'changed', sha256: fetched };
	const match = releases.find((r) => r.sha256 === fetched);
	if (match) return { kind: 'unchanged', release: match.release, commit: match.commit, sha256: fetched };
	if (source && !sourceProblem(source)) {
		const same = releases.filter((r) => r.release === served.release).at(-1) ?? releases.at(-1) ?? null;
		return { kind: 'branch', release: served.release, sha256: fetched, source, nearest: same?.commit ?? null };
	}
	return { kind: 'changed', sha256: fetched };
}

/** The finding in words, for receipts and pages. */
export function coreInWords(f: CoreFinding): string {
	if (f.kind === 'unchanged') return `Runs Q’s core unchanged, release ${f.release}.`;
	if (f.kind === 'branch') return `Runs a branch of Q (${f.source.branch}, from release ${f.release}); its source is named, so what’s different can be followed.`;
	return 'Its core isn’t Q’s as released, and it doesn’t say where its source is.';
}
