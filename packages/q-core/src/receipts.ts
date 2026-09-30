/*
 * Receipt Kernel API Client
 *
 * Connects Q to the receipt kernel (kernel-spin) running on port 8787.
 * Handles pushing receipts to Badger and querying indexed state from Dgraph.
 *
 * Endpoints:
 *   POST /v1/internal/receipts - Append a receipt
 *   GET  /v1/internal/receipts?hash=<h> - Get receipt by hash
 *   GET  /v1/internal/receipts?subject=<s> - Get receipt chain by subject
 */
import { canonical } from './canonical';

/** Default kernel-spin URL */
export const DEFAULT_KERNEL_URL = 'http://localhost:8787';

/** Configuration for the receipt kernel */
export interface KernelConfig {
	url: string;
	namespace?: string;
}

/** A receipt to send to the kernel */
export interface KernelReceipt {
	type: string;
	version: string;
	subject: string;
	previous?: string;
	canonical: unknown;
	hash: string;
	createdAt: number;
}

/** Response from appending a receipt */
export interface AppendReceiptResponse {
	hash: string;
	subject: string;
}

/** Response when getting receipts */
export interface GetReceiptResponse {
	hash: string;
	subject: string;
	receipt: KernelReceipt;
}

/** Response when getting a chain */
export interface GetChainResponse {
	subject: string;
	receipts: KernelReceipt[];
	count: number;
}

/** Kernel API client */
export class KernelClient {
	constructor(private config: KernelConfig) {}

	/** Append a receipt to the kernel (Badger store) */
	async appendReceipt(subject: string, receipt: KernelReceipt): Promise<AppendReceiptResponse> {
		const response = await fetch(`${this.config.url}/v1/internal/receipts`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ subject, receipt })
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ message: 'Unknown error' }));
			throw new Error(`Failed to append receipt: ${response.status} - ${error.message || error.error}`);
		}

		return response.json();
	}

	/** Get a receipt by its hash */
	async getReceipt(hash: string): Promise<GetReceiptResponse | null> {
		const response = await fetch(`${this.config.url}/v1/internal/receipts?hash=${encodeURIComponent(hash)}`);

		if (response.status === 404) return null;
		if (!response.ok) {
			throw new Error(`Failed to get receipt: ${response.status}`);
		}

		const data = await response.json();
		return {
			hash: data.hash,
			subject: data.subject,
			receipt: data.receipt
		};
	}

	/** Get a receipt chain for a subject */
	async getChain(subject: string): Promise<GetChainResponse> {
		const response = await fetch(`${this.config.url}/v1/internal/receipts?subject=${encodeURIComponent(subject)}`);

		if (!response.ok) {
			throw new Error(`Failed to get chain: ${response.status}`);
		}

		return response.json();
	}

	/** List all known subjects */
	async listSubjects(): Promise<{ subjects: string[]; count: number }> {
		const response = await fetch(`${this.config.url}/v1/internal/subjects`);

		if (!response.ok) {
			throw new Error(`Failed to list subjects: ${response.status}`);
		}

		return response.json();
	}
}

/** Create a default kernel client */
export function createKernelClient(url?: string): KernelClient {
	return new KernelClient({
		url: url ?? DEFAULT_KERNEL_URL
	});
}

/** Build a receipt from local data */
export function buildReceipt(params: {
	type: string;
	subject: string;
	previous?: string;
	canonical: unknown;
	createdAt?: number;
}): KernelReceipt {
	const createdAt = params.createdAt ?? Date.now();
	// Canonical form for hashing
	const canonicalForm = {
		type: params.type,
		version: '1.0',
		subject: params.subject,
		previous: params.previous ?? null,
		canonical: params.canonical,
		createdAt
	};

	// Simple hash (in production, use proper SHA-256)
	const hash = simpleHash(canonical(canonicalForm));

	return {
		type: params.type,
		version: '1.0',
		subject: params.subject,
		previous: params.previous,
		canonical: params.canonical,
		hash,
		createdAt
	};
}

/** Simple string hash for development */
function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash;
	}
	return Math.abs(hash).toString(16);
}
