/*
 * Slide art: a slide drawn and animated by the stronger model, for the
 * polished build ("Make it final"; ADR-Q-033, 6 October 2026).
 *
 * Darren: "to have a really, really polished end product that you kind of
 * like, I want to put this out, put my name to it. I'm willing to pay more
 * tokens to have that kind of liquid feel, you know, where two people look
 * like they're talking to each other and the whole animation is just really
 * good. And that's worth waiting five, ten minutes for a proper build."
 *
 * The AI writes each slide as one SVG picture with CSS animations, timed in
 * the slide's own seconds. The player holds every animation still and sets
 * its clock to the slide's, so it plays in step with the voice, can be
 * dragged through, and a still is its last moment.
 *
 * SAFE BY CONSTRUCTION. Nothing the AI writes is used as it came. `cleanArt`
 * reads it as a strict list of tags and rebuilds a new picture from the parts
 * it allows: drawing elements, gradients, clips and masks, and one style
 * sheet of animations. No scripts, no event handlers, no links out (a
 * reference may only point inside the picture, "#name"), no foreign content,
 * no text (there is never any writing in the pictures), no entities beyond
 * the plain five. Anything else is dropped, and what was dropped is listed,
 * so the AI can be told on its next round.
 *
 * The player shows each picture inside its own sealed frame (no scripts,
 * nothing loaded from anywhere), so even its style sheet can't reach Q's page.
 *
 * Colours come from Q's palette as CSS variables (--q-olive and the rest),
 * which the player sets for light and dark.
 *
 * Pure. No DOM, no storage, no AI.
 */
import { canonical, sha256 } from './canonical';

export const ART_W = 640;
export const ART_H = 320;
/** The most an SVG may be, in characters, before or after cleaning. */
export const ART_MOST = 60_000;

/** Q's palette, as the AI may use it: var(--q-…). The player defines each for light and dark. */
export const PALETTE = {
	'--q-olive': 'Q’s olive green (the main colour)',
	'--q-olive-soft': 'a pale olive, for soft shapes and glows',
	'--q-orange': 'Q’s warm orange (a person, the thing that matters)',
	'--q-orange-soft': 'a pale orange',
	'--q-ink': 'dark lines and details (light in dark mode)',
	'--q-mid': 'a mid grey, for quiet things',
	'--q-paper': 'the background colour (for cut-outs and highlights on shapes)',
	'--q-good': 'a green, for a tick or "yes"',
	'--q-blue': 'a calm blue, for a second idea'
} as const;

const ELEMENTS = new Set(['svg', 'g', 'defs', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'use', 'style']);
/* The case the browser wants, for the few that have capitals. */
const CASED: Record<string, string> = { lineargradient: 'linearGradient', radialgradient: 'radialGradient', clippath: 'clipPath' };
const ATTRS = new Set([
	'id', 'class', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'fx', 'fy', 'width', 'height', 'points',
	'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit',
	'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'clip-rule', 'transform', 'transform-origin', 'style', 'offset',
	'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod', 'clip-path', 'mask', 'href', 'xlink:href',
	'pathlength', 'vector-effect', 'maskunits', 'clippathunits', 'patternunits'
]);
const CASED_ATTR: Record<string, string> = { gradientunits: 'gradientUnits', gradienttransform: 'gradientTransform', spreadmethod: 'spreadMethod', pathlength: 'pathLength', maskunits: 'maskUnits', clippathunits: 'clipPathUnits', patternunits: 'patternUnits' };
/* CSS properties a picture may set or animate. */
const PROPS = new Set([
	'animation', 'animation-name', 'animation-duration', 'animation-delay', 'animation-timing-function', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode',
	'transform', 'transform-origin', 'transform-box', 'opacity', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
	'fill-opacity', 'stroke-opacity', 'stop-color', 'stop-opacity', 'offset-path', 'offset-distance', 'offset-rotate', 'offset-anchor', 'visibility', 'd', 'r', 'cx', 'cy', 'rx', 'ry', 'mix-blend-mode'
]);

/** A value is safe when it can't reach outside the picture or run anything. */
function safeValue(v: string): boolean {
	const s = v.toLowerCase();
	if (/[<>\\{};]/.test(v)) return false;
	if (/(javascript|expression|@import|behavior|-moz-binding|data:|http:|https:|\/\/)/.test(s)) return false;
	/* url() only to something inside the picture. */
	for (const m of s.matchAll(/url\(([^)]*)\)/g)) if (!/^\s*['"]?#[a-z0-9_-]+['"]?\s*$/.test(m[1])) return false;
	return true;
}
const safeName = (v: string) => /^[A-Za-z][\w-]{0,40}$/.test(v);

/** CSS declarations kept from a block: known properties, safe values. */
function cleanDecls(css: string, dropped: string[]): string {
	const out: string[] = [];
	for (const part of css.split(';')) {
		const i = part.indexOf(':');
		if (i < 0) continue;
		const prop = part.slice(0, i).trim().toLowerCase();
		const value = part.slice(i + 1).trim();
		if (!prop || !value) continue;
		if (!PROPS.has(prop)) {
			dropped.push(`CSS ${prop}`);
			continue;
		}
		if (prop === 'offset-path' && !/^path\(\s*(['"])[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+\1\s*\)$/.test(value)) {
			dropped.push('an offset-path that wasn’t a plain path()');
			continue;
		}
		if (prop !== 'offset-path' && !safeValue(value)) {
			dropped.push(`a ${prop} value`);
			continue;
		}
		out.push(`${prop}:${value}`);
	}
	return out.join(';');
}

/** The style sheet, rebuilt: plain selectors with safe declarations, and @keyframes. Nothing else. */
export function cleanCss(css: string, dropped: string[] = []): string {
	const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const out: string[] = [];
	let i = 0;
	const block = (from: number): [string, number] => {
		/* The body of { … } starting at `from` (just after '{'), braces matched. */
		let depth = 1;
		let j = from;
		while (j < src.length && depth) {
			if (src[j] === '{') depth++;
			else if (src[j] === '}') depth--;
			j++;
		}
		return [src.slice(from, j - 1), j];
	};
	while (i < src.length) {
		const open = src.indexOf('{', i);
		if (open < 0) break;
		const head = src.slice(i, open).trim();
		const [body, next] = block(open + 1);
		i = next;
		const kf = /^@(?:-webkit-)?keyframes\s+([A-Za-z][\w-]{0,40})$/.exec(head);
		if (kf) {
			const steps: string[] = [];
			let k = 0;
			while (k < body.length) {
				const o = body.indexOf('{', k);
				if (o < 0) break;
				const sel = body.slice(k, o).trim();
				const c = body.indexOf('}', o);
				if (c < 0) break;
				if (/^((from|to|\d{1,3}(\.\d+)?%)\s*,?\s*)+$/.test(sel)) steps.push(`${sel}{${cleanDecls(body.slice(o + 1, c), dropped)}}`);
				else dropped.push('a keyframe step');
				k = c + 1;
			}
			out.push(`@keyframes ${kf[1]}{${steps.join('')}}`);
		} else if (/^[#.\w\s,>:*()+~-]+$/.test(head) && !/[@]/.test(head) && head.length <= 200) {
			out.push(`${head}{${cleanDecls(body, dropped)}}`);
		} else dropped.push(`a style rule (${head.slice(0, 30)})`);
	}
	return out.join('\n');
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unent = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENT[e]);
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export interface CleanArt {
	svg: string;
	/** What was taken out, in words (told to the AI on its next round). */
	dropped: string[];
}

/**
 * An SVG picture made safe, or null when nothing drawable is left. The root
 * is always <svg viewBox="0 0 640 320">; only allowed elements, attributes
 * and CSS survive.
 */
export function cleanArt(input: unknown): CleanArt | null {
	if (typeof input !== 'string') return null;
	const src = input.slice(0, ART_MOST * 2);
	const start = src.search(/<svg[\s>]/i);
	if (start < 0) return null;
	const dropped: string[] = [];
	const out: string[] = [];
	const stack: { name: string; kept: boolean }[] = [];
	let skipping = 0;
	let drawn = 0;
	const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!(?:DOCTYPE|ENTITY)[\s\S]*?>|<\/\s*([A-Za-z][\w:-]*)\s*>|<([A-Za-z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g;
	let m: RegExpExecArray | null;
	re.lastIndex = start;
	let inStyle = false;
	let styleText = '';
	while ((m = re.exec(src))) {
		const [whole, cdata, close, open, attrs, selfClose, text] = m;
		if (whole.startsWith('<!--') || whole.startsWith('<?')) continue;
		if (whole.startsWith('<!D') || whole.startsWith('<!E')) {
			dropped.push('a DOCTYPE or ENTITY');
			continue;
		}
		if (cdata !== undefined || text !== undefined) {
			const t = cdata ?? unent(text ?? '');
			if (inStyle && !skipping) styleText += t;
			else if (t.trim() && !skipping) dropped.push('writing (there is never writing in the pictures)');
			continue;
		}
		if (close) {
			const top = stack.pop();
			if (!top) break;
			if (!top.kept) skipping--;
			else {
				if (top.name === 'style') {
					out.push(`<style>${cleanCss(styleText, dropped).replace(/</g, '')}</style>`);
					inStyle = false;
					styleText = '';
				} else out.push(`</${CASED[top.name] ?? top.name}>`);
			}
			if (!stack.length) break;
			continue;
		}
		const name = open.toLowerCase();
		const root = !stack.length;
		const kept = !skipping && ELEMENTS.has(name) && (root ? name === 'svg' : name !== 'svg');
		if (!kept) {
			if (!skipping) dropped.push(name === 'text' || name === 'tspan' ? 'writing (there is never writing in the pictures)' : `<${name}>`);
			if (root) return null;
			if (!selfClose) {
				stack.push({ name, kept: false });
				skipping++;
			}
			continue;
		}
		const parts: string[] = [];
		if (root) parts.push(`viewBox="0 0 ${ART_W} ${ART_H}"`, 'xmlns="http://www.w3.org/2000/svg"');
		for (const a of (attrs ?? '').matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) {
			const an = a[1].toLowerCase();
			const av = unent(a[2] ?? a[3] ?? '');
			if (root && (an === 'viewbox' || an === 'xmlns' || an === 'xmlns:xlink' || an === 'width' || an === 'height')) continue;
			if (!ATTRS.has(an)) {
				dropped.push(an.startsWith('on') ? 'an event handler' : `the ${an} attribute`);
				continue;
			}
			if ((an === 'href' || an === 'xlink:href') && !/^#[A-Za-z][\w-]*$/.test(av)) {
				dropped.push('a link out of the picture');
				continue;
			}
			if ((an === 'id' || an === 'class') && !av.split(/\s+/).every(safeName)) continue;
			const value = an === 'style' ? cleanDecls(av, dropped) : av;
			if (an !== 'style' && !safeValue(value)) {
				dropped.push(`a ${an} value`);
				continue;
			}
			if (value) parts.push(`${an === 'xlink:href' ? 'href' : (CASED_ATTR[an] ?? an)}="${attr(value)}"`);
		}
		if (name !== 'svg' && name !== 'style' && name !== 'defs' && name !== 'g') drawn++;
		if (name === 'style') {
			stack.push({ name, kept: true });
			inStyle = true;
			styleText = '';
			if (selfClose) {
				stack.pop();
				inStyle = false;
			}
			continue;
		}
		const tag = CASED[name] ?? name;
		out.push(`<${tag}${parts.length ? ' ' + parts.join(' ') : ''}${selfClose ? '/>' : '>'}`);
		if (!selfClose) stack.push({ name, kept: true });
	}
	/* Close anything left open, in order. */
	while (stack.length) {
		const top = stack.pop()!;
		if (top.kept && top.name !== 'style') out.push(`</${CASED[top.name] ?? top.name}>`);
	}
	const svg = out.join('');
	if (!drawn || svg.length > ART_MOST) return null;
	return { svg, dropped: [...new Set(dropped)] };
}

/** A slide's art as kept on its record: the picture's address (the picture itself is kept beside the book), and how long it plays. */
export interface ArtRef {
	/** SHA-256 of the cleaned SVG, base64url (as Q's other content addresses). */
	hash: string;
	/** The seconds the animation was written for. */
	seconds: number;
	/** Which model drew it. */
	model?: string;
}
export const artHash = (svg: string) => sha256(svg);
export function artRefOf(x: unknown): ArtRef | null {
	const r = (x ?? {}) as Partial<ArtRef>;
	if (typeof r.hash !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(r.hash)) return null;
	const seconds = typeof r.seconds === 'number' && Number.isFinite(r.seconds) ? Math.min(60, Math.max(2, r.seconds)) : 6;
	return { hash: r.hash, seconds, ...(typeof r.model === 'string' && r.model ? { model: r.model.slice(0, 80) } : {}) };
}
/** For tests and receipts: the canonical text of an art reference. */
export const artRefText = (r: ArtRef) => canonical(r);
