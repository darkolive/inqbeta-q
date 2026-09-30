/*
 * Dgraph Client for Indexed Queries
 *
 * Connects to Dgraph (default: localhost:8080) for querying indexed receipts.
 * Dgraph provides full-text search and graph queries over receipt data.
 */
import { createKernelClient, type KernelReceipt } from './receipts';

/** Default Dgraph URL */
export const DEFAULT_DGRAPH_URL = 'http://localhost:8080';

/** Dgraph configuration */
export interface DgraphConfig {
	url: string;
	namespace?: string;
}

/** A receipt indexed in Dgraph */
export interface IndexedReceipt {
	uid: string;
	'receipt.hash': string;
	'receipt.subject': string;
	'receipt.type': string;
	'receipt.createdAt': number;
	'receipt.author'?: string;
	'receipt.event'?: string;
	'receipt.previousHash'?: string;
}

/** Query result from Dgraph */
export interface QueryResult<T> {
	data: T;
	extensions?: {
		latency: {
			parsing: number;
			processing: number;
		};
		 txn: {
			start_ts: number;
		};
	};
}

/** Dgraph client */
export class DgraphClient {
	constructor(private config: DgraphConfig) {}

	/** Execute a GraphQL+- query */
	async query<T>(query: string, variables?: Record<string, string>): Promise<T> {
		const response = await fetch(`${this.config.url}/query`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			},
			body: JSON.stringify({
				query,
				variables
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Dgraph query failed: ${response.status} - ${error}`);
		}

		const result = await response.json() as QueryResult<T>;
		return result.data;
	}

	/** Execute a mutation */
	async mutate(mutation: string, commitNow = true): Promise<{ uids?: Record<string, string> }> {
		const response = await fetch(`${this.config.url}/mutate?commitNow=${commitNow}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/rdf',
				'Accept': 'application/json'
			},
			body: mutation
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Dgraph mutation failed: ${response.status} - ${error}`);
		}

		return response.json();
	}

	/** Get receipts for a subject */
	async getReceiptsBySubject(subject: string): Promise<IndexedReceipt[]> {
		const query = `
			query getReceipts($subject: string) {
				receipts(func: eq(receipt.subject, $subject)) {
					uid
					receipt.hash
					receipt.subject
					receipt.type
					receipt.createdAt
					receipt.author
					receipt.event
					receipt.previousHash
				}
			}
		`;

		const result = await this.query<{ receipts: IndexedReceipt[] }>(query, { subject });
		return result.receipts ?? [];
	}

	/** Get receipts by author (DID) */
	async getReceiptsByAuthor(authorDid: string): Promise<IndexedReceipt[]> {
		const query = `
			query getReceipts($author: string) {
				receipts(func: eq(receipt.author, $author)) {
					uid
					receipt.hash
					receipt.subject
					receipt.type
					receipt.createdAt
					receipt.author
					receipt.event
				}
			}
		`;

		const result = await this.query<{ receipts: IndexedReceipt[] }>(query, { author: authorDid });
		return result.receipts ?? [];
	}

	/** Search receipts by event type */
	async getReceiptsByEvent(event: string): Promise<IndexedReceipt[]> {
		const query = `
			query getReceipts($event: string) {
				receipts(func: eq(receipt.event, $event)) {
					uid
					receipt.hash
					receipt.subject
					receipt.type
					receipt.createdAt
					receipt.author
					receipt.event
				}
			}
		`;

		const result = await this.query<{ receipts: IndexedReceipt[] }>(query, { event });
		return result.receipts ?? [];
	}

	/** Full-text search in receipt payloads */
	async searchReceipts(queryString: string): Promise<IndexedReceipt[]> {
		const query = `
			query search($query: string) {
				receipts(func: alloftext(receipt.event, $query)) {
					uid
					receipt.hash
					receipt.subject
					receipt.type
					receipt.createdAt
					receipt.author
					receipt.event
				}
			}
		`;

		const result = await this.query<{ receipts: IndexedReceipt[] }>(query, { query: queryString });
		return result.receipts ?? [];
	}

	/** Get chain for a subject (ordered by time) */
	async getChainBySubject(subject: string): Promise<IndexedReceipt[]> {
		const query = `
			query getChain($subject: string) {
				receipts(func: eq(receipt.subject, $subject), orderdesc: receipt.createdAt) {
					uid
					receipt.hash
					receipt.subject
					receipt.type
					receipt.createdAt
					receipt.author
					receipt.event
					receipt.previousHash
				}
			}
		`;

		const result = await this.query<{ receipts: IndexedReceipt[] }>(query, { subject });
		return result.receipts ?? [];
	}

	/** Get federation memberships for a DID */
	async getFederations(did: string): Promise<IndexedReceipt[]> {
		const query = `
			query getFederations($did: string) {
				federations(func: eq(receipt.author, $did)) @filter(eq(receipt.event, "federation.joined")) {
					uid
					receipt.hash
					receipt.subject
					receipt.type
					receipt.createdAt
					receipt.author
					receipt.event
				}
			}
		`;

		const result = await this.query<{ federations: IndexedReceipt[] }>(query, { did });
		return result.federations ?? [];
	}
}

/** Create a default Dgraph client */
export function createDgraphClient(url?: string): DgraphClient {
	return new DgraphClient({
		url: url ?? DEFAULT_DGRAPH_URL
	});
}

/** Combined kernel + Dgraph client for full receipt flow */
export interface ReceiptClientConfig {
	kernelUrl?: string;
	dgraphUrl?: string;
}

export class ReceiptClient {
	kernel: ReturnType<typeof createKernelClient>;
	dgraph: DgraphClient;

	constructor(config: ReceiptClientConfig = {}) {
		this.kernel = createKernelClient(config.kernelUrl);
		this.dgraph = createDgraphClient(config.dgraphUrl);
	}

	/** Push a receipt to kernel (Badger), returns when stored */
	async pushReceipt(subject: string, receipt: KernelReceipt) {
		return this.kernel.appendReceipt(subject, receipt);
	}

	/** Query indexed receipts from Dgraph */
	async queryBySubject(subject: string) {
		return this.dgraph.getReceiptsBySubject(subject);
	}

	/** Query chain from Dgraph */
	async queryChain(subject: string) {
		return this.dgraph.getChainBySubject(subject);
	}

	/** Full-text search */
	async search(query: string) {
		return this.dgraph.searchReceipts(query);
	}
}
