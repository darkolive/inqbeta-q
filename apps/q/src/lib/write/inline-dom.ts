/*
 * What someone typed into an editable paragraph, back into the words a block
 * keeps: **bold**, *italic*, [a link](https://…), and nothing else.
 *
 * The paragraph shows formatted text (inlineHtml draws it); nobody sees an
 * asterisk. Whatever the browser put in the paragraph while they typed —
 * <b> or <strong>, <i> or <em>, stray <span>s and <div>s — comes back as the
 * same three marks, and everything else as plain words. A pasted <script>
 * arrives as text (paste is plain-text only) and could not survive this
 * anyway: an element this does not know is read for its words.
 */
import { safeHref } from '@inqbeta/q-core/inline';

const MARKS = /([\\*_[\]`])/g;

export function toInline(root: Node): string {
	let out = '';
	for (const node of Array.from(root.childNodes)) out += one(node);
	/* Collapse what a contenteditable leaves behind: nbsp, runs of spaces. */
	return out.replace(/ /g, ' ').replace(/[ \t]+\n/g, '  \n').trim();
}

function one(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(MARKS, '\\$1');
	if (node.nodeType !== Node.ELEMENT_NODE) return '';
	const el = node as HTMLElement;
	const inner = toInline(el);
	switch (el.tagName) {
		case 'B':
		case 'STRONG':
			return inner ? `**${inner}**` : '';
		case 'I':
		case 'EM':
			return inner ? `*${inner}*` : '';
		case 'A': {
			const href = el.getAttribute('href') ?? '';
			return inner && safeHref(href) ? `[${inner}](${href})` : inner;
		}
		case 'BR':
			return '  \n';
		case 'DIV':
		case 'P':
			return inner ? `  \n${inner}` : '';
		default:
			return inner;
	}
}
