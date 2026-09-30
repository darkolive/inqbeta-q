/*
 * Answer sets, in and out of the folder.
 *
 * An answer set is written like every other receipt: signed by the passkey,
 * locked to it, in the folder. What makes it different is that its content is
 * question → answer, so it is a set of triples the moment it is read back
 * (q-core/questions.ts, and ADR-Q-001 §1).
 *
 * Answering again writes a NEW receipt rather than editing the old one. The
 * earlier answering keeps its own signature and its own time — the record is a
 * sequence of things a person said, in order, not a row that quietly says
 * whatever it says today. `newestPerSet` decides what counts now; the rest is
 * still evidence of what was true before.
 */
import {
	buildAnswerSet,
	isAnswerSet,
	setAddress,
	type AnswerSet,
	type QuestionSet,
	type Use
} from '@inqbeta/q-core/questions';
import { seal } from '@inqbeta/q-core/seal';
import { readItem, saveLocked, type FolderItem } from '@inqbeta/q-core/folder';
import type { Identity } from '@inqbeta/q-core/passkey';

/** Answer a set and write it down. */
export async function saveAnswers(
	identity: Identity,
	set: QuestionSet,
	values: Record<string, unknown>,
	uses?: Record<string, Use[]>
): Promise<{ ok: true; answers: AnswerSet; storedAs: string } | { ok: false; says: string[] }> {
	const built = await buildAnswerSet({ did: identity.did, set, values, uses });
	if (!built.ok) return built;

	try {
		const sealed = await seal({ ...built.answers, namespace: 'answers' });
		/* Named by the set's address, not by a counter: two devices answering the
		 * same questions write files that sort together and never collide. */
		const stamp = built.answers.at.replace(/[:.]/g, '-');
		/*
		 * `saveLocked` gives back the name the file actually has on disk: its own
		 * hash. The folder is FLAT — 'answers' is a label sealed inside the lock,
		 * not a directory — so nothing on disk says what any file is, which is the
		 * whole idea. Handing the name back lets a person be told where their
		 * thing went without anyone having to open it.
		 */
		const storedAs = await saveLocked(
			'answers',
			`answers-${set.id.replace(/[^a-z0-9]+/gi, '-')}-${stamp}.json`,
			JSON.stringify(sealed, null, 2),
			'application/json'
		);
		return { ok: true, answers: built.answers, storedAs };
	} catch (e) {
		return { ok: false, says: [e instanceof Error ? e.message : 'The answers could not be saved.'] };
	}
}

/** Read an answer set back out of a folder item, or null if that is not what it is. */
export async function answersFrom(item: FolderItem): Promise<AnswerSet | null> {
	try {
		const json = JSON.parse(new TextDecoder().decode((await readItem(item)).data)) as { content?: unknown };
		const content = json?.content ?? json;
		return isAnswerSet(content) ? content : null;
	} catch {
		return null;
	}
}

/** Has this exact set — these questions, these words — been answered? */
export async function answeringOf(set: QuestionSet, all: AnswerSet[]): Promise<AnswerSet | null> {
	const { address } = await setAddress(set);
	const mine = all.filter((a) => a.asked === address).sort((x, y) => (x.at < y.at ? 1 : -1));
	return mine[0] ?? null;
}
