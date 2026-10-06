/*
 * Scene recipes (ADR-Q-033, bringing a story to life; 6 October 2026). What
 * matters: anything the AI sends is made to the vocabulary (known pieces,
 * actors that exist, places on the stage); the stage at any moment follows
 * the moves in order; the end is a clear still; words never change when a
 * story is brought to life, and it can go back to stills.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTORS_MOST, MOVES_MOST, MOVE_TIME, practiceRecipe, recipeOf, stageAt, type Recipe } from '../src/scene-recipe';
import { bookFrom, isPiece, keepDrafts, moves, practiceAnimate, practiceDraft, setIdea, setStories, setStory, slideOf, stillsOf, storyOf, type BookStep } from '../src/storybook';
import { animateFromReply, messagesFor, mostOut, promptOf } from '../src/story-ai';

const R = (x: unknown) => recipeOf(x, isPiece);

test('a recipe keeps known pieces, real actors and places on the stage; the rest is dropped', () => {
	const r = R({
		actors: [
			{ id: 'You!', piece: 'person', x: -20, y: 50 },
			{ id: 'them', piece: 'person', x: 80, y: 200, size: 'large' },
			{ id: 'boom', piece: 'rocket', x: 50, y: 50 },
			{ id: 'them', piece: 'phone', x: 1, y: 1 },
			{ id: 'card', piece: 'card', x: 20, y: 40, size: 'small' }
		],
		moves: [
			{ do: 'pass', who: 'card', from: 'you', to: 'them', at: 0.4 },
			{ do: 'enter', who: 'you', at: 0, from: 'left' },
			{ do: 'explode', who: 'you', at: 0.1 },
			{ do: 'link', a: 'you', b: 'nobody', at: 0.2 },
			{ do: 'glow', who: 'them', at: 2 },
			{ do: 'eval', code: 'alert(1)' }
		],
		chart: { kind: 'bars', values: [0.2, 5, -1, 'x'], x: 50, y: 50, at: 0.5 }
	})!;
	assert.deepEqual(r.actors.map((a) => [a.id, a.piece, a.x, a.y, a.size]), [['you', 'person', 8, 50, 'medium'], ['them', 'person', 80, 88, 'large'], ['card', 'card', 20, 40, 'small']]);
	assert.deepEqual(r.moves.map((m) => m.do), ['enter', 'pass', 'glow'], 'sorted by when they start; unknown or broken moves dropped');
	assert.equal(r.moves[2].at, 1 - MOVE_TIME, 'a move can’t start too late to finish');
	assert.deepEqual(r.chart?.values, [0.2, 1, 0]);
	assert.equal(R({ actors: [{ id: 'x', piece: 'nope' }] }), null);
	assert.equal(R('<script>'), null);
	const many = R({ actors: Array.from({ length: 9 }, (_, i) => ({ id: `a${i}`, piece: 'coin' })), moves: Array.from({ length: 20 }, () => ({ do: 'glow', who: 'a0', at: 0 })) })!;
	assert.equal(many.actors.length, ACTORS_MOST);
	assert.equal(many.moves.length, MOVES_MOST);
});

test('the stage at a moment: not there before entering; handed over in the middle; the end is a still', () => {
	const r: Recipe = R({
		actors: [{ id: 'a', piece: 'person', x: 20, y: 60 }, { id: 'b', piece: 'person', x: 80, y: 60 }, { id: 'card', piece: 'card', x: 20, y: 46, size: 'small' }],
		moves: [{ do: 'enter', who: 'b', at: 0.1, from: 'right' }, { do: 'pass', who: 'card', from: 'a', to: 'b', at: 0.4 }, { do: 'link', a: 'a', b: 'b', at: 0.7 }, { do: 'copy', who: 'card', to: 'a', at: 0.7 }]
	})!;
	const at = (t: number) => stageAt(r, t);
	const b0 = at(0).actors.find((x) => x.id === 'b')!;
	assert.equal(b0.opacity, 0, 'b isn’t there before it enters');
	assert.equal(at(1).actors.find((x) => x.id === 'b')!.opacity, 1);
	const mid = at(0.4 + MOVE_TIME / 2).actors.find((x) => x.id === 'card')!;
	assert.ok(mid.x > 30 && mid.x < 70, `the card is on its way (${mid.x})`);
	const end = at(1);
	assert.equal(end.actors.find((x) => x.id === 'card')!.x, 80, 'it ends with b');
	assert.equal(end.links.length, 1);
	assert.equal(end.links[0].drawn, 1);
	assert.equal(end.ghosts.length, 1, 'a copy went back');
	assert.equal(at(0.5).links.length, 0, 'the line isn’t drawn yet');
});

test('a chart grows; a ring keeps one value', () => {
	const r = R({ actors: [], moves: [], chart: { kind: 'ring', values: [0.7, 0.2], at: 0.2 } })!;
	assert.deepEqual(r.chart?.values, [0.7]);
	assert.equal(stageAt(r, 0).chart?.grown, 0);
	assert.equal(stageAt(r, 1).chart?.grown, 1);
});

test('practice: two of a kind face each other and something passes; otherwise the piece arrives and glows', () => {
	const two = practiceRecipe('person', 'Two people sitting across from each other, a document between them.');
	assert.deepEqual(two.actors.map((a) => a.piece), ['person', 'person', 'card']);
	assert.ok(two.moves.some((m) => m.do === 'pass'));
	assert.ok(R(two), 'practice recipes obey the rules too');
	const one = practiceRecipe('padlock', 'A phone with a padlock.');
	assert.equal(one.actors[0].piece, 'padlock');
});

async function book() {
	let steps: BookStep[] = [];
	steps = await setIdea(steps, 'b', { title: 'How this site works', subtext: 'Visual, step by step.' }, 'Called?');
	steps = await setStories(steps, 'b', [{ title: 'Two people make a receipt' }], 'Parts?');
	for (const s of practiceDraft(bookFrom(steps, 'b'))) steps = await setStory(steps, 'b', keepDrafts(s), { kind: 'generate', asks: 'Draft?', answer: 'practice' });
	return steps;
}

test('bringing a story to life changes only how it moves: words stay; back to stills puts it as it was; kept on its chain', async () => {
	let steps = await book();
	const b = bookFrom(steps, 'b');
	const story = b.stories[0];
	const alive = practiceAnimate(story);
	assert.ok(moves(alive));
	assert.deepEqual(alive.slides.map((s) => [s.title, s.subtext, s.draft]), story.slides.map((s) => [s.title, s.subtext, s.draft]));
	steps = await setStory(steps, 'b', alive, { kind: 'animate', asks: 'Bring it to life?', answer: 'practice' });
	assert.ok(moves(bookFrom(steps, 'b').stories[0]), 'the movement is kept on the story’s chain');
	assert.deepEqual(stillsOf(alive), storyOf(story));
	// A bad motion on a slide never gets in.
	assert.equal(slideOf({ title: 't', motion: { actors: [{ id: 'x', piece: 'dragon' }] } as never }, 's').motion, undefined);
});

test('the AI is told the vocabulary and gets the story, not the material; its answer is made to the rules', async () => {
	const b = bookFrom(await book(), 'b');
	const story = b.stories[0];
	const job = { task: 'animate' as const, book: { ...b, refs: [{ id: 'r', kind: 'text' as const, name: 'notes', text: 'SECRET MATERIAL' }] }, story: story.id };
	const text = promptOf(job);
	for (const w of ['<stage>', 'pass:', 'link:', 'copy:', 'never real figures', story.slides[0].title]) assert.ok(text.includes(w), w);
	assert.ok(!text.includes('SECRET MATERIAL'), 'choreography doesn’t pay to read the material again');
	assert.equal(messagesFor(job).length, 2);
	assert.ok(mostOut(job) >= 600);
	const reply = { slides: [{ id: story.slides[0].id, motion: { actors: [{ id: 'you', piece: 'person', x: 25, y: 60 }], moves: [{ do: 'enter', who: 'you', at: 0 }] } }, { id: 'not-a-slide', motion: { actors: [{ id: 'x', piece: 'coin' }] } }] };
	const out = animateFromReply(b, story.id, reply);
	assert.equal(out.slides[0].motion?.actors[0].piece, 'person');
	assert.equal(out.slides[0].title, story.slides[0].title);
	assert.equal(out.slides.length, story.slides.length);
	assert.throws(() => animateFromReply(b, story.id, { slides: [] }), /didn’t send back any movement/);
});
