/*
 * The two things Google will only do with the client secret: turn a sign-in
 * code into tokens, and refresh an access token. That is all this server does
 * with Drive. It never sees a file, never stores a token, never logs one: the
 * refresh token goes straight back to the browser, which locks it in the
 * vault. A storage channel, not an authority (docs/q/storage-channels.md).
 */
import { env } from '$env/dynamic/private';

const TOKEN = 'https://oauth2.googleapis.com/token';

export function configured(): boolean {
	return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** A redirect back to this same site's /channels/google, and nothing else. */
export function redirectIsOurs(redirectUri: unknown, origin: string): redirectUri is string {
	return typeof redirectUri === 'string' && redirectUri === `${origin}/channels/google`;
}

export async function tokenRequest(fields: Record<string, string>) {
	const res = await fetch(TOKEN, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, ...fields })
	});
	const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	if (!res.ok) return { ok: false as const, says: String(body.error_description ?? body.error ?? `Google said ${res.status}`) };
	return {
		ok: true as const,
		accessToken: String(body.access_token),
		expiresIn: Number(body.expires_in ?? 3600),
		...(body.refresh_token ? { refreshToken: String(body.refresh_token) } : {})
	};
}
