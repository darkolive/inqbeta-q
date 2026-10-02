/*
 * Your settings, kept in your vault (1 October 2026).
 *
 * Darren: sign out, sign back in, and every announcement shows as new again.
 * Read marks and the notifications card lived only in the browser, and
 * signing out rightly clears the browser. So they're kept here too: an
 * answering like any other, signed and locked in your vault, so they come
 * back when you sign in, on this device or any other that opens your vault.
 * The browser copy is only a quick copy for while you're signed in.
 */
import { QUESTION_SET_SCHEMA, type QuestionSet } from '@inqbeta/q-core/questions';

export const YOUR_SETTINGS: QuestionSet = {
	schema: QUESTION_SET_SCHEMA,
	id: 'q/your-settings',
	title: { 'en-GB': 'Your settings' },
	questions: [
		{
			/* Announcements you've opened, by id. */
			id: 'q:settings/read',
			answer: 'questions',
			asks: { 'en-GB': 'Which announcements have you read?' },
			optional: true
		},
		{
			/* Your notifications card: source → ring, quiet or off. */
			id: 'q:settings/notify',
			answer: 'longtext',
			asks: { 'en-GB': 'What reaches you, and whether it rings' },
			optional: true
		},
		{
			/* Your plugins: which show in the menu, and their order (3 October 2026). */
			id: 'q:settings/plugins',
			answer: 'longtext',
			asks: { 'en-GB': 'Which plugins show in your menu, and in what order' },
			optional: true
		}
	]
};
