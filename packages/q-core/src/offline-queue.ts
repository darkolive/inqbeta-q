/*
 * Offline Receipt Queue
 *
 * Queues receipts locally in IndexedDB when offline, syncs when online.
 * This ensures receipts are never lost due to connectivity issues.
 *
 * The queue persists:
 * - Pending receipts waiting to sync
 * - Sync state (last synced, failed attempts)
 * - Conflict resolution state
 */
import { createKernelClient, type KernelReceipt, type AppendReceiptResponse } from './receipts';

const DB_NAME = 'inqbeta-offline-queue';
const STORE_NAME = 'pending-receipts';
const STATE_STORE = 'sync-state';

/** Download/transfer state for a receipt */
export type ReceiptState = 
	| 'pending'   // Queued, not started
	| 'receiving' // Transfer in progress (0-99%)
	| 'received'  // Transfer complete (100%), can verify signatures
	| 'opened'    // Decrypted and readable
	| 'failed';   // Transfer failed, can retry

/** A receipt waiting to sync */
export interface QueuedReceipt {
	/** Unique ID for this queue entry */
	id: string;
	/** The receipt to sync */
	receipt: KernelReceipt;
	/** Subject this receipt belongs to */
	subject: string;
	/** Direction: incoming or outgoing */
	direction: 'incoming' | 'outgoing';
	/** Download/transfer state */
	state: ReceiptState;
	/** Download progress (0-100), undefined if not started */
	progress?: number;
	/** When it was queued */
	queuedAt: number;
	/** When transfer started */
	startedAt?: number;
	/** When transfer completed */
	completedAt?: number;
	/** Number of sync attempts */
	attempts: number;
	/** Last error if sync failed */
	lastError?: string;
}

/** Sync state */
export interface SyncState {
	/** Last successful sync timestamp */
	lastSyncedAt: number | null;
	/** Whether currently syncing */
	isSyncing: boolean;
	/** Pending count */
	pendingCount: number;
}

/** Open IndexedDB */
function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;

			// Pending receipts store
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'id' });
			}

			// Sync state store
			if (!db.objectStoreNames.contains(STATE_STORE)) {
				db.createObjectStore(STATE_STORE, { keyPath: 'id' });
			}
		};
	});
}

/** Queue a receipt for later sync */
export async function queueReceipt(
	receipt: KernelReceipt, 
	subject: string, 
	direction: 'incoming' | 'outgoing' = 'outgoing'
): Promise<string> {
	const db = await openDB();
	const id = `${receipt.hash}-${Date.now()}`;

	const queued: QueuedReceipt = {
		id,
		receipt,
		subject,
		direction,
		state: 'pending',
		queuedAt: Date.now(),
		attempts: 0
	};

	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const request = store.add(queued);

		request.onsuccess = () => resolve(id);
		request.onerror = () => reject(request.error);
	});
}

/** Update receipt state and progress */
export async function updateReceiptState(
	id: string, 
	state: ReceiptState,
	progress?: number
): Promise<void> {
	const db = await openDB();

	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const getRequest = store.get(id);

		getRequest.onsuccess = async () => {
			const queued = getRequest.result as QueuedReceipt;
			if (!queued) {
				resolve();
				return;
			}

			queued.state = state;
			if (progress !== undefined) {
				queued.progress = progress;
			}
			if (state === 'receiving' && !queued.startedAt) {
				queued.startedAt = Date.now();
			}
			if (state === 'received' || state === 'opened') {
				queued.completedAt = Date.now();
			}

			const putRequest = store.put(queued);
			putRequest.onsuccess = () => resolve();
			putRequest.onerror = () => reject(putRequest.error);
		};

		getRequest.onerror = () => reject(getRequest.error);
	});
}

/** Get receipt by ID */
export async function getReceipt(id: string): Promise<QueuedReceipt | undefined> {
	const db = await openDB();

	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		const request = store.get(id);

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/** Get all pending receipts */
export async function getPendingReceipts(): Promise<QueuedReceipt[]> {
	const db = await openDB();

	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		const request = store.getAll();

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/** Remove a receipt from the queue (after successful sync) */
export async function removeFromQueue(id: string): Promise<void> {
	const db = await openDB();

	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const request = store.delete(id);

		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

/** Update queue entry after failed sync */
export async function markAttempt(id: string, error: string): Promise<void> {
	const db = await openDB();

	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const getRequest = store.get(id);

		getRequest.onsuccess = async () => {
			const queued = getRequest.result as QueuedReceipt;
			if (!queued) {
				resolve();
				return;
			}

			queued.attempts++;
			queued.lastError = error;

			const putRequest = store.put(queued);
			putRequest.onsuccess = () => resolve();
			putRequest.onerror = () => reject(putRequest.error);
		};

		getRequest.onerror = () => reject(getRequest.error);
	});
}

/** Get current sync state */
export async function getSyncState(): Promise<SyncState> {
	const db = await openDB();

	return new Promise((resolve, reject) => {
		const tx = db.transaction(STATE_STORE, 'readonly');
		const store = tx.objectStore(STATE_STORE);
		const request = store.get('main');

		request.onsuccess = async () => {
			const pending = await getPendingReceipts();
			resolve({
				lastSyncedAt: (request.result as { lastSyncedAt?: number })?.lastSyncedAt ?? null,
				isSyncing: false,
				pendingCount: pending.length
			});
		};

		request.onerror = () => reject(request.error);
	});
}

/** Update last synced timestamp */
export async function updateLastSynced(timestamp: number): Promise<void> {
	const db = await openDB();

	return new Promise((resolve, reject) => {
		const tx = db.transaction(STATE_STORE, 'readwrite');
		const store = tx.objectStore(STATE_STORE);
		const request = store.put({ id: 'main', lastSyncedAt: timestamp });

		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

/** Check if online */
export function isOnline(): boolean {
	return navigator.onLine;
}

/** Fetch wrapper that tracks download progress for a receipt */
export async function fetchReceiptWithProgress(
	url: string,
	options: RequestInit & { receiptId?: string } = {}
): Promise<Response> {
	const receiptId = options.receiptId;
	
	// Start tracking if we have a receipt ID
	if (receiptId) {
		await updateReceiptState(receiptId, 'receiving', 0);
	}

	const response = await fetch(url, options);

	// Check if response has Content-Length
	const contentLength = response.headers.get('content-length');
	
	if (receiptId && contentLength && response.body) {
		const total = parseInt(contentLength, 10);
		let loaded = 0;

		// Create a new response that tracks progress
		const reader = response.body.getReader();
		const chunks: Uint8Array<ArrayBuffer>[] = [];
		
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			
			chunks.push(new Uint8Array(value));
			loaded += value.length;
			const progress = Math.round((loaded / total) * 100);
			await updateReceiptState(receiptId, 'receiving', progress);
		}

		// All received
		await updateReceiptState(receiptId, 'received', 100);

		// Return a new Response with the accumulated body
		const body = new Blob(chunks);
		return new Response(body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	} else if (receiptId) {
		// No content-length, assume complete
		await updateReceiptState(receiptId, 'received', 100);
	}

	return response;
}

/** Get all receipts in a specific state */
export async function getReceiptsByState(state: ReceiptState): Promise<QueuedReceipt[]> {
	const all = await getPendingReceipts();
	return all.filter(r => r.state === state);
}

/** Get receipts by direction */
export async function getReceiptsByDirection(direction: 'incoming' | 'outgoing'): Promise<QueuedReceipt[]> {
	const all = await getPendingReceipts();
	return all.filter(r => r.direction === direction);
}

/** Sync all pending receipts to the kernel */
export async function syncPending(kernelUrl?: string): Promise<{
	synced: number;
	failed: number;
	errors: string[];
}> {
	if (!isOnline()) {
		return { synced: 0, failed: 0, errors: ['Offline'] };
	}

	const kernel = createKernelClient(kernelUrl);
	const pending = await getPendingReceipts();

	let synced = 0;
	let failed = 0;
	const errors: string[] = [];

	for (const queued of pending) {
		try {
			await kernel.appendReceipt(queued.subject, queued.receipt);
			await removeFromQueue(queued.id);
			synced++;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await markAttempt(queued.id, message);
			failed++;
			errors.push(`${queued.id}: ${message}`);
		}
	}

	if (synced > 0) {
		await updateLastSynced(Date.now());
	}

	return { synced, failed, errors };
}

/** Set up online/offline listeners */
export function onConnectivityChange(onOnline: () => void, onOffline: () => void): () => void {
	window.addEventListener('online', onOnline);
	window.addEventListener('offline', onOffline);

	// Return cleanup function
	return () => {
		window.removeEventListener('online', onOnline);
		window.removeEventListener('offline', onOffline);
	};
}

/** Auto-sync when coming online */
export function setupAutoSync(kernelUrl?: string, debounceMs = 3000): () => void {
	let timeout: number | null = null;

	const handler = () => {
		if (timeout) clearTimeout(timeout);
		timeout = window.setTimeout(async () => {
			const result = await syncPending(kernelUrl);
			if (result.synced > 0) {
				console.log(`[OfflineQueue] Synced ${result.synced} receipts`);
			}
		}, debounceMs);
	};

	return onConnectivityChange(handler, () => {
		if (timeout) clearTimeout(timeout);
	});
}

/* -------------------------------------------------------------------------- *
 * Background Sync — periodic sync between devices
 * -------------------------------------------------------------------------- */

let backgroundSyncInterval: number | null = null;
let backgroundSyncConfig: { kernelUrl?: string; onSync?: (result: SyncResult) => void } | null = null;

export interface SyncResult {
	synced: number;
	failed: number;
	errors: string[];
	timestamp: string;
	/** Receipts that were synced */
	receipts: string[];
}

/**
 * Start background sync at regular intervals.
 * @param intervalMs Interval in milliseconds (default 5 minutes = 300000ms)
 * @param kernelUrl Optional kernel URL
 * @param onSync Optional callback for sync results
 */
export function startBackgroundSync(
	intervalMs: number = 5 * 60 * 1000,
	kernelUrl?: string,
	onSync?: (result: SyncResult) => void
): void {
	// Stop any existing background sync
	stopBackgroundSync();

	backgroundSyncConfig = { kernelUrl, onSync };

	// Run immediately on start
	runBackgroundSync();

	// Then run at interval
	backgroundSyncInterval = window.setInterval(() => {
		runBackgroundSync();
	}, intervalMs);

	console.log(`[BackgroundSync] Started, interval: ${intervalMs}ms`);
}

/** Run sync once */
async function runBackgroundSync(): Promise<void> {
	if (!backgroundSyncConfig) return;
	if (!isOnline()) {
		console.log('[BackgroundSync] Offline, skipping sync');
		return;
	}

	const { kernelUrl, onSync } = backgroundSyncConfig;
	const receiptsBefore = await getPendingReceipts();
	const receiptIds = receiptsBefore.map(r => r.id);

	const result = await syncPending(kernelUrl);

	const syncResult: SyncResult = {
		synced: result.synced,
		failed: result.failed,
		errors: result.errors,
		timestamp: new Date().toISOString(),
		receipts: receiptIds
	};

	if (result.synced > 0 || result.failed > 0) {
		console.log(`[BackgroundSync] Synced ${result.synced}, failed ${result.failed}`);
	}

	if (onSync) {
		onSync(syncResult);
	}
}

/** Stop background sync */
export function stopBackgroundSync(): void {
	if (backgroundSyncInterval !== null) {
		clearInterval(backgroundSyncInterval);
		backgroundSyncInterval = null;
		backgroundSyncConfig = null;
		console.log('[BackgroundSync] Stopped');
	}
}

/** Get background sync status */
export function isBackgroundSyncRunning(): boolean {
	return backgroundSyncInterval !== null;
}

/** Manually trigger a sync */
export async function triggerSync(): Promise<SyncResult | null> {
	if (!isOnline()) {
		return null;
	}

	if (!backgroundSyncConfig) {
		// Run without callback if not configured
		const result = await syncPending();
		return {
			...result,
			timestamp: new Date().toISOString(),
			receipts: []
		};
	}

	await runBackgroundSync();
	
	// Return the result from the config
	return new Promise((resolve) => {
		const oldOnSync = backgroundSyncConfig?.onSync;
		backgroundSyncConfig!.onSync = (result) => {
			backgroundSyncConfig!.onSync = oldOnSync;
			resolve(result);
		};
	});
}
