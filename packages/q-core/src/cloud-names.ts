/*
 * Shared by the Dropbox and OneDrive channels: each world (DID) gets its own
 * folder, and vault paths are kept flat inside it (a '/' becomes '__'), so
 * listing is one folder, never a walk. Names are hashes, so '__' can't clash.
 */
export const vaultFolder = (did: string) => `Q vault - ${did.slice(-8).replace(/[^A-Za-z0-9]/g, '')}`;
export const flat = (path: string) => path.split('/').join('__');
export const unflat = (name: string) => name.split('__').join('/');

/** Dropbox wants its JSON argument header in plain ASCII. */
export const asciiJson = (o: unknown) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

export interface CloudAccess {
	/** A current access token. `fresh` asks for a new one after a 401. */
	token(fresh?: boolean): Promise<string>;
	/** For tests. */
	fetch?: typeof fetch;
}
