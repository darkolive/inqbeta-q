/*
 * The story engine on this device (ADR-Q-033 Part 2; 4 October 2026).
 *
 * Books being made are kept in this browser as their chains of steps
 * (q-core storybook.ts), under q.storybooks: { [book id]: steps }. Each step
 * is saved the moment it's made, so nothing is lost by trying, and a book's
 * history reads back. When books move into the vault, the same steps are
 * sealed as receipts.
 *
 * The AI is the host's, on localhost (api/story). With no key, or on the
 * deployed site, the practice drafter does each job instead, at no cost, so
 * every step can still be tried.
 */
import {
	bookFrom,
	freshId,
	practiceAsk,
	practiceDraft,
	practiceOutline,
	practiceRedo,
	practiceRipple,
	type Book,
	type BookStep,
	type RedoAnswers,
	type Story,
	type Suggestion
} from '@inqbeta/q-core/storybook';
import type { NextQuestion, StoryTask } from '@inqbeta/q-core/story-ai';

const KEY = 'q.storybooks';

function readAll(): Record<string, BookStep[]> {
	try {
		const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, BookStep[]>;
		return all && typeof all === 'object' ? all : {};
	} catch {
		return {};
	}
}
function writeAll(all: Record<string, BookStep[]>): boolean {
	try {
		localStorage.setItem(KEY, JSON.stringify(all));
		return true;
	} catch {
		return false;
	}
}

/** Every book on this device, newest first, as it now stands. */
export function booksHere(): { book: Book; steps: number; at: string }[] {
	return Object.entries(readAll())
		.map(([id, steps]) => ({ book: bookFrom(steps, id), steps: steps.length, at: steps.at(-1)?.at ?? '' }))
		.sort((a, b) => (a.at < b.at ? 1 : -1));
}
export const stepsOf = (id: string): BookStep[] => readAll()[id] ?? [];
/** Save a book's steps. False when this browser won't keep them (private window, full). */
export function saveSteps(id: string, steps: BookStep[]): boolean {
	const all = readAll();
	all[id] = steps;
	return writeAll(all);
}
export function forgetBook(id: string) {
	const all = readAll();
	delete all[id];
	writeAll(all);
}
export const newBookId = () => freshId('book');

/* ------------------------------------------------------------------- the AI */

export interface AiState {
	/** The host's AI is on here. */
	ai: boolean;
	model?: string;
	/** Why not, in plain words. */
	says?: string;
}
export async function aiHere(): Promise<AiState> {
	try {
		const r = await fetch('/api/story');
		if (!r.ok) return { ai: false, says: 'The AI isn’t on here yet. You can practise every step.' };
		return (await r.json()) as AiState;
	} catch {
		return { ai: false, says: 'The AI can’t be reached. You can practise every step.' };
	}
}

/** What a job costs at most, in credits, before anything runs. */
export async function quote(job: StoryTask): Promise<number> {
	const r = await fetch('/api/story', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ job, quote: true }) });
	const out = (await r.json().catch(() => null)) as { upTo?: number; message?: string } | null;
	if (!r.ok || typeof out?.upTo !== 'number') throw new Error(out?.message ?? 'The cost couldn’t be worked out.');
	return out.upTo;
}

export type JobResult = { next?: NextQuestion; outline?: { title: string; why: string }[]; stories?: Story[]; story?: Story; suggestions?: Suggestion[]; upTo: number; used: number; by: 'host' | 'practice' };

/** Run a job: the host's AI when agreed (a number), else practice. */
export async function run(job: StoryTask, agreed: number | 'practice'): Promise<JobResult> {
	if (agreed === 'practice') {
		const base = { upTo: 0, used: 0, by: 'practice' as const };
		if (job.task === 'ask') {
			const q = practiceAsk(job.book);
			return { ...base, next: { understood: job.book.title ? `${job.book.course ? 'A unit' : 'A book'} called “${job.book.title}”${job.book.subtext ? `: ${job.book.subtext}` : ''}` : '', question: q?.asks ?? null, why: q?.why ?? '', options: q?.options ?? [] } };
		}
		if (job.task === 'outline') return { ...base, outline: practiceOutline(job.book).map((title) => ({ title, why: '' })) };
		if (job.task === 'draft') return { ...base, stories: practiceDraft(job.book) };
		if (job.task === 'redo') {
			const story = job.book.stories.find((s) => s.id === job.story);
			if (!story) throw new Error('That story isn’t in the book.');
			return { ...base, story: practiceRedo(story, job.answers as RedoAnswers) };
		}
		return { ...base, suggestions: practiceRipple(job.book, job.changed) };
	}
	const r = await fetch('/api/story', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ job, agreed }) });
	const out = (await r.json().catch(() => null)) as (JobResult & { ok?: boolean; says?: string; message?: string }) | null;
	if (!r.ok || !out?.ok) throw new Error(out?.says ?? out?.message ?? 'The AI couldn’t do that just now. Nothing was changed.');
	return { ...out, by: 'host' };
}

/** A web page's words, read by the host's server, for a reference. Throws with what to do instead. */
export async function readLink(url: string): Promise<{ name: string; text: string; url: string }> {
	let out: { ok?: boolean; name?: string; text?: string; url?: string; says?: string; message?: string } | null = null;
	try {
		const r = await fetch('/api/story', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ read: url }) });
		out = await r.json().catch(() => null);
	} catch {
		/* not reachable */
	}
	if (!out?.ok || !out.text) throw new Error(out?.says ?? 'Q can only read web pages on the host’s own computer for now. Copy the page’s words and paste them in instead.');
	return { name: out.name ?? url, text: out.text, url: out.url ?? url };
}

