/*
 * Hybrid Access Control
 *
 * Implements the read/attest model:
 * 
 * - READ: Session-based, works offline, no passkey needed
 * - ATTEST: Passkey required for any change (create, seal, sign, link)
 *
 * "The first action enforces the contract - you choose to attest."
 */
import { current, unlock, type Identity } from './passkey';
import { hasValidSession, getSession, createSession, clearSession } from './session';

/** Access level */
export type AccessLevel = 'anonymous' | 'read' | 'attest';

/** Check current access level */
export function getAccessLevel(): AccessLevel {
	// Attest level: has identity keys in memory
	if (current() !== null) {
		return 'attest';
	}

	// Read level: has valid session
	if (hasValidSession()) {
		return 'read';
	}

	// Anonymous
	return 'anonymous';
}

/** Require read access or higher */
export function requireRead(): boolean {
	const level = getAccessLevel();
	return level === 'read' || level === 'attest';
}

/** Require attest access (passkey) */
export async function requireAttest(): Promise<{
	ok: boolean;
	identity: Identity | null;
	error?: string;
}> {
	const level = getAccessLevel();

	// Already have attest level
	if (level === 'attest') {
		return { ok: true, identity: current() };
	}

	// Have session - prompt for passkey
	if (level === 'read') {
		const result = await unlock();
		if (result.ok) {
			createSession(); // Create session after successful attest
			return { ok: true, identity: current() };
		}
		return { ok: false, identity: null, error: result.says };
	}

	// Anonymous - need to sign in first
	const result = await unlock();
	if (result.ok) {
		createSession();
		return { ok: true, identity: current() };
	}
	return { ok: false, identity: null, error: result.says };
}

/** Attestation types */
export type AttestationType = 
	| 'receipt.create'
	| 'document.seal'
	| 'document.unseal'
	| 'key.link'
	| 'key.unlink'
	| 'permission.grant'
	| 'permission.revoke'
	| 'federation.join'
	| 'federation.leave';

/**
 * Perform an attestation - requires passkey
 * 
 * This is the core "free to give, never take" enforcement:
 * every change requires explicit biometric consent
 */
export async function attest<T>(
	type: AttestationType,
	action: () => Promise<T>
): Promise<{ ok: boolean; result?: T; error?: string }> {
	const result = await requireAttest();
	
	if (!result.ok) {
		return { ok: false, error: result.error };
	}

	try {
		const output = await action();
		return { ok: true, result: output };
	} catch (error) {
		return { 
			ok: false, 
			error: error instanceof Error ? error.message : String(error) 
		};
	}
}

/** Check if a specific action type requires attest */
export function requiresAttest(type: AttestationType): boolean {
	// All these actions require passkey
	const attestActions: AttestationType[] = [
		'receipt.create',
		'document.seal',
		'document.unseal',
		'key.link',
		'key.unlink',
		'permission.grant',
		'permission.revoke',
		'federation.join',
		'federation.leave'
	];
	
	return attestActions.includes(type);
}

/** Get access level description */
export function accessDescription(level: AccessLevel): string {
	switch (level) {
		case 'anonymous':
			return 'Sign in to view your receipts and folder';
		case 'read':
			return 'View-only access. Actions require your passkey.';
		case 'attest':
			return 'Full access. All changes require your passkey.';
	}
}

/** Sign out - clear session */
export function signOut(): void {
	clearSession();
}
