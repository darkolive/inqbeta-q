/*
 * Shared between the voice build (scripts/build-voice.mjs) and the browser.
 *
 * Plain .js for the same reason as Dark Olive's speech-text.js: the build and
 * the page must agree character for character on what a script hashes to, and
 * the only way to guarantee that is for both to run the same function.
 */

/** Collapse whitespace and trim. @param {string} text */
export function normalise(text) {
	return text.replace(/\s+/g, ' ').trim();
}

/**
 * FNV-1a, 32-bit, hex — proves the audio was made from this script, in this
 * voice, by this model. Change any of the three and the hash changes, so the
 * page falls back rather than playing words it no longer says.
 * @param {string} text
 */
export function hashText(text) {
	const t = normalise(text);
	let h = 0x811c9dc5;
	for (let i = 0; i < t.length; i++) {
		h ^= t.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, '0');
}

/**
 * What a voice file is keyed by.
 * @param {string} model @param {string} voice @param {string} script
 */
export function voiceHash(model, voice, script) {
	return hashText(`${model}|${voice}|${script}`);
}

/**
 * The words alone, with the performance directions taken out — `[warmly]`,
 * `[short pause]` and the like. Used when there is no recording and the
 * browser's own voice has to read the script instead.
 * @param {string} script
 */
export function stripTags(script) {
	return normalise(script.replace(/\[[^\]]*\]/g, ' '));
}
