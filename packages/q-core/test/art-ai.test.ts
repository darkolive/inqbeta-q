/*
 * The polished build's jobs (ADR-Q-033, Make it final). What matters: the
 * model is briefed fully (stage, palette, timing, people, one world) for the
 * one slide; a review is shown its own frames as pictures; the whole story's
 * cost is agreed once and covers every call; whatever comes back is cleaned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artFromReply, artMessagesFor, artUpTo, REVIEW_AT, REVIEW_ROUNDS, type Part } from '../src/art-ai';
import { bookFrom, finished, keepDrafts, practiceDraft, setIdea, setStories, setStory, setVoice, slideOf, slideSeconds, unfinishedOf, type BookStep } from '../src/storybook';

const RATES = { inPerM: 1200, outPerM: 6000, minorPerCredit: 100 };

async function book() {
	let steps: BookStep[] = [];
	steps = await setIdea(steps, 'b', { title: 'How this site works', subtext: 'Visual, step by step.' }, 'Called?');
	steps = await setStories(steps, 'b', [{ title: 'Two people make a receipt' }], 'Parts?');
	for (const s of practiceDraft(bookFrom(steps, 'b'))) steps = await setStory(steps, 'b', keepDrafts(s), { kind: 'generate', asks: 'Draft?', answer: 'practice' });
	return steps;
}

test('drawing one slide: the full brief, that slide marked, its seconds, the slide before carried on', async () => {
	const b = bookFrom(await book(), 'b');
	const st = b.stories[0];
	const [sys, user] = artMessagesFor({ task: 'art', book: b, story: st.id, slide: st.slides[1].id, before: '<svg><circle r="40" class="you"/><script>x</script></svg>' });
	for (const w of ['viewBox "0 0 640 320"', 'var(--q-olive)', 'cubic-bezier', 'turn toward each other', 'one world', '```svg']) assert.ok((sys.content as string).includes(w), w);
	const u = user.content as string;
	assert.match(u, /← this one/);
	assert.match(u, new RegExp(`seconds="${slideSeconds(st, 1)}"`));
	assert.match(u, /<slide_before[^>]*>\n<svg[^>]*><circle r="40" class="you"\/><\/svg>/, 'the slide before is sent cleaned');
	assert.ok(!u.includes('<script'));
});

test('a review sees its own frames as pictures, and what was removed', async () => {
	const b = bookFrom(await book(), 'b');
	const st = b.stories[0];
	const frames = REVIEW_AT.map((at) => ({ at, image: 'data:image/png;base64,iVBORw0KGgo=' }));
	const [, user] = artMessagesFor({ task: 'art-review', book: b, story: st.id, slide: st.slides[0].id, svg: '<svg><rect width="9" height="9"/></svg>', frames: [...frames, { at: 0.5, image: 'https://evil.example/x.png' }], dropped: ['<script>'], round: 1 });
	const parts = user.content as Part[];
	assert.equal(parts.filter((p) => p.type === 'image_url').length, REVIEW_AT.length, 'only real pictures, at most one per moment');
	const text = parts.filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text').map((p) => p.text).join('\n');
	assert.match(text, /<your_svg round="1">/);
	assert.match(text, /removed these/);
	assert.match(text, /demanding director/);
});

test('the whole story is agreed once, and covers each drawing and every review', async () => {
	const b = bookFrom(await book(), 'b');
	const st = b.stories[0];
	const total = artUpTo({ task: 'final', book: b, story: st.id }, RATES);
	const frames = REVIEW_AT.map((at) => ({ at, image: 'data:image/png;base64,AAAA' }));
	let worst = 0;
	st.slides.forEach((s, i) => {
		worst += artUpTo({ task: 'art', book: b, story: st.id, slide: s.id, ...(i ? { before: `<svg><path d="${'M0 0 L1 1 '.repeat(5000)}"/></svg>` } : {}) }, RATES);
		for (let k = 1; k <= REVIEW_ROUNDS; k++) worst += artUpTo({ task: 'art-review', book: b, story: st.id, slide: s.id, svg: '<svg><rect/></svg>', frames, dropped: [], round: k }, RATES);
	});
	assert.ok(total + 1e-9 >= worst, `agreed ${total} covers the most it can take (${worst})`);
	assert.ok(total > 0);
});

test('a reply’s picture is cleaned; notes kept; no picture, no change', () => {
	const r = artFromReply('Here it is.\n```svg\n<svg><circle r="5" onclick="x"/><script>y</script></svg>\n```\nNotes: two people turn to each other.');
	assert.ok(!r.svg.includes('onclick') && !r.svg.includes('script'));
	assert.equal(r.notes, 'two people turn to each other.');
	assert.throws(() => artFromReply('Sorry, I can’t.'), /didn’t send back a picture/);
});

test('a slide keeps only a real art address; finished means every slide drawn; the voice is kept on the book', async () => {
	assert.equal(slideOf({ title: 't', art: { hash: 'nope' } as never }, 's').art, undefined);
	const s = slideOf({ title: 't', art: { hash: 'b'.repeat(43), seconds: 7 } }, 's');
	assert.equal(s.art?.seconds, 7);
	let steps = await book();
	const st = bookFrom(steps, 'b').stories[0];
	const drawn = { ...st, slides: st.slides.map((x) => ({ ...x, art: { hash: 'c'.repeat(43), seconds: 6 } })) };
	assert.ok(finished(drawn));
	assert.ok(!finished(unfinishedOf(drawn)));
	steps = await setVoice(steps, 'b', { id: 'abcdEFGH1234', name: 'Darren' }, 'Whose voice?');
	assert.deepEqual(bookFrom(steps, 'b').voice, { id: 'abcdEFGH1234', name: 'Darren' });
	steps = await setVoice(steps, 'b', { id: 'bad id!', name: 'x' }, 'Whose voice?');
	assert.equal(bookFrom(steps, 'b').voice, null);
});
