/*
 * Anything whose presence means a template is trying to DO something.
 *
 * Moved here from blocks.ts on 2026-09-25 so components.ts can refuse the same
 * fields without blocks.ts and components.ts importing each other. blocks.ts
 * re-exports it, so nothing that imported it from there changes.
 *
 * Named one by one because each will look harmless to somebody, and the
 * argument should happen here rather than in a pull request. A template that
 * can run is a template that can be sent.
 */
export const BEHAVIOUR_FIELDS = [
	'onclick', 'onload', 'onerror', 'onchange', 'onsubmit', 'onmouseover',
	'script', 'src', 'srcdoc', 'href', 'action', 'formaction',
	'trigger', 'triggers', 'then', 'run', 'eval', 'fetch', 'url', 'endpoint', 'webhook',
	'style', 'class', 'html', 'innerhtml'
];

/** The keys of an object that name a behaviour. */
export function behaviourIn(o: Record<string, unknown>): string[] {
	return Object.keys(o).filter((k) => BEHAVIOUR_FIELDS.includes(k.toLowerCase()));
}
