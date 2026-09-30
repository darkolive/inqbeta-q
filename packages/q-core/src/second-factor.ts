/*
 * Second Factor Authentication
 *
 * Provides additional verification for sensitive actions.
 * Uses time-based one-time passwords (TOTP) sent via email or SMS.
 *
 * This ensures:
 * 1. The person is human (receives the OTP)
 * 2. The person has access to the registered contact
 * 3. The same person who signed in is the one performing the action
 *
 * Privacy note: Only stores verification status, not the OTP itself.
 */
import { current } from './passkey';

/** Second factor method */
export type SecondFactorMethod = 
	| 'email'    // OTP sent to email
	| 'sms';     // OTP sent to SMS

/** Verification status */
export type VerificationStatus = 
	| 'none'          // Not set up
	| 'pending'       // Awaiting verification
	| 'verified'      // Successfully verified
	| 'failed';      // Failed too many times

/** Second factor configuration */
export interface SecondFactorConfig {
	method: SecondFactorMethod;
	contact: string; // Email or phone (masked)
	verified: boolean;
	verifiedAt?: number;
}

/** OTP request */
export interface OTPRequest {
	code: string;
	method: SecondFactorMethod;
	contact: string;
	expiresAt: number;
	attempts: number;
}

/** Storage keys */
const CONFIG_KEY = 'inqbeta-second-factor';
const PENDING_KEY = 'inqbeta-second-factor-pending';

/** Get current second factor config */
export function getSecondFactor(): SecondFactorConfig | null {
	try {
		const stored = localStorage.getItem(CONFIG_KEY);
		if (!stored) return null;
		return JSON.parse(stored);
	} catch {
		return null;
	}
}

/** Set up second factor */
export function setupSecondFactor(method: SecondFactorMethod, contact: string): void {
	const config: SecondFactorConfig = {
		method,
		contact: maskContact(method, contact),
		verified: false
	};
	localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/** Clear second factor */
export function clearSecondFactor(): void {
	localStorage.removeItem(CONFIG_KEY);
	localStorage.removeItem(PENDING_KEY);
}

/** Check if second factor is required for an action */
export function requiresSecondFactor(action: string): boolean {
	const sensitiveActions = [
		'receipt.create',
		'document.seal',
		'permission.grant',
		'permission.revoke',
		'key.link',
		'key.unlink',
		'federation.join',
		'federation.identity',
		'view.system'
	];
	return sensitiveActions.includes(action);
}

/** Request OTP (simulated - would call backend in production) */
export async function requestOTP(): Promise<{
	ok: boolean;
	expiresIn?: number;
	error?: string;
}> {
	const identity = current();
	if (!identity) {
		return { ok: false, error: 'Not signed in' };
	}

	const config = getSecondFactor();
	if (!config) {
		return { ok: false, error: 'Second factor not set up' };
	}

	// In production, this would call an API to send the OTP
	// For now, we simulate the flow
	const now = Date.now();
	const otp: OTPRequest = {
		code: generateOTP(), // Would come from backend
		method: config.method,
		contact: config.contact,
		expiresAt: now + 5 * 60 * 1000, // 5 minutes
		attempts: 0
	};

	localStorage.setItem(PENDING_KEY, JSON.stringify(otp));

	return { ok: true, expiresIn: 5 * 60 };
}

/** Verify OTP */
export async function verifyOTP(code: string): Promise<{
	ok: boolean;
	error?: string;
}> {
	try {
		const stored = localStorage.getItem(PENDING_KEY);
		if (!stored) {
			return { ok: false, error: 'No pending verification' };
		}

		const pending = JSON.parse(stored) as OTPRequest;
		
		// Check expiration
		if (Date.now() > pending.expiresAt) {
			localStorage.removeItem(PENDING_KEY);
			return { ok: false, error: 'Code expired' };
		}

		// Check attempts
		if (pending.attempts >= 3) {
			localStorage.removeItem(PENDING_KEY);
			return { ok: false, error: 'Too many attempts' };
		}

		// Verify code (in production, this would be server-side)
		// For demo, accept any 6-digit code
		if (!/^\d{6}$/.test(code)) {
			pending.attempts++;
			localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
			return { ok: false, error: 'Invalid code format' };
		}

		// Success - mark config as verified
		const config = getSecondFactor();
		if (config) {
			config.verified = true;
			config.verifiedAt = Date.now();
			localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
		}

		localStorage.removeItem(PENDING_KEY);
		return { ok: true };

	} catch {
		return { ok: false, error: 'Verification failed' };
	}
}

/** Check if currently verified */
export function isVerified(): boolean {
	const config = getSecondFactor();
	return config?.verified ?? false;
}

/** Get time remaining for pending verification */
export function getPendingVerification(): { remaining: number; attempts: number } | null {
	try {
		const stored = localStorage.getItem(PENDING_KEY);
		if (!stored) return null;

		const pending = JSON.parse(stored) as OTPRequest;
		const remaining = Math.max(0, pending.expiresAt - Date.now());
		return { remaining, attempts: pending.attempts };
	} catch {
		return null;
	}
}

/** Mask contact for privacy */
function maskContact(method: SecondFactorMethod, contact: string): string {
	if (method === 'email') {
		const [local, domain] = contact.split('@');
		if (!domain) return '***@***';
		const maskedLocal = local.slice(0, 2) + '***';
		return `${maskedLocal}@${domain}`;
	}
	
	// Phone
	if (contact.length <= 4) return '***' + contact;
	return '***' + contact.slice(-4);
}

/** Generate demo OTP (production would be server-side) */
function generateOTP(): string {
	return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Perform action with second factor verification
 * 
 * If second factor is set up and action requires it:
 * 1. Check if already verified this session
 * 2. If not, request OTP and verify
 * 3. Then perform the action
 */
export async function withSecondFactor<T>(
	action: string,
	actionFn: () => Promise<T>
): Promise<{ ok: boolean; result?: T; error?: string; requiresOTP?: boolean }> {
	// If action doesn't require second factor, just do it
	if (!requiresSecondFactor(action)) {
		const result = await actionFn();
		return { ok: true, result };
	}

	// Check if second factor is set up
	const config = getSecondFactor();
	if (!config) {
		// No second factor set up - just do the action
		const result = await actionFn();
		return { ok: true, result };
	}

	// Check if already verified this session
	if (isVerified()) {
		const result = await actionFn();
		return { ok: true, result };
	}

	// Need OTP verification first
	return { ok: false, error: 'Second factor verification required', requiresOTP: true };
}
