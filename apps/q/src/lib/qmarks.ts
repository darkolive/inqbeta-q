/*
 * The orange Q wherever "Q" stands alone in a block of static text — for
 * pages written as markup rather than through QText (the legal pages). Walks
 * the text once and swaps each standalone Q for the brand mark, with the
 * hidden letter for screen readers, exactly as QMark draws it.
 */
export function qmarks(node: HTMLElement) {
	const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/\bQ\b/.test((n as Text).data)) nodes.push(n as Text);
	for (const text of nodes) {
		if (text.parentElement?.closest('.sr-only, title, script, style')) continue;
		const parts = text.data.split(/\bQ\b/);
		const frag = document.createDocumentFragment();
		parts.forEach((part, i) => {
			if (part) frag.append(part);
			if (i < parts.length - 1) {
				const img = document.createElement('img');
				img.src = '/inqbeta.svg';
				img.alt = '';
				img.className = 'inline h-[1em] w-auto align-[-0.2em]';
				const letter = document.createElement('span');
				letter.className = 'sr-only';
				letter.textContent = 'Q';
				frag.append(img, letter);
			}
		});
		text.replaceWith(frag);
	}
}
