/*
 * The UCAN policy language — the conditions a delegation puts on the arguments
 * of any command run under it.
 *
 *   [["==", ".thing", <cid>], ["like", ".branch", "review-*"]]
 *
 * A policy is a list of statements that must all hold. Statements compare a
 * value picked out of the arguments by a jq-like selector (`.a`, `.a[0]`,
 * `.["odd key"]`, `.a[1:3]`, `.a[]`, `.a?`) with a literal, or combine other
 * statements (`and`, `or`, `not`, `all`, `any`).
 *
 * Missing data never counts as a pass: a statement whose selector finds
 * nothing fails, and `not` does not turn that failure into success. A selector
 * ending in `?` is the exception — "if this is there, it must match" — and
 * passes when the value is absent. (This follows go-ucan, the reference Go
 * implementation; `all`/`any` over a map use its values, as the spec says.)
 */
import { CID } from './cid';
import type { Ipld } from './cbor';
import { UcanError } from './errors';

export type Statement = Ipld[];
export type Policy = Statement[];

type Segment =
	| { kind: 'identity' }
	| { kind: 'field'; name: string; optional: boolean }
	| { kind: 'index'; index: number; optional: boolean }
	| { kind: 'slice'; from?: number; to?: number; optional: boolean }
	| { kind: 'values'; optional: boolean };

const FIELD = /^\.[\p{L}_][\p{L}0-9$_\-]*$/u;
const INDEX = /^-?\d+$/;
const SLICE = /^(-?\d+:-?\d*|-?\d*:-?\d+)$/;

function tokens(text: string): string[] {
	const out: string[] = [];
	let start = 0;
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '"' && text[i - 1] !== '\\') {
			quoted = !quoted;
			continue;
		}
		if (quoted) continue;
		if ((c === '.' || c === '[') && i > start) {
			out.push(text.slice(start, i));
			start = i;
		}
	}
	if (quoted) throw new UcanError('InvalidToken', `Unclosed quote in selector ${text}`);
	out.push(text.slice(start));
	return out;
}

const parsed = new Map<string, Segment[]>();

export function parseSelector(text: string): Segment[] {
	const cached = parsed.get(text);
	if (cached) return cached;
	const bad = (why: string) => new UcanError('InvalidToken', `Selector ${JSON.stringify(text)}: ${why}`);
	if (typeof text !== 'string' || !text.startsWith('.')) throw bad('must start with "."');
	const out: Segment[] = [];
	const toks = tokens(text);
	toks.forEach((tok, i) => {
		if (tok === '.' && toks[i + 1]?.startsWith('.')) throw bad('".." is not allowed');
	});
	for (const tok of toks) {
		const optional = tok.endsWith('?');
		const seg = tok.replace(/\?+$/, '');
		if (seg === '.') {
			if (out.length && out[out.length - 1].kind === 'identity') throw bad('".." is not allowed');
			out.push({ kind: 'identity' });
		} else if (seg === '[]') out.push({ kind: 'values', optional });
		else if (seg.startsWith('[') && seg.endsWith(']')) {
			const inner = seg.slice(1, -1);
			if (INDEX.test(inner)) out.push({ kind: 'index', index: Number(inner), optional });
			else if (inner.startsWith('"') && inner.endsWith('"') && inner.length >= 2) {
				const name = JSON.parse(inner) as string;
				out.push({ kind: 'field', name, optional });
			} else if (SLICE.test(inner)) {
				const [a, b] = inner.split(':');
				out.push({ kind: 'slice', from: a === '' ? undefined : Number(a), to: b === '' ? undefined : Number(b), optional });
			} else throw bad(`cannot read ${seg}`);
		} else if (FIELD.test(seg)) out.push({ kind: 'field', name: seg.slice(1), optional });
		else throw bad(`cannot read ${seg}`);
	}
	parsed.set(text, out);
	return out;
}

const MISSING = Symbol('missing');
const OPTIONAL = Symbol('optional-missing');
type Found = Ipld | typeof MISSING | typeof OPTIONAL;

function isMap(v: Ipld): v is { [k: string]: Ipld } {
	return !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Uint8Array) && !(v instanceof CID);
}

function sliceRange(from: number | undefined, to: number | undefined, length: number): [number, number] {
	let a = from === undefined ? 0 : from < 0 ? Math.max(0, length + from) : Math.min(from, length);
	let b = to === undefined ? length : to < 0 ? Math.max(0, length + to) : Math.min(to, length);
	if (a >= b) a = b = 0;
	return [a, b];
}

export function select(selector: string, data: Ipld): Found {
	let cur: Ipld | undefined = data;
	for (const seg of parseSelector(selector)) {
		if (seg.kind === 'identity') continue;
		const fail = () => (seg.optional ? OPTIONAL : MISSING);
		if (cur === undefined) return fail();
		if (seg.kind === 'values') {
			if (Array.isArray(cur)) continue;
			if (isMap(cur)) {
				cur = Object.values(cur);
				continue;
			}
			return seg.optional && cur === null ? [] : MISSING;
		}
		if (seg.kind === 'field') {
			if (!isMap(cur)) return fail();
			if (!Object.prototype.hasOwnProperty.call(cur, seg.name)) {
				if (!seg.optional) return MISSING;
				cur = undefined;
				continue;
			}
			cur = cur[seg.name];
			continue;
		}
		if (seg.kind === 'index') {
			if (Array.isArray(cur) || cur instanceof Uint8Array) {
				const i: number = seg.index < 0 ? cur.length + seg.index : seg.index;
				if (i < 0 || i >= cur.length) return fail();
				cur = cur[i];
				continue;
			}
			return fail();
		}
		// slice
		if (Array.isArray(cur) || cur instanceof Uint8Array) {
			const [a, b] = sliceRange(seg.from, seg.to, cur.length);
			cur = cur.slice(a, b) as Ipld;
		} else if (typeof cur === 'string') {
			const chars: string[] = [...cur];
			const [a, b] = sliceRange(seg.from, seg.to, chars.length);
			cur = chars.slice(a, b).join('');
		} else return fail();
	}
	return cur === undefined ? OPTIONAL : cur;
}

export function deepEqual(a: Ipld | undefined, b: Ipld | undefined): boolean {
	if ((typeof a === 'number' || typeof a === 'bigint') && (typeof b === 'number' || typeof b === 'bigint'))
		return a == b;
	if (a instanceof CID || b instanceof CID) return a instanceof CID && a.equals(b as CID);
	if (a instanceof Uint8Array || b instanceof Uint8Array)
		return a instanceof Uint8Array && b instanceof Uint8Array && a.length === b.length && a.every((x, i) => x === b[i]);
	if (Array.isArray(a) || Array.isArray(b))
		return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
	if (isMap(a as Ipld) || isMap(b as Ipld)) {
		if (!isMap(a as Ipld) || !isMap(b as Ipld)) return false;
		const x = a as Record<string, Ipld>;
		const y = b as Record<string, Ipld>;
		const kx = Object.keys(x);
		return kx.length === Object.keys(y).length && kx.every((k) => Object.prototype.hasOwnProperty.call(y, k) && deepEqual(x[k], y[k]));
	}
	return a === b;
}

const globs = new Map<string, RegExp>();
export function like(pattern: string, value: string): boolean {
	let re = globs.get(pattern);
	if (!re) {
		let src = '';
		for (let i = 0; i < pattern.length; i++) {
			const c = pattern[i];
			if (c === '\\' && pattern[i + 1] === '*') {
				src += '\\*';
				i++;
			} else if (c === '*') src += '[\\s\\S]*';
			else src += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
		re = new RegExp(`^${src}$`, 'u');
		globs.set(pattern, re);
	}
	return re.test(value);
}

type Result = 'true' | 'false' | 'missing' | 'optional';

function isNumber(v: unknown): v is number | bigint {
	return typeof v === 'number' || typeof v === 'bigint';
}

function compare(op: string, a: number | bigint, b: number | bigint): boolean {
	switch (op) {
		case '<':
			return a < b;
		case '<=':
			return a <= b;
		case '>':
			return a > b;
		default:
			return a >= b;
	}
}

function run(s: Statement, data: Ipld): Result {
	const op = s[0];
	const lift = (found: Found, test: (v: Ipld) => boolean): Result =>
		found === MISSING ? 'missing' : found === OPTIONAL ? 'optional' : test(found) ? 'true' : 'false';
	switch (op) {
		case '==':
			return lift(select(s[1] as string, data), (v) => deepEqual(v, s[2]));
		case '!=':
			return lift(select(s[1] as string, data), (v) => !deepEqual(v, s[2]));
		case '<':
		case '<=':
		case '>':
		case '>=':
			return lift(select(s[1] as string, data), (v) => isNumber(v) && compare(op, v, s[2] as number));
		case 'like':
			return lift(select(s[1] as string, data), (v) => typeof v === 'string' && like(s[2] as string, v));
		case 'not': {
			const r = run(s[1] as Statement, data);
			return r === 'true' ? 'false' : r === 'false' ? 'true' : r;
		}
		case 'and':
		case 'or': {
			const parts = (s[1] as Statement[]).map((x) => run(x, data));
			return combine(op === 'and', parts);
		}
		case 'all':
		case 'any': {
			const found = select(s[1] as string, data);
			if (found === MISSING) return 'missing';
			if (found === OPTIONAL) return 'optional';
			const items = Array.isArray(found) ? found : isMap(found) ? Object.values(found) : null;
			if (!items) return 'false';
			return combine(op === 'all', items.map((item) => run(s[2] as Statement, item)));
		}
	}
	return 'false';
}

function combine(every: boolean, parts: Result[]): Result {
	if (every) {
		if (parts.includes('false')) return 'false';
		if (parts.includes('missing')) return 'missing';
		return 'true';
	}
	if (parts.length === 0 || parts.includes('true')) return 'true';
	if (parts.includes('missing')) return 'missing';
	if (parts.every((p) => p === 'optional')) return 'optional';
	return 'false';
}

/** Does `args` satisfy every statement? Returns the first statement that does not, if any. */
export function matches(policy: Policy, args: Ipld): { ok: true } | { ok: false; statement: Statement } {
	for (const s of policy) {
		const r = run(s, args);
		if (r === 'false' || r === 'missing') return { ok: false, statement: s };
	}
	return { ok: true };
}

/** Throws unless `value` is a well-formed policy. */
export function checkPolicy(value: unknown): Policy {
	const bad = (why: string) => new UcanError('InvalidToken', `Policy: ${why}`);
	const statement = (s: unknown): void => {
		if (!Array.isArray(s) || typeof s[0] !== 'string') throw bad('each statement is [op, …]');
		const [op] = s;
		switch (op) {
			case '==':
			case '!=':
				if (s.length !== 3) throw bad(`${op} takes a selector and a value`);
				parseSelector(s[1]);
				return;
			case '<':
			case '<=':
			case '>':
			case '>=':
				if (s.length !== 3 || !isNumber(s[2])) throw bad(`${op} takes a selector and a number`);
				parseSelector(s[1]);
				return;
			case 'like':
				if (s.length !== 3 || typeof s[2] !== 'string') throw bad('like takes a selector and a pattern');
				parseSelector(s[1]);
				return;
			case 'not':
				if (s.length !== 2) throw bad('not takes one statement');
				return statement(s[1]);
			case 'and':
			case 'or':
				if (s.length !== 2 || !Array.isArray(s[1])) throw bad(`${op} takes a list of statements`);
				return s[1].forEach(statement);
			case 'all':
			case 'any':
				if (s.length !== 3) throw bad(`${op} takes a selector and a statement`);
				parseSelector(s[1]);
				return statement(s[2]);
		}
		throw bad(`unknown operator ${JSON.stringify(op)}`);
	};
	if (!Array.isArray(value)) throw bad('must be a list');
	value.forEach(statement);
	return value as Policy;
}
