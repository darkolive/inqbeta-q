/*
 * SeaweedFS Replication Client
 *
 * SeaweedFS is an S3-compatible distributed filesystem with IPFS-like addressing.
 * Used for replicating the locked folder across devices.
 *
 * Each device becomes a "namespace node" - evidence lives on the user's devices,
 * with SeaweedFS providing replication between them.
 *
 * SeaweedFS concepts:
 * - Filer: HTTP API for file operations
 * - Volume: storage backend
 * - Collection: groups volumes
 * - Replication: 000, 001, 010, 100 (dc1, dc2, dc3)
 */
import type { FolderItem } from './folder';

/** SeaweedFS configuration */
export interface SeaweedConfig {
	/** Filer URL (e.g., http://localhost:8888) */
	filerUrl: string;
	/** Collection name for this user's files */
	collection?: string;
	/** Replication mode */
	replication?: string;
}

/** File metadata in SeaweedFS */
export interface SeaweedFile {
	/** Full path in SeaweedFS */
	path: string;
	/** FID - file ID */
	fid: string;
	/** Size in bytes */
	size: number;
	/** Content hash */
	etag?: string;
	/** Mime type */
	mime?: string;
	/** Last modified */
	modified?: number;
}

/** Replication status */
export interface ReplicationStatus {
	/** Total files */
	totalFiles: number;
	/** Synced files */
	syncedFiles: number;
	/** Pending files */
	pendingFiles: number;
	/** Last sync timestamp */
	lastSyncedAt: number | null;
}

/** SeaweedFS client */
export class SeaweedClient {
	constructor(private config: SeaweedConfig) {}

	/** Get the base URL */
	private get baseUrl() {
		return this.config.filerUrl.replace(/\/$/, '');
	}

	/** Upload a file */
	async upload(path: string, content: Blob | string, mimeType = 'application/octet-stream'): Promise<SeaweedFile> {
		const response = await fetch(`${this.baseUrl}/${path}`, {
			method: 'POST',
			headers: {
				'Content-Type': mimeType,
				...(this.config.collection && { 'X-Sseaweed-Collection': this.config.collection }),
				...(this.config.replication && { 'X-Sseaweed-Replication': this.config.replication })
			},
			body: content
		});

		if (!response.ok) {
			throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
		}

		const result = await response.json() as {
			 fid: string;
			size: number;
			etag?: string;
		};

		return {
			path,
			fid: result.fid,
			size: result.size,
			etag: result.etag,
			mime: mimeType,
			modified: Date.now()
		};
	}

	/** Download a file */
	async download(path: string): Promise<Blob> {
		const response = await fetch(`${this.baseUrl}/${path}`);

		if (!response.ok) {
			throw new Error(`Download failed: ${response.status}`);
		}

		return response.blob();
	}

	/** Delete a file */
	async delete(path: string): Promise<void> {
		const response = await fetch(`${this.baseUrl}/${path}`, {
			method: 'DELETE'
		});

		if (!response.ok && response.status !== 404) {
			throw new Error(`Delete failed: ${response.status}`);
		}
	}

	/** List files in a directory */
	async list(dirPath: string): Promise<SeaweedFile[]> {
		const response = await fetch(`${this.baseUrl}/list${dirPath}?pretty=y`);

		if (!response.ok) {
			if (response.status === 404) return [];
			throw new Error(`List failed: ${response.status}`);
		}

		const result = await response.json() as {
			Entries?: Array<{
				FullPath: string;
				Fid: string;
				Size: number;
				Mime: string;
				Modified: number;
			}>;
		};

		return (result.Entries ?? []).map((e) => ({
			path: e.FullPath,
			fid: e.Fid,
			size: e.Size,
			mime: e.Mime,
			modified: e.Modified
		}));
	}

	/** Check if file exists */
	async exists(path: string): Promise<boolean> {
		const response = await fetch(`${this.baseUrl}/${path}`, {
			method: 'HEAD'
		});
		return response.ok;
	}

	/** Get file info (without downloading) */
	async stat(path: string): Promise<SeaweedFile | null> {
		const response = await fetch(`${this.baseUrl}/${path}`, {
			method: 'HEAD'
		});

		if (!response.ok) {
			if (response.status === 404) return null;
			throw new Error(`Stat failed: ${response.status}`);
		}

		const contentLength = response.headers.get('Content-Length');
		const contentType = response.headers.get('Content-Type');
		const lastModified = response.headers.get('Last-Modified');

		return {
			path,
			fid: '',
			size: contentLength ? parseInt(contentLength, 10) : 0,
			mime: contentType ?? undefined,
			modified: lastModified ? new Date(lastModified).getTime() : undefined
		};
	}
}

/** Create a SeaweedFS client */
export function createSeaweedClient(filerUrl: string, options?: { collection?: string; replication?: string }): SeaweedClient {
	return new SeaweedClient({
		filerUrl,
		collection: options?.collection,
		replication: options?.replication
	});
}

/** Sync a folder to SeaweedFS */
export async function syncFolder(
	seaweed: SeaweedClient,
	items: FolderItem[],
	onProgress?: (synced: number, total: number) => void
): Promise<{ synced: number; failed: number; errors: string[] }> {
	let synced = 0;
	let failed = 0;
	const errors: string[] = [];

	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		try {
			// Skip directories
			if (item.kind === 'directory') continue;

			// Read file content
			const file = await item.file();
			if (!file) continue;

			await seaweed.upload(item.diskPath, file);
			synced++;

			if (onProgress) {
				onProgress(synced, items.length);
			}
		} catch (error) {
			failed++;
			errors.push(`${item.diskPath}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	return { synced, failed, errors };
}
