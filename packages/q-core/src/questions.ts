/*
 * Schema is a set of questions. The answers are the content.
 *
 * Darren, 2026-09-19:
 *
 *   > "Each type has specific schema questions, which are those names, which are
 *   > the titles. And they're the questions, and the answers are what make it
 *   > specific. And that's the content… If the DID is the key and the answer is
 *   > the value, then receipts become an ability to build an eco knowledge
 *   > system."
 *
 * So a receipt's content is (DID, question, answer) — subject, predicate,
 * object. That is a triple, and Dgraph is a triple store, so this is the
 * storage engine's own shape rather than a model laid over it. See
 * docs/decisions/adr-q-001.
 *
 * THE WORDING IS NEVER THE KEY. Reword "What is your date of birth?" to "When
 * were you born?" and a keyed-by-wording graph forks: two predicates, one fact,
 * nothing relating them. So a question has an `id` that never changes and
 * `asks` — one wording per language, freely edited, freely added to. Changing
 * `id` is a NEW question, and old answers stay attached to the old one, which
 * is correct: they answered a different thing.
 *
 * A QUESTION SET IS NAMED BY ITS OWN HASH. `setAddress()` gives the same kind
 * of address vault.ts gives a locked file. An answer set cites it, so a reader
 * can always fetch the exact questions, in the exact wording, that produced
 * those answers. That is the difference between data and evidence: "1970" is
 * data; "we asked these words and they answered 1970" is evidence.
 *
 * EVERY ANSWER CARRIES WHAT IT IS FOR. Giving an answer is not giving it for
 * everything — `given` is the answer existing at all, and each step past it is
 * a separate, revocable statement. Free to give, never free to take.
 */
import { canonical } from './canonical';
import { contentAddress, contentCid } from './vault';
import { canAnswer, meets, needsFor, rung, type Assurance } from './assurance';

/**
 * What kind of thing an answer is. Dgraph needs this, and so does a form.
 *
 * `questions` and `channels` answer with a LIST — the predicates a card shows,
 * the ways to be reached it carries. They exist so that a card can be an answer
 * set like everything else rather than a schema of its own: a new kind of card
 * is then a declaration, not code. RDF has always allowed a predicate to hold
 * several objects, and Dgraph spells it `[string]`, so nothing is being bent
 * to fit.
 */
export type AnswerType =
	| 'text'
	| 'longtext'
	| 'link'
	| 'date'
	| 'number'
	| 'boolean'
	| 'choice'
	| 'did'
	/** A set of question ids. */
	| 'questions'
	/** A set of channel ids. */
	| 'channels';

/**
 * What an answer may be used for. `given` is the answer existing at all;
 * everything past it is a separate permission, recorded in the receipt rather
 * than in a setting, because a setting is not evidence of anything.
 */
export type Use = 'given' | 'shown-to-me' | 'pooled' | 'modelled';

export const USES: { id: Use; label: string; says: string }[] = [
	{ id: 'given', label: 'Given', says: 'You answered. Nothing follows from that on its own.' },
	{ id: 'shown-to-me', label: 'Shown back', says: 'Q may show it to you, and use it to fill things in.' },
	{ id: 'pooled', label: 'Counted', says: 'It may be counted with other people’s, never shown as yours.' },
	{ id: 'modelled', label: 'Learned from', says: 'It may train something. The strongest thing you can give.' }
];

export interface Question {
	/** `q:person/given-name` — the predicate. Stable for ever. */
	id: string;
	answer: AnswerType;
	/** Language tag → wording. Add and edit freely; none of it is the key. */
	asks: Record<string, string>;
	/** Optional extra wording, same shape. */
	help?: Record<string, string>;
	/** Required when `answer` is 'choice'. */
	choices?: { id: string; label: Record<string, string> }[];
	optional?: boolean;
	/**
	 * A higher bar than the set's, for this one question.
	 *
	 * Raises only — see needsFor(). A question asking for LESS than the set it
	 * is in would be a quiet hole in a standard somebody declared, and the set
	 * is the thing whose address gets cited.
	 */
	needs?: Assurance;
}

export const QUESTION_SET_SCHEMA = 'inqbeta.questions/1';

export interface QuestionSet {
	schema: typeof QUESTION_SET_SCHEMA;
	/** A name for people. NOT the address — the hash is the address. */
	id: string;
	title: Record<string, string>;
	questions: Question[];
	/**
	 * How sure an answering has to be. Defaults to 'signed'.
	 *
	 * Declared here so it travels with the questions — a federation raises its
	 * own bar without anybody writing code. And because a set is named by its
	 * own hash, the bar is PART OF THE ADDRESS: an answering cites the exact
	 * standard it was held to, and nobody can later claim old answers met a bar
	 * that was added afterwards.
	 */
	needs?: Assurance;
}

/* A predicate looks like `q:person/given-name`: a prefix, then a path. */
const ID = /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9/-]*$/;

/** Is this set well formed? Said as a list, because a half-answer is no use. */
export function checkSet(set: QuestionSet): { ok: true } | { ok: false; says: string[] } {
	const says: string[] = [];
	if (set.schema !== QUESTION_SET_SCHEMA) says.push(`Not a question set: ${String(set.schema)}`);
	if (!set.questions?.length) says.push('A question set with no questions.');
	const seen = new Set<string>();
	for (const q of set.questions ?? []) {
		if (!ID.test(q.id ?? '')) says.push(`Not a question id: ${String(q.id)}`);
		if (seen.has(q.id)) says.push(`Asked twice: ${q.id}`);
		seen.add(q.id);
		if (!q.asks || !Object.keys(q.asks).length) says.push(`${q.id} is never actually asked.`);
		if (q.answer === 'choice' && !q.choices?.length) says.push(`${q.id} is a choice with nothing to choose.`);
	}
	return says.length ? { ok: false, says } : { ok: true };
}

/** The wording, in a language, falling back rather than showing an id to a person. */
export function asking(q: Question, lang = 'en-GB'): string {
	return q.asks[lang] ?? q.asks['en-GB'] ?? Object.values(q.asks)[0] ?? q.id;
}

/**
 * The set, named by its own hash — the same kind of address vault.ts gives a
 * locked file, and the CID that IPFS and UCAN tools use for the same bytes.
 * Canonical JSON, so two people with the same questions get the same address.
 */
export async function setAddress(set: QuestionSet): Promise<{ address: string; cid: string }> {
	const bytes = new TextEncoder().encode(canonical(set));
	return { address: await contentAddress(bytes), cid: await contentCid(bytes) };
}

/* ------------------------------------------------------------------ *
 * Answers
 * ------------------------------------------------------------------ */

export type AnswerValue = string | number | boolean | string[];

export interface Answer {
	value: AnswerValue;
	uses: Use[];
}

export const ANSWER_SET_SOURCE = 'inqbeta:answers/1';

export interface AnswerSet {
	source: typeof ANSWER_SET_SOURCE;
	/** The subject of every triple in here. */
	did: string;
	/** `content://sha256/…` — the questions these answer. */
	asked: string;
	/** The same bytes as a CID. */
	askedCid: string;
	/** The set's human name, for a list that has not fetched the questions yet. */
	setId: string;
	/** Question id → answer. */
	answers: Record<string, Answer>;
	/**
	 * How sure this answering is — what was actually achieved, not what was
	 * asked for. Absent on receipts written before assurance existed, which
	 * read as 'signed' because that is what they were.
	 */
	held?: Assurance;
	at: string;
}

/** Check and tidy one answer. Refusing early beats a graph full of noise. */
export function checkAnswer(q: Question, value: unknown): { ok: true; value: AnswerValue } | { ok: false; says: string } {
	switch (q.answer) {
		case 'text':
		case 'longtext': {
			const v = typeof value === 'string' ? value.trim() : '';
			if (!v) return { ok: false, says: 'Nothing was written.' };
			return { ok: true, value: v };
		}
		case 'did': {
			const v = typeof value === 'string' ? value.trim() : '';
			if (!v.startsWith('did:')) return { ok: false, says: 'That is not a DID.' };
			return { ok: true, value: v };
		}
		case 'link': {
			const v = typeof value === 'string' ? value.trim() : '';
			if (!v) return { ok: false, says: 'Nothing was written.' };
			/* A bare domain is what people type; make it a link rather than refusing. */
			const full = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
			let url: URL;
			try {
				url = new URL(full);
			} catch {
				return { ok: false, says: 'That is not a web address.' };
			}
			if (url.protocol !== 'http:' && url.protocol !== 'https:') {
				return { ok: false, says: 'Only http and https links.' };
			}
			return { ok: true, value: url.toString() };
		}
		case 'questions':
		case 'channels': {
			const raw = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
			const list = [...new Set(raw.filter((v): v is string => typeof v === 'string' && !!v.trim()).map((v) => v.trim()))].sort();
			if (!list.length) return { ok: false, says: 'Nothing was chosen.' };
			return { ok: true, value: list };
		}
		case 'date': {
			const v = typeof value === 'string' ? value.trim() : '';
			if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, says: 'A date, as YYYY-MM-DD.' };
			if (Number.isNaN(Date.parse(v))) return { ok: false, says: 'There is no such date.' };
			return { ok: true, value: v };
		}
		case 'number': {
			const v = typeof value === 'number' ? value : Number(String(value).trim());
			if (!Number.isFinite(v)) return { ok: false, says: 'A number.' };
			return { ok: true, value: v };
		}
		case 'boolean':
			return { ok: true, value: value === true || value === 'true' };
		case 'choice': {
			const v = typeof value === 'string' ? value.trim() : '';
			if (!q.choices?.some((c) => c.id === v)) return { ok: false, says: 'Not one of the choices.' };
			return { ok: true, value: v };
		}
	}
}

/**
 * Build an answer set. Unanswered optional questions are simply absent —
 * a missing answer and a blank answer are not the same thing, and only one of
 * them is a statement.
 */
export async function buildAnswerSet(params: {
	did: string;
	set: QuestionSet;
	values: Record<string, unknown>;
	/** Per question. Anything not named gets `['given']` and nothing more. */
	uses?: Record<string, Use[]>;
	at?: string;
	/**
	 * What the device actually managed. Defaults to 'signed', which is what
	 * every answering in Q has always been.
	 */
	held?: Assurance;
}): Promise<{ ok: true; answers: AnswerSet } | { ok: false; says: string[] }> {
	const wrong = checkSet(params.set);
	if (!wrong.ok) return { ok: false, says: wrong.says };

	/*
	 * The bar first, before a single answer is read.
	 *
	 * NO SILENT DOWNGRADE. A set that needs a fingerprint and a device that
	 * cannot give one produces a refusal, never an answering quietly recorded
	 * at a lower bar — a ladder that bends under load is decoration, and the
	 * receipt would claim a standard it did not meet.
	 */
	const held = params.held ?? 'signed';
	/* By rung, never by string — 'signed' sorts after 'present' alphabetically
	 * and before it in meaning, and comparing the words would have quietly
	 * lowered the bar on exactly the sets that raised it. */
	const wanted = params.set.questions.reduce<Assurance>((so, q) => {
		const here = needsFor(params.set.needs, q.needs);
		return rung(here) > rung(so) ? here : so;
	}, params.set.needs ?? 'signed');
	if (!meets(held, wanted)) {
		const short = canAnswer(held, wanted);
		return { ok: false, says: [short.says, short.fix].filter(Boolean) };
	}

	const says: string[] = [];
	const answers: Record<string, Answer> = {};

	for (const q of params.set.questions) {
		const given = params.values[q.id];
		const empty = given === undefined || given === null || given === '' || (Array.isArray(given) && !given.length);
		if (empty) {
			if (!q.optional) says.push(`${asking(q)} — not answered.`);
			continue;
		}
		const checked = checkAnswer(q, given);
		if (!checked.ok) {
			says.push(`${asking(q)} — ${checked.says}`);
			continue;
		}
		const uses = params.uses?.[q.id]?.length ? [...new Set(params.uses[q.id])] : [];
		answers[q.id] = { value: checked.value, uses: [...new Set<Use>(['given', ...uses])] };
	}

	if (says.length) return { ok: false, says };

	const { address, cid } = await setAddress(params.set);
	return {
		ok: true,
		answers: {
			source: ANSWER_SET_SOURCE,
			did: params.did,
			asked: address,
			askedCid: cid,
			setId: params.set.id,
			answers,
			held,
			at: params.at ?? new Date().toISOString()
		}
	};
}

export function isAnswerSet(body: unknown): body is AnswerSet {
	const a = body as AnswerSet;
	return (
		!!a &&
		typeof a === 'object' &&
		a.source === ANSWER_SET_SOURCE &&
		typeof a.did === 'string' &&
		typeof a.asked === 'string' &&
		!!a.answers &&
		typeof a.answers === 'object'
	);
}

/** Do these answers answer THAT set, or some other version of it? */
export async function answersMatch(set: QuestionSet, answers: AnswerSet): Promise<boolean> {
	return (await setAddress(set)).address === answers.asked;
}

/** The newest answer set per question set. Earlier ones stay as evidence. */
export function newestPerSet(all: AnswerSet[]): AnswerSet[] {
	const by = new Map<string, AnswerSet>();
	for (const a of all) {
		const seen = by.get(a.asked);
		if (!seen || a.at > seen.at) by.set(a.asked, a);
	}
	return [...by.values()].sort((x, y) => (x.at < y.at ? 1 : -1));
}

/* ------------------------------------------------------------------ *
 * The graph
 * ------------------------------------------------------------------ */

export interface Triple {
	subject: string;
	predicate: string;
	object: AnswerValue;
	uses: Use[];
}

/**
 * The whole point, in one function: an answer set IS a set of triples. Nothing
 * is translated and nothing is mapped — the DID is the subject, the question id
 * is the predicate, the answer is the object.
 */
export function triples(answers: AnswerSet): Triple[] {
	return Object.entries(answers.answers).map(([predicate, a]) => ({
		subject: answers.did,
		predicate,
		object: a.value,
		uses: a.uses
	}));
}

const DGRAPH_TYPE: Record<AnswerType, string> = {
	text: 'string @index(trigram)',
	longtext: 'string @index(fulltext)',
	link: 'string @index(exact)',
	date: 'datetime @index(day)',
	number: 'float @index(float)',
	boolean: 'bool @index(bool)',
	choice: 'string @index(exact)',
	did: 'string @index(exact)',
	/* A predicate with several objects — what a list is, in a triple store. */
	questions: '[string] @index(exact)',
	channels: '[string] @index(exact)'
};

/**
 * The Dgraph schema a question set implies.
 *
 * This is the line where predicates stop being code. taxonomy.ts holds a
 * hand-written list; this generates one from declared questions, so a
 * federation adds a question without anybody editing TypeScript.
 */
export function dgraphPredicates(set: QuestionSet): Record<string, string> {
	const out: Record<string, string> = {};
	for (const q of set.questions) out[q.id] = DGRAPH_TYPE[q.answer];
	return out;
}
