/*
 * Keeping only the CSS a drawn page uses — and its dark rules, rewritten to
 * follow the device instead of a class that needs a script.
 *
 * No imports and no Svelte: plain DOM, so it can be tested in a real browser
 * on its own (see apps/q/test/static-css.html). static-page.ts calls it.
 */

export function stripComments(root: Node) {
	const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
	const found: Node[] = [];
	while (walker.nextNode()) found.push(walker.currentNode);
	for (const c of found) c.parentNode?.removeChild(c);
}

/* The app's own stylesheets. A cross-origin sheet cannot be read, and Q loads none. */
export function sheets(): CSSStyleSheet[] {
	return [...document.styleSheets].filter((s) => {
		try {
			return !!s.cssRules;
		} catch {
			return false;
		}
	});
}

/* ------------------------------------------------------------------ *
 * Keeping only the CSS the page uses
 * ------------------------------------------------------------------ */

/* Split a selector list on its top-level commas — not the ones inside
 * :is(a, b), and not an escaped one inside a class name. */
export function splitSelectors(list: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = '';
	for (let i = 0; i < list.length; i++) {
		const c = list[i];
		if (c === '\\') {
			cur += c + (list[i + 1] ?? '');
			i++;
			continue;
		}
		if (c === '(' || c === '[') depth++;
		else if (c === ')' || c === ']') depth--;
		if (c === ',' && depth === 0) {
			out.push(cur.trim());
			cur = '';
		} else cur += c;
	}
	if (cur.trim()) out.push(cur.trim());
	return out;
}

/* States and parts that querySelector cannot see on a page nobody is touching.
 * Taken off before matching, so `.btn:hover` is kept when there is a .btn.
 * (?<!\\) leaves escaped colons in Tailwind class names alone. */
const PSEUDO =
	/(?<!\\)::?(?:before|after|placeholder|marker|selection|backdrop|file-selector-button|first-line|first-letter|-webkit-[a-z-]+|-moz-[a-z-]+|hover|focus-visible|focus-within|focus|active|visited|target|checked|disabled|enabled|invalid|valid|indeterminate|placeholder-shown|autofill|open|popover-open|user-invalid|user-valid|default|required|optional|read-only|read-write|link|any-link)(?![\w-])/g;

/* Rules for the document itself — the theme's variables, resets, the body. A
 * rule only STARTING there counts; `.dark *` is a descendant rule, not one. */
const ALWAYS = /^(?:\*|:root|:host|html|body)(?![\w-])|(?<!\\):root(?![\w-])/;

export function matchesIn(doc: Document, selectorText: string): boolean {
	for (const sel of splitSelectors(selectorText)) {
		if (ALWAYS.test(sel) || /^::?[a-z-]+$/.test(sel)) return true;
		const bare = sel.replace(PSEUDO, '').trim() || '*';
		try {
			if (doc.querySelector(bare)) return true;
		} catch {
			/* A selector this browser cannot parse cannot match here either. */
		}
	}
	return false;
}

const isStyle = (r: CSSRule): r is CSSStyleRule => 'selectorText' in r;
const isGroup = (r: CSSRule): r is CSSRule & { cssRules: CSSRuleList } => 'cssRules' in r && !isStyle(r);
const prelude = (r: CSSRule) => r.cssText.slice(0, r.cssText.indexOf('{')).trim();

export function keep(list: CSSStyleSheet[] | CSSRuleList, test: (sel: string) => boolean): string {
	const out: string[] = [];
	const rules: CSSRule[] = Array.isArray(list) ? list.flatMap((s) => [...s.cssRules]) : [...list];
	for (const rule of rules) {
		if (isStyle(rule)) {
			if (test(rule.selectorText)) out.push(rule.cssText);
		} else if (rule instanceof CSSImportRule) {
			if (rule.styleSheet) out.push(keep(rule.styleSheet.cssRules, test));
		} else if (isGroup(rule)) {
			if (rule instanceof CSSKeyframesRule) {
				out.push(rule.cssText);
				continue;
			}
			const inner = keep(rule.cssRules, test);
			if (inner) out.push(`${prelude(rule)}{${inner}}`);
		} else {
			/* @font-face, @property, @layer order, @namespace: kept whole. */
			out.push(rule.cssText);
		}
	}
	return out.join('');
}

const DARK = /\.dark(?![\w\\-])/g;

/* Rules that only apply in dark, rewritten from `.dark …` to `:root …`, to sit
 * inside prefers-color-scheme: dark. At-rules that are not groups are already
 * in the light pass and are not repeated. */
export function keepDark(list: CSSStyleSheet[] | CSSRuleList, doc: Document): string {
	const out: string[] = [];
	const rules: CSSRule[] = Array.isArray(list) ? list.flatMap((s) => [...s.cssRules]) : [...list];
	for (const rule of rules) {
		if (isStyle(rule)) {
			const nested = (rule as CSSStyleRule & { cssRules?: CSSRuleList }).cssRules;
			if (!DARK.test(rule.selectorText)) {
				/* Nested CSS (dev builds): `:root { &:where(.dark, .dark *) { … } }`.
				 * The dark part is a child; keep the parent around it. */
				if (nested?.length && matchesIn(doc, rule.selectorText)) {
					const inner = keepDark(nested, doc);
					if (inner) out.push(`${rule.selectorText}{${inner}}`);
				}
				continue;
			}
			DARK.lastIndex = 0;
			/* A nested `&…` rule was matched through its parent already. */
			if (!rule.selectorText.includes('&') && !matchesIn(doc, rule.selectorText)) continue;
			const sel = rule.selectorText.replace(DARK, ':root');
			out.push(sel + rule.cssText.slice(rule.cssText.indexOf('{')).replace(DARK, ':root'));
		} else if (rule instanceof CSSImportRule) {
			if (rule.styleSheet) out.push(keepDark(rule.styleSheet.cssRules, doc));
		} else if (isGroup(rule) && !(rule instanceof CSSKeyframesRule)) {
			const inner = keepDark(rule.cssRules, doc);
			if (inner) out.push(`${prelude(rule)}{${inner}}`);
		}
		DARK.lastIndex = 0;
	}
	return out.join('');
}

