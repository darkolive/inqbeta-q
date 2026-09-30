/*
 * What counts as a word — shared by the page (highlight, settings) and the
 * voice build (build-voice.mjs), so both count the same words.
 *
 * Most of Q's languages put spaces between words. Chinese does not, so a run
 * of Chinese is split by the platform's own word segmenter (Intl.Segmenter,
 * in every current browser and in Node). Punctuation joins the word before
 * it, as a comma joins the word before it in English.
 */

const CJK = /[㐀-䶿一-鿿豈-﫿]/;

/** Does this text contain Chinese characters? @param {string} s */
export function hasCJK(s) {
	return CJK.test(s);
}

/** @type {Intl.Segmenter | null} */
let seg = null;
function segmenter() {
	if (seg === null && typeof Intl !== 'undefined' && 'Segmenter' in Intl) seg = new Intl.Segmenter('zh', { granularity: 'word' });
	return seg;
}

/**
 * A run of text with no spaces in it, as words: split only if it holds
 * Chinese and a segmenter is at hand; otherwise it is one word.
 * @param {string} run
 * @returns {string[]}
 */
export function splitRun(run) {
	const s = hasCJK(run) ? segmenter() : null;
	if (!s) return [run];
	/** @type {string[]} */
	const out = [];
	let cur = '';
	for (const piece of s.segment(run)) {
		if (piece.isWordLike) {
			if (cur) out.push(cur);
			cur = piece.segment;
		} else cur += piece.segment;
	}
	if (cur) out.push(cur);
	return out;
}

/** The words of a text, in order. @param {string} text @returns {string[]} */
export function wordsOf(text) {
	return text.split(/\s+/).filter(Boolean).flatMap(splitRun);
}
