/*
 * The polished build's AI jobs (ADR-Q-033, "Make it final"; 6 October 2026).
 *
 * A proper build, slide by slide, by the stronger model:
 *
 *   art          draw and animate one slide, as one SVG with CSS animations,
 *                timed to the slide's seconds, in the same world as the slide
 *                before it.
 *   art-review   look at frames of that animation (pictures taken at moments
 *                through the slide) and make it better: clearer, calmer, the
 *                moment landing, nothing overlapping, nothing cut off. Twice.
 *   final        not a call: the most the whole story can cost, agreed once
 *                before any of it runs.
 *
 * The picture comes back as SVG text, never trusted: cleanArt rebuilds it
 * from what's allowed, and what it dropped is told to the next round.
 *
 * Pure: the server makes the calls; the browser takes the frames.
 */
import { ART_H, ART_MOST, ART_W, PALETTE, cleanArt, type CleanArt } from './slide-art';
import { slideSeconds, type Book } from './storybook';
import { briefText, creditsFor, tokensOf, type Rates } from './story-ai';

export type ArtTask =
	| { task: 'art'; book: Book; story: string; slide: string; before?: string }
	| { task: 'art-review'; book: Book; story: string; slide: string; svg: string; frames: { at: number; image: string }[]; dropped: string[]; round: number }
	| { task: 'final'; book: Book; story: string };

/** Review rounds per slide, after its first drawing. */
export const REVIEW_ROUNDS = 2;
/** The moments each review looks at, as fractions of the slide. */
export const REVIEW_AT = [0.15, 0.4, 0.7, 1];
/** About what one frame costs to show the model, in tokens (a 640 × 320 picture). */
export const IMAGE_TOKENS = 450;
/** The most a drawing can write back, in tokens. */
export const ART_OUT = 14_000;

export type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export type ArtMessage = { role: 'system' | 'user'; content: string | Part[] };

export const ART_RULES = `<role>
You are the animator for Q's story engine: a brilliant motion designer and illustrator who explains ideas with moving pictures, the way the best explainer films do. This is the polished build. The person is going to put their name to it and share it, so it must be beautiful, clear and alive.
</role>

<who_watches>
Many watchers are neurodivergent: ADHD, autistic, dyslexic, dyscalculic. The picture must carry the idea on its own, with the sound off. Calm, clear, one idea at a time. Nothing moves that doesn't explain. No flashing, no busy backgrounds, nothing that keeps jumping about.
</who_watches>

<stage>
One SVG, viewBox "0 0 ${ART_W} ${ART_H}". Draw with: g, path, circle, ellipse, rect, line, polyline, polygon, defs, linearGradient, radialGradient, stop, clipPath, mask, use (href="#id" only), and one <style> element.
Never: text or anything that looks like writing, letters, numbers, logos or UI labels; script; foreignObject; image; links; anything loaded from outside; filters. They are removed.
Colours: only these CSS variables, written like var(--q-olive). ${Object.entries(PALETTE)
	.map(([k, v]) => `${k} (${v})`)
	.join('; ')}. Leave the background clear (the player paints it), or use a very soft shape behind the action.
</stage>

<animation>
Animate with CSS only, in the <style>: @keyframes, and animation on classes. Time everything in seconds from the start of the slide (animation-delay is when a thing starts). The slide lasts the seconds you're given: build to the moment that matters around the middle, and have everything settled, a clear still, by the last quarter. Use animation-fill-mode both so things hold where they end. Only a gentle idle may loop (a breath, a soft pulse), and it must not distract.
Liquid movement: ease with cubic-bezier curves, never linear for living things; anticipation before a big move; overlap and follow-through (a head turns a beat before the body); subtle squash and stretch; arcs, not straight lines, for things that travel (offset-path: path('…') with offset-distance from 0% to 100% is good for this). Set transform-box: fill-box and a sensible transform-origin on anything that rotates or scales.
A slow, small camera move (a g around everything, gently scaling or drifting) can make it feel filmed; keep it under 6%.
</animation>

<people>
People are simple and warm: a round head and a soft rounded body, no faces needed beyond perhaps two dots for eyes; one person in var(--q-orange), a second in var(--q-olive), more in --q-blue or --q-mid. They should feel alive: a gentle breathing sway; when two people talk, they turn toward each other, the speaker's head nods slightly and small arcs ripple from them (like sound), a hand lifts in a gesture, and they take turns. When something passes between them, the giver reaches, it travels on an arc, the taker receives it with a small settle.
</people>

<world>
Every slide in a story is one world: the same people in the same colours, the same places, the same objects drawn the same way. If you're shown the slide before, carry its people and things on from where they ended.
</world>

<output>
Answer with the SVG only, in one \`\`\`svg block. Then, after it, one short line starting "Notes:" saying what you did or changed. Nothing else.
</output>`;

const fenceTag = (text: string, tag: string) => text.replace(new RegExp(`</?${tag}\\b[^>]*>`, 'gi'), '');

/** What's needed about the book: the idea, the look and the voice, not the material. */
function bookPart(book: Book): string {
	return briefText({ ...book, refs: [], brief: [] });
}

function slidePart(t: { book: Book; story: string; slide: string }): { text: string; seconds: number } {
	const story = t.book.stories.find((s) => s.id === t.story);
	const i = story?.slides.findIndex((s) => s.id === t.slide) ?? -1;
	if (!story || i < 0) throw new Error('That slide isn’t in the book.');
	const s = story.slides[i];
	const seconds = slideSeconds(story, i);
	const outline = story.slides.map((x, k) => `${k + 1}. ${x.title}${k === i ? '   ← this one' : ''}`).join('\n');
	return {
		seconds,
		text: [
			`<story title=${JSON.stringify(story.title)}>\n${fenceTag(outline, 'story')}\n</story>`,
			`<slide n="${i + 1}" of="${story.slides.length}" seconds="${seconds}">\n<line>${fenceTag(s.title, 'slide')}</line>\n<explanation>${fenceTag(s.subtext, 'slide')}</explanation>\n${s.scene ? `<scene note="The picture as first imagined: a starting point, not a rule.">${fenceTag(s.scene, 'slide')}</scene>` : ''}${s.show ? '\n<note>This is the outcome’s Show it: show the learner doing the small task, inviting them to try.</note>' : ''}\n</slide>`
		].join('\n\n')
	};
}

/** The messages for one art job. */
export function artMessagesFor(t: ArtTask): ArtMessage[] {
	if (t.task === 'final') throw new Error('“final” is agreed, not run.');
	const sp = slidePart(t);
	const intro = [bookPart(t.book), sp.text];
	if (t.task === 'art') {
		const before = t.before ? cleanArt(t.before)?.svg : undefined;
		return [
			{ role: 'system', content: ART_RULES },
			{
				role: 'user',
				content: [
					...intro,
					before ? `<slide_before note="The slide before this one, as finished. Carry its world on.">\n${before}\n</slide_before>` : '',
					`<task>\nDraw and animate this slide. It lasts ${sp.seconds} seconds. Show its one idea so it lands without the words.\n</task>`
				]
					.filter(Boolean)
					.join('\n\n')
			}
		];
	}
	const parts: Part[] = [
		{ type: 'text', text: intro.join('\n\n') },
		{ type: 'text', text: `<your_svg round="${t.round}">\n${cleanArt(t.svg)?.svg ?? ''}\n</your_svg>` },
		{ type: 'text', text: `Frames of your animation as it plays, at ${t.frames.map((f) => `${Math.round(f.at * sp.seconds * 10) / 10}s`).join(', ')} of ${sp.seconds}s:` }
	];
	for (const f of t.frames.slice(0, REVIEW_AT.length)) if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(f.image)) parts.push({ type: 'image_url', image_url: { url: f.image } });
	parts.push({
		type: 'text',
		text: [
			t.dropped.length ? `<removed note="Q removed these from your SVG because they aren't allowed; do without them.">${fenceTag(t.dropped.join('; '), 'removed')}</removed>` : '',
			`<task>\nLook hard at the frames, as a demanding director would. Is the one idea clear with the sound off? Does the key moment land around the middle, and is the end a clear, calm still? Is anything overlapping, cut off, off the stage, too small, or too busy? Does the movement feel alive and liquid, or stiff? Is it one world with the rest of the story? Then give back the whole improved SVG. If it's already excellent, give it back as it is.\n</task>`
		]
			.filter(Boolean)
			.join('\n\n')
	});
	return [
		{ role: 'system', content: ART_RULES },
		{ role: 'user', content: parts }
	];
}

/** Tokens going in for a message list (frames counted as pictures). */
export function artTokensIn(messages: ArtMessage[]): number {
	return messages.reduce((n, m) => n + (typeof m.content === 'string' ? tokensOf(m.content) : m.content.reduce((k, p) => k + (p.type === 'text' ? tokensOf(p.text) : IMAGE_TOKENS), 0)), 0);
}

/** The most one art job can cost, or (for "final") the whole story's polished build. */
export function artUpTo(t: ArtTask, r: Rates): number {
	if (t.task === 'art') return creditsFor(artTokensIn(artMessagesFor(t)), ART_OUT, r);
	if (t.task === 'art-review') {
		/* Quoted as if the picture sent back were the largest allowed, with every frame. */
		const room = tokensOf(' '.repeat(ART_MOST)) + IMAGE_TOKENS * Math.max(0, REVIEW_AT.length - t.frames.length);
		return creditsFor(artTokensIn(artMessagesFor({ ...t, svg: '' })) + room, ART_OUT, r);
	}
	const story = t.book.stories.find((s) => s.id === t.story);
	if (!story) throw new Error('That story isn’t in the book.');
	const frames = REVIEW_AT.map((at) => ({ at, image: 'data:image/png;base64,AAAA' }));
	let total = 0;
	story.slides.forEach((s, i) => {
		const drawIn = artTokensIn(artMessagesFor({ task: 'art', book: t.book, story: story.id, slide: s.id })) + (i > 0 ? tokensOf(' '.repeat(ART_MOST)) : 0);
		total += creditsFor(drawIn, ART_OUT, r);
		for (let k = 1; k <= REVIEW_ROUNDS; k++) total += artUpTo({ task: 'art-review', book: t.book, story: story.id, slide: s.id, svg: '', frames, dropped: [], round: k }, r);
	});
	return Math.round(total * 100) / 100;
}

/** A drawing from the model's reply: the SVG made safe, and its notes. Throws when there's no usable picture. */
export function artFromReply(text: string): CleanArt & { notes: string } {
	const fenced = /```(?:svg|xml)?\s*([\s\S]*?)```/i.exec(text)?.[1] ?? text;
	const art = cleanArt(fenced);
	if (!art) throw new Error('The AI didn’t send back a picture Q could use. Nothing was changed.');
	const notes = (/Notes:\s*(.+)/i.exec(text.slice(text.lastIndexOf('```') + 3))?.[1] ?? '').trim().slice(0, 300);
	return { ...art, notes };
}

/*
 * Practice (no AI, no cost): a plain hand-made drawing, so "Make it final"
 * can be tried and proved for free. Two people turn and talk, and something
 * travels between them on an arc; or, for a slide about one thing, it
 * arrives, settles and glows. Never clever; enough to see the whole build
 * run, frames and all.
 */
export function practiceArt(book: Book, storyId: string, slideId: string, round = 0): string {
	const story = book.stories.find((s) => s.id === storyId);
	const i = story?.slides.findIndex((s) => s.id === slideId) ?? -1;
	const slide = story?.slides[i];
	const t = slideSeconds(story ?? { id: '', title: '', slides: [] }, Math.max(0, i));
	const two = /\b(two|both|each other|between|across|side by side|together|share|sign)\b/i.test(`${slide?.scene ?? ''} ${slide?.title ?? ''} ${slide?.subtext ?? ''}`);
	const k = (n: number) => `${Math.round(n * t * 100) / 100}s`;
	/* A second round drifts the camera in a touch, so a review is seen to change something. */
	const cam = round > 0 ? `.cam{animation:cam ${k(1)} ease-in-out both;transform-box:fill-box;transform-origin:center}@keyframes cam{from{transform:scale(1)}to{transform:scale(1.04)}}` : '';
	const person = (cls: string, x: number, fill: string) =>
		`<g class="${cls}"><g class="breathe"><circle cx="${x}" cy="150" r="26" fill="var(${fill})"/><path d="M${x - 44} 252a44 44 0 0 1 88 0z" fill="var(${fill})"/><circle cx="${x - 8}" cy="146" r="3" fill="var(--q-paper)"/><circle cx="${x + 8}" cy="146" r="3" fill="var(--q-paper)"/></g></g>`;
	if (two)
		return `<svg viewBox="0 0 640 320"><style>
.a{animation:inl ${k(0.25)} cubic-bezier(.2,.8,.3,1.1) both}.b{animation:inr ${k(0.25)} cubic-bezier(.2,.8,.3,1.1) ${k(0.08)} both}
@keyframes inl{from{transform:translateX(-120px);opacity:0}to{transform:none;opacity:1}}@keyframes inr{from{transform:translateX(120px);opacity:0}to{transform:none;opacity:1}}
.breathe{animation:breathe 2.4s ease-in-out infinite;transform-box:fill-box;transform-origin:center bottom}@keyframes breathe{50%{transform:scaleY(1.015)}}
.say{opacity:0;animation:say ${k(0.18)} ease-out ${k(0.3)} both;transform-box:fill-box;transform-origin:left center}@keyframes say{0%{opacity:0;transform:scale(.6)}40%{opacity:1}100%{opacity:0;transform:scale(1.4)}}
.thing{offset-path:path('M190 170 C 260 70, 380 70, 450 170');offset-distance:0%;offset-rotate:0deg;animation:fly ${k(0.3)} cubic-bezier(.45,0,.2,1) ${k(0.45)} both}@keyframes fly{to{offset-distance:100%}}
.glow{opacity:0;animation:glow ${k(0.2)} ease-out ${k(0.72)} both}@keyframes glow{to{opacity:.8}}${cam}
</style><g class="cam"><circle class="glow" cx="450" cy="200" r="70" fill="var(--q-olive-soft)"/>${person('a', 190, '--q-orange')}${person('b', 450, '--q-olive')}<path class="say" d="M226 132q14 18 0 36M238 124q22 26 0 52" fill="none" stroke="var(--q-orange)" stroke-width="4" stroke-linecap="round"/><g class="thing"><rect x="-22" y="-15" width="44" height="30" rx="5" fill="var(--q-paper)" stroke="var(--q-ink)" stroke-width="2"/><rect x="-14" y="-6" width="20" height="3" fill="var(--q-orange)"/><rect x="-14" y="1" width="28" height="3" fill="var(--q-mid)"/></g></g></svg>`;
	return `<svg viewBox="0 0 640 320"><style>
.it{animation:pop ${k(0.3)} cubic-bezier(.2,.9,.3,1.3) both;transform-box:fill-box;transform-origin:center}@keyframes pop{from{transform:scale(.3);opacity:0}to{transform:none;opacity:1}}
.ring{opacity:0;animation:ring ${k(0.3)} ease-out ${k(0.45)} both;transform-box:fill-box;transform-origin:center}@keyframes ring{from{opacity:0;transform:scale(.8)}to{opacity:.9;transform:scale(1)}}${cam}
</style><g class="cam"><circle class="ring" cx="320" cy="160" r="100" fill="var(--q-olive-soft)"/><g class="it"><circle cx="320" cy="160" r="62" fill="var(--q-olive)"/><circle cx="320" cy="160" r="26" fill="var(--q-paper)"/></g></g></svg>`;
}
