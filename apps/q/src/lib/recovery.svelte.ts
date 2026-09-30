/*
 * The recovery ritual's place in the page — kept outside any component.
 *
 * Unlocking with the card signs you in, and signing in changes the layout
 * around the sign-in panel (the landing page becomes the dashboard; the bare
 * keys page gains its header). Components remount; this does not. So the
 * ritual carries on at the step it reached instead of vanishing mid-way.
 */
import type { Envelope } from '@inqbeta/q-core/continuity';
import type { Recovered } from '@inqbeta/q-core/ways-back-in';

export type RecoveryStep = 'find' | 'unlock' | 'sign' | 'reconnect';

export const recovery = $state({
	active: false,
	step: 'find' as RecoveryStep,
	envelope: null as Envelope | null,
	backup: null as File | null,
	recovered: null as Recovered | null,
	added: false
});

/** Start again from the beginning, letting go of the seed if one is held. */
export function endRecovery() {
	recovery.recovered?.done();
	recovery.active = false;
	recovery.step = 'find';
	recovery.envelope = null;
	recovery.backup = null;
	recovery.recovered = null;
	recovery.added = false;
}
