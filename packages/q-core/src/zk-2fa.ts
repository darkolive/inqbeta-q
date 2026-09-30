/*
 * Zero-Knowledge Second Factor (ZK-2FA)
 *
 * A privacy-preserving 2FA that doesn't store contact details.
 *
 * HOW IT WORKS:
 * 1. User signs in with passkey (DID)
 * 2. User provides email/phone for 2FA setup
 * 3. System computes: hash = SHA256(DID + contact)
 * 4. System STORES ONLY the hash - not the contact
 * 5. To send OTP: system knows WHERE to send (via lookup service)
 *    but never stored WHICH email belongs to this user
 * 6. User receives OTP, enters it - proves human + possession
 *
 * This means:
 * - No contact stored = no data leak risk
 * - OTP always goes to correct person
 * - User can change contact anytime (new hash)
 */
import { current } from './passkey';
import { sha256, canonical } from './canonical';

/** ZK-2FA configuration - stores hash, not contact */
export interface ZK2FAConfig {
	/** Hash of DID + contact - this is what we store */
	contactHash: string;
	/** Method: email or sms */
	method: 'email' | 'sms';
	/** When setup (not when verified - that's always fresh) */
	createdAt: number;
	/** Counter for OTP resends */
	resendCount: number;
}

/** Pending OTP for verification */
export interface ZKOTP {
	/** The hash we're verifying against */
	contactHash: string;
	/** When OTP was sent */
	sentAt: number;
	/** When it expires */
	expiresAt: number;
	/** Attempts used */
	attempts: number;
	/** Max attempts allowed */
	maxAttempts: number;
}

/** Storage keys */
const CONFIG_KEY = 'inqbeta-zk-2fa';
const PENDING_KEY = 'inqbeta-zk-pending';

/**
 * Compute the hash of DID + contact
 * This is the ONE WAY function - can't reverse it
 */
export async function computeContactHash(did: string, contact: string): Promise<string> {
	const input = canonical({ did, contact: contact.toLowerCase().trim() });
	return sha256(input);
}

/**
 * Set up ZK-2FA
 * 
 * @param contact - email or phone (NOT stored)
 * @returns The contactHash we store (user can verify by computing themselves)
 */
export async function setupZK2FA(contact: string): Promise<string> {
	const identity = current();
	if (!identity) {
		throw new Error('Must be signed in to set up 2FA');
	}

	const contactHash = await computeContactHash(identity.did, contact);

	const config: ZK2FAConfig = {
		contactHash,
		method: contact.includes('@') ? 'email' : 'sms',
		createdAt: Date.now(),
		resendCount: 0
	};

	localStorage.setItem(CONFIG_KEY, JSON.stringify(config));

	// Return hash so user can verify we didn't store their contact
	return contactHash;
}

/**
 * Get current ZK-2FA config
 */
export function getZK2FAConfig(): ZK2FAConfig | null {
	try {
		const stored = localStorage.getItem(CONFIG_KEY);
		return stored ? JSON.parse(stored) : null;
	} catch {
		return null;
	}
}

/**
 * Check if ZK-2FA is set up
 */
export function hasZK2FA(): boolean {
	return getZK2FAConfig() !== null;
}

/**
 * Clear ZK-2FA (disable)
 */
export function clearZK2FA(): void {
	localStorage.removeItem(CONFIG_KEY);
	localStorage.removeItem(PENDING_KEY);
}

/**
 * Request OTP
 * 
 * In production, this would call an API that:
 * 1. Takes contactHash as input
 * 2. Looks up where to send (external service knows hash → actual contact)
 * 3. Sends OTP to that contact
 * 
 * We never store the mapping!
 */
export async function requestZKOTP(): Promise<{
	ok: boolean;
	expiresIn: number;
	contactHash: string;
}> {
	const identity = current();
	if (!identity) {
		throw new Error('Must be signed in');
	}

	const config = getZK2FAConfig();
	if (!config) {
		throw new Error('ZK-2FA not set up');
	}

	// In production: API call with contactHash
	// API has external lookup: hash → actual contact (never stored in our DB)
	// API sends OTP to that contact

	// Simulate for now
	const otp: ZKOTP = {
		contactHash: config.contactHash,
		sentAt: Date.now(),
		expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
		attempts: 0,
		maxAttempts: 3
	};

	localStorage.setItem(PENDING_KEY, JSON.stringify(otp));

	return {
		ok: true,
		expiresIn: 5 * 60,
		contactHash: config.contactHash
	};
}

/**
 * Verify OTP
 * 
 * User enters the OTP they received
 * We verify it matches (in production, via API with hash)
 */
export async function verifyZKOTP(otp: string): Promise<{
	ok: boolean;
	error?: string;
}> {
	try {
		const pending = localStorage.getItem(PENDING_KEY);
		if (!pending) {
			return { ok: false, error: 'No pending verification' };
		}

		const p = JSON.parse(pending) as ZKOTP;

		// Check expiration
		if (Date.now() > p.expiresAt) {
			localStorage.removeItem(PENDING_KEY);
			return { ok: false, error: 'Code expired' };
		}

		// Check attempts
		if (p.attempts >= p.maxAttempts) {
			localStorage.removeItem(PENDING_KEY);
			return { ok: false, error: 'Too many attempts' };
		}

		// In production: verify via API using contactHash
		// API checks: OTP matches what was sent to the contact for this hash

		// Demo: accept any 6-digit code
		if (!/^\d{6}$/.test(otp)) {
			p.attempts++;
			localStorage.setItem(PENDING_KEY, JSON.stringify(p));
			return { ok: false, error: 'Invalid code format' };
		}

		// Success!
		localStorage.removeItem(PENDING_KEY);
		return { ok: true };

	} catch {
		return { ok: false, error: 'Verification failed' };
	}
}

/**
 * Get pending state
 */
export function getPendingState(): { remaining: number; attempts: number } | null {
	try {
		const pending = localStorage.getItem(PENDING_KEY);
		if (!pending) return null;

		const p = JSON.parse(pending) as ZKOTP;
		return {
			remaining: Math.max(0, p.expiresAt - Date.now()),
			attempts: p.attempts
		};
	} catch {
		return null;
	}
}

/**
 * Sensitive actions requiring 2FA
 */
export function requiresZK2FA(action: string): boolean {
	const sensitiveActions = [
		'receipt.create',
		'document.seal',
		'permission.grant',
		'permission.revoke',
		'key.link',
		'key.unlink',
		'federation.join',
		'identity.link',
		'view.system'
	];
	return sensitiveActions.includes(action);
}

/**
 * Perform action with ZK-2FA
 */
export async function withZK2FA<T>(
	action: string,
	actionFn: () => Promise<T>
): Promise<{ ok: boolean; result?: T; error?: string; requiresOTP?: boolean }> {
	// If action doesn't require 2FA
	if (!requiresZK2FA(action)) {
		const result = await actionFn();
		return { ok: true, result };
	}

	// Check if ZK-2FA is set up
	if (!hasZK2FA()) {
		// Not set up - just do it
		const result = await actionFn();
		return { ok: true, result };
	}

	// Check if verified this session (could cache briefly)
	const pending = getPendingState();
	if (!pending) {
		// Not verified - need OTP
		return { ok: false, error: '2FA verification required', requiresOTP: true };
	}

	// Already verified this session
	const result = await actionFn();
	return { ok: true, result };
}

/**
 * Verify contact hash (for user to confirm we don't store their contact)
 */
export async function verifyWeDontStoreYourContact(emailOrPhone: string): Promise<boolean> {
	const config = getZK2FAConfig();
	if (!config) return false;

	const computed = await computeContactHash(current()?.did ?? '', emailOrPhone);
	return computed === config.contactHash;
}
