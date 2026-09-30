/*
 * The language of headings, as data — for components, and for speech.
 *
 * `className` values are written out in full on purpose: Tailwind finds the
 * classes it must generate by reading source text, so a class name assembled at
 * runtime ('role-' + role) would silently never exist.
 */

export type HeadingRole = 'page-title' | 'section-title' | 'title' | 'subtitle';
export type TextRole = 'description' | 'lead' | 'meta' | 'label' | 'value' | 'count' | 'status' | 'token';
export type Role = HeadingRole | TextRole;

export interface RoleSpec {
	className: string;
	/** The Skeleton token the role looks like — the one place this is said in words. */
	looksLike: string;
	/** What speech says before the text; '' for nothing. */
	spoken: string;
}

export const ROLES: Record<Role, RoleSpec> = {
	'page-title': { className: 'role-page-title', looksLike: 'h3', spoken: 'Page' },
	'section-title': { className: 'role-section-title', looksLike: 'h4', spoken: 'Section' },
	title: { className: 'role-title', looksLike: 'h5', spoken: 'Title' },
	subtitle: { className: 'role-subtitle', looksLike: 'h6', spoken: '' },
	description: { className: 'role-description', looksLike: 'body', spoken: 'Description' },
	lead: { className: 'role-lead', looksLike: 'body, large', spoken: '' },
	meta: { className: 'role-meta', looksLike: 'small, muted', spoken: '' },
	label: { className: 'role-label', looksLike: 'small, medium', spoken: '' },
	value: { className: 'role-value', looksLike: 'body, strong', spoken: '' },
	count: { className: 'role-count', looksLike: '3xl number', spoken: '' },
	status: { className: 'role-status', looksLike: 'xs capitals', spoken: 'Status' },
	token: { className: 'role-token', looksLike: 'mono, xs', spoken: 'Code' }
};

/**
 * What a speech layer should say for an element: its role's spoken prefix, then
 * its text. "Title: Stewarding a Village Carnival." Tokens are not read out
 * character by character — they are announced, not recited.
 */
export function spokenText(el: Element): string {
	const role = el.getAttribute('data-role') as Role | null;
	const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
	if (!role || !(role in ROLES)) return text;
	if (role === 'token') return 'A code, shown on screen.';
	const prefix = ROLES[role].spoken;
	return prefix ? `${prefix}: ${text}` : text;
}
