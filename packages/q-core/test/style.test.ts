/*
 * How a block looks.
 *
 * The argument under test: arbitrary CSS is behaviour. It does not look like
 * code and it does things — a background URL is a beacon, position can cover a
 * page's own controls, and one literal colour silently breaks dark mode on
 * somebody else's screen. So a template chooses from closed scales, and every
 * class is written out rather than assembled.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALLED, SCALES, checkStyle, styleQuestions } from '../src/style';
/* Reaching across into q-ui on purpose: the rule lives here and the classes
 * live there, and the only thing stopping them drifting is this test. */
import { COVERS, classesFor, lookOf } from '../../q-ui/src/look';
import { checkSet, QUESTION_SET_SCHEMA } from '../src/questions';
import { SETTINGS, BLOCKS } from '../src/blocks';

test('raw CSS is refused by field name, and told why in terms of who it breaks for', () => {
	for (const field of ['css', 'style', 'color', 'background', 'position', 'zIndex', 'fontSize', 'width']) {
		const c = checkStyle({ [field]: 'anything' });
		assert.equal(c.ok, false, field);
		assert.deepEqual(c.refused, [field]);
		assert.match(c.says, /dark mode|screen reader|phone/i);
	}
});

test('a value off the scale is refused rather than silently ignored', () => {
	assert.equal(checkStyle({ pad: 'normal' }).ok, true);
	const made_up = checkStyle({ pad: '13px' });
	assert.equal(made_up.ok, false);
	assert.match(made_up.says, /not one of the choices for pad/);
	assert.match(checkStyle({ sparkle: 'yes' }).says, /no setting called .sparkle./);
});

test('every token on every scale has a name a person would use', () => {
	for (const [key, scale] of Object.entries(SCALES)) {
		for (const token of scale) {
			const called = CALLED[key as keyof typeof CALLED][token];
			assert.ok(called && called.length > 2, `${key}.${token} has no name`);
			/* Named for what it IS, not how big: 'Roomy', never '32px'. */
			assert.doesNotMatch(called, /\d/, `${key}.${token} names a measurement`);
		}
	}
});

test('there is no font-size token, because a role says what a thing is', () => {
	assert.equal('size' in SCALES, false);
	assert.equal('fontSize' in SCALES, false);
});

/*
 * A class is a whole word.
 *
 * Written with `.includes()` first, and it failed — because "gap-4" CONTAINS
 * "p-4". Substring matching on class names is wrong everywhere, not only here,
 * and it fails in the direction that passes: a test looking for p-4 would have
 * been satisfied by gap-4 for ever.
 */
const has = (classes: string, one: string) => classes.split(/\s+/).includes(one);

test('classes are produced whole, so Tailwind can find them in the source', () => {
	const out = classesFor({ pad: 'loose', frame: 'filled', tone: 'success', edge: 'round', align: 'centre' });
	for (const expected of ['p-8', 'gap-4', 'preset-tonal-success', 'rounded-2xl', 'text-center']) {
		assert.ok(has(out, expected), `${expected} missing from "${out}"`);
	}
	/* And the trap itself, asserted so nobody reintroduces it. */
	assert.ok(classesFor({}).includes('p-4'), 'gap-4 contains p-4 as a substring');
	assert.equal(has(classesFor({}), 'p-4'), false, 'but it is not the class p-4');
});

test('every tone and frame pair resolves to a real token, so no combination is blank', () => {
	for (const frame of SCALES.frame) {
		for (const tone of SCALES.tone) {
			const out = classesFor({ frame, tone });
			if (frame === 'none' && tone === 'plain') continue;
			assert.ok(out.trim().length > 0, `${frame}/${tone} produced nothing`);
		}
	}
});

test('the defaults are sensible: no box means no padding, a box means some', () => {
	assert.equal(has(classesFor({}), 'p-4'), false);
	assert.equal(has(classesFor({ frame: 'outline' }), 'p-4'), true);
	assert.equal(has(classesFor({ frame: 'outline', pad: 'none' }), 'p-4'), false, 'and it is still overridable');
});

test('the same style always gives the same classes, in the same order', () => {
	assert.equal(classesFor({ pad: 'tight', tone: 'primary' }), classesFor({ tone: 'primary', pad: 'tight' }));
});

test('style settings are questions, so the panel is generated like every other', () => {
	const set = {
		schema: QUESTION_SET_SCHEMA,
		id: 'q/style',
		title: { 'en-GB': 'Look' },
		questions: styleQuestions(),
	};
	assert.equal(checkSet(set).ok, true);
	assert.equal(styleQuestions().length, Object.keys(SCALES).length);
	for (const q of styleQuestions()) assert.ok(q.choices.length > 1, `${q.id} offers no choice`);
});

test('q-ui knows a class for every token this package allows', () => {
	for (const [scale, tokens] of Object.entries(SCALES)) {
		for (const token of tokens) {
			assert.ok(
				(COVERS as Record<string, string[]>)[scale].includes(token),
				`q-ui has no class for ${scale}.${token} — it would silently draw as nothing`,
			);
		}
	}
});

test('every block kind can be styled, including ones added later', () => {
	for (const { kind } of BLOCKS) {
		const asked = SETTINGS[kind].questions.map((q) => q.id);
		for (const key of Object.keys(SCALES)) {
			assert.ok(asked.includes(`q:style/${key}`), `${kind} cannot set ${key}`);
		}
	}
});

test('reading a style back drops anything it does not recognise, never guesses', () => {
	/* lookOf keeps what is there; checkStyle is what refuses nonsense, and it
	 * runs before anything is published. */
	assert.deepEqual(lookOf({ 'q:style/pad': 'loose', 'q:block/says': 'hi' }), { pad: 'loose' });
	assert.equal(checkStyle({ tone: 'nonsense' }).ok, false);
	assert.deepEqual(lookOf({}), {});
	assert.deepEqual(lookOf(), {});
});
