/*
 * Session Management
 *
 * Provides session tokens that prove recent authentication without tracking users.
 * 
 * Privacy design:
 * - No user identifiers stored - only a random session ID
 * - Session expires automatically (default: 24 hours)
 * - Can be cleared by user at any time
 * - Does NOT identify the user - only proves "someone authenticated recently"
 *
 * This is different from "remember me" - we're not remembering WHO you are,
 * just that a valid authentication happened recently.
 */
import { current, type Identity } from './passkey';

/** Session data stored */
interface SessionData {
	/** Random session ID - not derived from user identity */
	sessionId: string;
	/** When session was created */
	createdAt: number;
	/** When session expires */
	expiresAt: number;
	/** Key place used for authentication */
	keyPlace?: string;
}

/** Storage key */
const SESSION_KEY = 'inqbeta-session';

/** Default session duration: 24 hours */
const DEFAULT_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

/** Generate random session ID */
function generateSessionId(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Store session in localStorage */
export function createSession(durationMs = DEFAULT_SESSION_DURATION_MS): SessionData | null {
	const identity = current();
	if (!identity) return null;

	const now = Date.now();
	const session: SessionData = {
		sessionId: generateSessionId(),
		createdAt: now,
		expiresAt: now + durationMs,
		keyPlace: undefined // Could track this if needed
	};

	try {
		localStorage.setItem(SESSION_KEY, JSON.stringify(session));
	} catch {
		// Private browsing or blocked storage
		return null;
	}

	return session;
}

/** Get current session (if valid) */
export function getSession(): SessionData | null {
	try {
		const stored = localStorage.getItem(SESSION_KEY);
		if (!stored) return null;

		const session = JSON.parse(stored) as SessionData;

		// Check expiration
		if (Date.now() > session.expiresAt) {
			clearSession();
			return null;
		}

		return session;
	} catch {
		return null;
	}
}

/** Check if session is valid */
export function hasValidSession(): boolean {
	return getSession() !== null;
}

/** Clear session (user logout) */
export function clearSession(): void {
	try {
		localStorage.removeItem(SESSION_KEY);
	} catch {
		// Ignore errors
	}
}

/** Extend session (on activity) */
export function refreshSession(durationMs = DEFAULT_SESSION_DURATION_MS): SessionData | null {
	const session = getSession();
	if (!session) return null;

	const now = Date.now();
	session.expiresAt = now + durationMs;

	try {
		localStorage.setItem(SESSION_KEY, JSON.stringify(session));
	} catch {
		return null;
	}

	return session;
}

/** Get session age in ms */
export function getSessionAge(): number | null {
	const session = getSession();
	if (!session) return null;
	return Date.now() - session.createdAt;
}

/** Get time until expiry */
export function getSessionTimeRemaining(): number | null {
	const session = getSession();
	if (!session) return null;
	const remaining = session.expiresAt - Date.now();
	return remaining > 0 ? remaining : 0;
}

/**
 * Auto-refresh session on activity
 * Call this on user interactions to keep session alive
 */
export function setupSessionRefresh(): () => void {
	const events = ['click', 'keydown', 'scroll', 'mousemove'];
	let refreshThrottled = false;

	const handler = () => {
		if (refreshThrottled) return;

		refreshThrottled = true;
		setTimeout(() => {
			refreshSession();
			refreshThrottled = false;
		}, 60000); // Refresh max once per minute
	};

	// Add listeners
	for (const event of events) {
		window.addEventListener(event, handler, { passive: true });
	}

	// Return cleanup function
	return () => {
		for (const event of events) {
			window.removeEventListener(event, handler);
		}
	};
}

/**
 * Session-based auto-unlock
 *
 * If user has a valid session AND their DID is remembered,
 * we can auto-trigger the unlock flow without showing "Sign in" button.
 * The passkey still required - we're just skipping the explicit prompt.
 */
export async function tryAutoUnlock(): Promise<{
	ok: boolean;
	reason?: string;
}> {
	// Must have a valid session
	const session = getSession();
	if (!session) {
		return { ok: false, reason: 'no-session' };
	}

	// Must have a remembered DID
	const { remembered } = await import('./passkey');
	const did = remembered();
	if (!did) {
		return { ok: false, reason: 'no-remembered-did' };
	}

	// Session is valid - trigger unlock
	// The user will still get the passkey prompt, but it will be automatic
	return { ok: true };
}
