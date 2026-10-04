/*
 * The stories' sound, shared (4 October 2026). One switch for the whole book:
 * Darren moved the speaker off each story's title row to above the list, so
 * the story beside it follows it. On a story's own page, where there is no
 * list, the story shows its own speaker.
 *
 * Remembered on this device as q.decks.voice (on or off).
 */
const KEY = 'q.decks.voice';

export const storyVoice = $state({ on: false, inBook: false });

export function rememberedVoice(): boolean {
	try {
		return localStorage.getItem(KEY) === 'on';
	} catch {
		return false;
	}
}

export function setStoryVoice(on: boolean) {
	storyVoice.on = on;
	try {
		localStorage.setItem(KEY, on ? 'on' : 'off');
	} catch {
		/* not remembered, which is fine */
	}
}
