/*
 * Dropbox and OneDrive: the two things each will only do with Q's app
 * secret — turn a sign-in code into tokens, and refresh an access token.
 * Exactly what $lib/server/google.ts does for Google, and no more: this
 * server never sees a file, never stores a token, never logs one. The refresh
 * token goes straight back to the browser, which locks it into the vault.
 *
 * Settings (Vercel → Project → Environment Variables):
 *   DROPBOX_APP_KEY, DROPBOX_APP_SECRET
 *   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
 */
import { env } from '$env/dynamic/private';

export type CloudId = 'dropbox' | 'onedrive';

interface Provider {
	name: string;
	token: string;
	id: () => string | undefined;
	secret: () => string | undefined;
	/** Asked for when signing in (Dropbox reads its scopes from the app's settings too). */
	scope: string;
	authorize: string;
	/** Extra fields on the sign-in address. */
	extra: Record<string, string>;
}

export const PROVIDERS: Record<CloudId, Provider> = {
	dropbox: {
		name: 'Dropbox',
		token: 'https://api.dropboxapi.com/oauth2/token',
		id: () => env.DROPBOX_APP_KEY,
		secret: () => env.DROPBOX_APP_SECRET,
		scope: 'files.metadata.read files.content.read files.content.write',
		authorize: 'https://www.dropbox.com/oauth2/authorize',
		extra: { token_access_type: 'offline' }
	},
	onedrive: {
		name: 'OneDrive',
		token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
		id: () => env.MICROSOFT_CLIENT_ID,
		secret: () => env.MICROSOFT_CLIENT_SECRET,
		scope: 'Files.ReadWrite.AppFolder offline_access',
		authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
		extra: { prompt: 'select_account' }
	}
};

export function providerOf(id: string | undefined): (Provider & { cid: CloudId }) | null {
	return id === 'dropbox' || id === 'onedrive' ? { ...PROVIDERS[id], cid: id } : null;
}

export const configured = (p: Provider) => !!(p.id() && p.secret());

/** A redirect back to this same site's /channels/<provider>, and nothing else. */
export function redirectIsOurs(redirectUri: unknown, origin: string, cid: CloudId): redirectUri is string {
	return typeof redirectUri === 'string' && redirectUri === `${origin}/channels/${cid}`;
}

export async function tokenRequest(p: Provider, fields: Record<string, string>) {
	const res = await fetch(p.token, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ client_id: p.id()!, client_secret: p.secret()!, ...fields })
	});
	const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	if (!res.ok) return { ok: false as const, says: String(body.error_description ?? body.error ?? `${p.name} said ${res.status}`) };
	return {
		ok: true as const,
		accessToken: String(body.access_token),
		expiresIn: Number(body.expires_in ?? 3600),
		...(body.refresh_token ? { refreshToken: String(body.refresh_token) } : {})
	};
}
