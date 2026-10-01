/*
 * Is your vault kept anywhere but here? (The Overview asks, to decide whether
 * to offer the backup steps straight after your card.)
 */
import { folderOwner, lastBackup } from '@inqbeta/q-core/folder';
import { listReplicas } from '@inqbeta/q-core/replicas';
import { current } from '@inqbeta/q-core/passkey';
import { googleChannel } from '$lib/google-channel';

export async function copiesElsewhere(): Promise<number> {
	const did = folderOwner();
	const google = did && current() ? await googleChannel(did).catch(() => null) : null;
	const replicas = await listReplicas().catch(() => []);
	return (google ? 1 : 0) + replicas.length + (lastBackup() ? 1 : 0);
}
