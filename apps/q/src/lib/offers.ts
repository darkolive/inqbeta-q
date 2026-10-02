/*
 * What this host offers its members (ADR-Q-020). Read from the host's public
 * settings, which the founder sets in Services on their own computer and sends
 * to the live site.
 *
 * Federations are a plugin: unset or "off", the host is a single site with
 * its own membership, and nobody can found a club inside it.
 */
import { env } from '$env/dynamic/public';

export const FEDERATIONS_SETTING = 'PUBLIC_Q_FEDERATIONS';

export function offersFederations(): boolean {
	return (env.PUBLIC_Q_FEDERATIONS ?? '').trim().toLowerCase() === 'on';
}
