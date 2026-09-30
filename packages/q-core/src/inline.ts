/*
 * Words with a little emphasis in them — and nothing else.
 *
 * A `text` block says things in prose, and prose has **bold**, *italic* and
 * [links](https://example.org). Those three, written the markdown way because
 * that is how every Dark Olive article already is, and because a person can
 * read the source as easily as the page.
 *
 * CLOSED, LIKE THE BLOCKS. Anything else in the words is words: a `<script>`
 * typed into a paragraph is shown as the characters `<script>`, escaped, never
 * as markup. A template still cannot carry behaviour — not even inside a
 * sentence.
 *
 * A LINK IS NOT A BEACON. An image pointing at somewhere else would be fetched
 * the moment a page opened, telling the host who read it; that is why a
 * picture must be a content address. A link is fetched only if the reader
 * chooses to follow it. So links may go anywhere on the web — http(s), mailto,
 * or a path on the same site — and nowhere that runs (`javascript:`, `data:`).
 *
 * The HTML it writes is byte for byte what `marked` writes for the same
 * words, so a page imported from markdown draws exactly as it did. That is
 * checked against every article on the Dark Olive site, not assumed.
 *
 * Pure. No DOM.
 */

export type Inline =
	| { t: 'text'; v: string }
	| { t: 'strong'; c: Inline[] }
	| { t: 'em'; c: Inline[] }
	| { t: 'code'; v: string }
	| { t: 'link'; href: string; title?: string; c: Inline[] }
	| { t: 'br' };

const PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

/** What `marked` does to text: the five characters that matter in HTML. */
export function escapeText(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Where a link may go. Anything else is shown as words. */
export function safeHref(href: string): boolean {
	return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href.trim());
}

/** Read the words into a small tree. Never throws: what it cannot read is text. */
export function parseInline(src: string): Inline[] {
	const out: Inline[] = [];
	let text = '';
	const flush = () => {
		if (text) out.push({ t: 'text', v: text });
		text = '';
	};
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		if (c === '\\' && i + 1 < src.length && PUNCT.test(src[i + 1])) {
			text += src[i + 1];
			i += 2;
			continue;
		}
		if (c === '\\' && src[i + 1] === '\n') {
			flush();
			out.push({ t: 'br' });
			i += 2;
			continue;
		}
		if (c === ' ' && src.startsWith('  \n', i)) {
			let j = i;
			while (src[j] === ' ') j++;
			if (src[j] === '\n') {
				flush();
				out.push({ t: 'br' });
				i = j + 1;
				continue;
			}
		}
		if (c === '`') {
			const end = src.indexOf('`', i + 1);
			if (end > i + 1) {
				flush();
				out.push({ t: 'code', v: src.slice(i + 1, end) });
				i = end + 1;
				continue;
			}
		}
		/* `***x***` is both, written the way marked writes it: em outside. */
		if ((c === '*' || c === '_') && src[i + 1] === c && src[i + 2] === c) {
			const end = src.indexOf(c + c + c, i + 3);
			if (end > i + 3) {
				flush();
				out.push({ t: 'em', c: [{ t: 'strong', c: parseInline(src.slice(i + 3, end)) }] });
				i = end + 3;
				continue;
			}
		}
		if ((c === '*' || c === '_') && src[i + 1] === c) {
			const end = closing(src, i + 2, c + c);
			if (end > i + 2) {
				flush();
				out.push({ t: 'strong', c: parseInline(src.slice(i + 2, end)) });
				i = end + 2;
				continue;
			}
		}
		if (c === '*' || c === '_') {
			const end = closing(src, i + 1, c);
			/* `_` inside a word is a word, not emphasis (snake_case, file_names). */
			const wordy = c === '_' && /\w/.test(src[i - 1] ?? '');
			if (end > i + 1 && !wordy && !/\s/.test(src[i + 1])) {
				flush();
				out.push({ t: 'em', c: parseInline(src.slice(i + 1, end)) });
				i = end + 1;
				continue;
			}
		}
		if (c === '[') {
			const link = readLink(src, i);
			if (link) {
				flush();
				out.push(link.node);
				i = link.end;
				continue;
			}
		}
		text += c;
		i++;
	}
	flush();
	return out;
}

/* The matching close for a run of emphasis, skipping links and code. */
function closing(src: string, from: number, mark: string): number {
	let depth = 0;
	for (let j = from; j < src.length; j++) {
		const ch = src[j];
		if (ch === '\\') {
			j++;
			continue;
		}
		if (ch === '`') {
			const end = src.indexOf('`', j + 1);
			if (end > j) {
				j = end;
				continue;
			}
		}
		if (ch === '[') depth++;
		else if (ch === ']') depth = Math.max(0, depth - 1);
		if (depth === 0 && src.startsWith(mark, j) && !/\s/.test(src[j - 1] ?? ' ')) {
			/* `**` must not be read as the close of a single `*`. */
			if (mark.length === 1 && src[j + 1] === mark && src[j - 1] !== mark) {
				j++;
				continue;
			}
			return j;
		}
	}
	return -1;
}

function readLink(src: string, at: number): { node: Inline; end: number } | null {
	let depth = 0;
	let j = at;
	for (; j < src.length; j++) {
		if (src[j] === '\\') {
			j++;
			continue;
		}
		if (src[j] === '[') depth++;
		else if (src[j] === ']' && --depth === 0) break;
	}
	if (j >= src.length || src[j + 1] !== '(') return null;
	/* Balanced, so Wikipedia's `James_Paine_(architect)` keeps its bracket. */
	let close = -1;
	for (let k = j + 2, d = 0; k < src.length; k++) {
		if (src[k] === '\\') {
			k++;
			continue;
		}
		if (src[k] === '(') d++;
		else if (src[k] === ')') {
			if (d === 0) {
				close = k;
				break;
			}
			d--;
		}
	}
	if (close < 0) return null;
	const inside = src.slice(j + 2, close).trim();
	const m = /^(\S+)(?:\s+"([^"]*)")?$/.exec(inside);
	if (!m || !safeHref(m[1])) return null;
	return {
		node: { t: 'link', href: m[1], ...(m[2] !== undefined ? { title: m[2] } : {}), c: parseInline(src.slice(at + 1, j)) },
		end: close + 1
	};
}

export interface InlineOptions {
	/** How a link is written. Sites differ: Dark Olive opens other sites in a new tab. */
	link?: (href: string, label: string, title?: string) => string;
}

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The default link: other sites open in a new tab, with nothing reaching back. */
export function defaultLink(href: string, label: string, title?: string): string {
	const external = /^https?:\/\//i.test(href);
	const attrs = [
		`href="${escapeAttr(href)}"`,
		title ? `title="${escapeText(title)}"` : '',
		external ? 'target="_blank" rel="noopener noreferrer"' : ''
	].filter(Boolean);
	return `<a ${attrs.join(' ')}>${label}</a>`;
}

/** Words to HTML. Everything that is not one of the three marks is escaped. */
export function inlineHtml(src: string, opts: InlineOptions = {}): string {
	const link = opts.link ?? defaultLink;
	const draw = (nodes: Inline[]): string =>
		nodes
			.map((n) => {
				switch (n.t) {
					case 'text':
						return escapeText(n.v);
					case 'strong':
						return `<strong>${draw(n.c)}</strong>`;
					case 'em':
						return `<em>${draw(n.c)}</em>`;
					case 'code':
						return `<code>${escapeText(n.v)}</code>`;
					case 'br':
						return '<br>';
					case 'link':
						return link(n.href, draw(n.c), n.title);
				}
			})
			.join('');
	return draw(parseInline(src));
}

/** The words with the marks taken off — for descriptions, search and speech. */
export function plainText(src: string): string {
	const flat = (nodes: Inline[]): string =>
		nodes.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : n.t === 'br' ? '\n' : flat(n.c))).join('');
	return flat(parseInline(src));
}
