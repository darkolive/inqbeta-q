/*
 * The five things a state can be, and the badge that says each one.
 *
 * The tone only confirms what the words say — colour is never the message —
 * so every tone has a word beside it and no page invents a sixth.
 */
export type Tone = 'good' | 'waiting' | 'needs-you' | 'bad' | 'plain';

export const TONES: Record<Tone, string> = {
	good: 'badge preset-tonal-success',
	waiting: 'badge preset-tonal-surface',
	'needs-you': 'badge preset-tonal-warning',
	bad: 'badge preset-tonal-error',
	plain: 'badge preset-outlined-surface-300-700'
};
