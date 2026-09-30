/*
 * Exchange & Events System
 *
 * Based on ADR-008 (offline exchange), ADR-023 (asset classes), ADR-024 (transfer).
 * 
 * TYPES:
 * - Events: Things that happen (course completed, message sent, etc.)
 * - Exchanges: Bilateral transfers (credits, assets, values)
 * - Receipts: Signed evidence of events/exchanges
 *
 * EXCHANGE TYPES:
 * - Value: Transfer of credits/assets
 * - Gift: One-way transfer
 * - Trade: Two-way exchange
 * - Contract: Agreement with terms
 */
import { current } from './passkey';
import { sha256, canonical } from './canonical';

/** Event types */
export type EventType = 
	// Course/learning
	| 'course.completed'
	| 'course.started'
	| 'course.progress'
	| 'course.assessment'
	| 'badge.earned'
	
	// Communication
	| 'message.sent'
	| 'message.received'
	| 'message.read'
	
	// Contact
	| 'contact.shared'
	| 'contact.updated'
	| 'contact.revoked'
	
	// Permission
	| 'permission.granted'
	| 'permission.used'
	| 'permission.revoked'
	
	// Federation
	| 'federation.joined'
	| 'federation.left'
	| 'treaty.signed'
	
	// Identity
	| 'identity.linked'
	| 'identity.unlinked'
	| 'key.added'

	// UI (page layouts, components, templates)
	| 'ui.page'
	| 'ui.component'
	| 'ui.template';

/** Exchange types */
export type ExchangeType =
	| 'value'      // Credit transfer
	| 'gift'       // One-way transfer
	| 'trade'      // Two-way exchange
	| 'contract'    // Agreement
	| 'settlement'; // Final payment

/** Asset classes */
export type AssetClass =
	| 'credit'     // Mutable credit
	| 'bearer'    // Bearer instrument
	| 'bond'       // Fixed obligation
	| 'equity'     // Ownership stake
	| 'commodity'   // Physical good
	| 'service'    // Labour/time
	| 'token'      // Digital token;

/** Exchange direction */
export type Direction = 'out' | 'in';

/** Value amount */
export interface Amount {
	value: number;
	currency: string; // e.g., 'credits', 'GBP', 'hours'
	assetClass: AssetClass;
}

/** Exchange participant */
export interface Participant {
	did: string;
	role: 'giver' | 'receiver' | 'seller' | 'buyer';
}

/** Exchange terms */
export interface ExchangeTerms {
	type: ExchangeType;
	assetClass: AssetClass;
	amount: Amount;
	participants: Participant[];
	/** What each party gives/gets */
	give?: Amount;
	get?: Amount;
	/** Contract terms if applicable */
	conditions?: Record<string, unknown>;
	/** Settlement deadline */
	settleBy?: number;
}

/** Exchange receipt (ADR-008 style) */
export interface ExchangeReceipt {
	/** Receipt ID */
	id: string;
	/** Exchange type */
	type: ExchangeType;
	/** Event that triggered it */
	event?: EventType;
	/** The exchange */
	exchange: ExchangeTerms;
	/** Chain link */
	previousHash?: string;
	/** When created */
	createdAt: number;
	/** Signatures */
	signatures: Array<{
		by: string;
		signature: string;
	}>;
	/** Status */
	status: 'pending' | 'settled' | 'disputed' | 'void';
}

/** Event receipt */
export interface EventReceipt {
	id: string;
	event: EventType;
	subject: string;
	metadata: Record<string, unknown>;
	previousHash?: string;
	createdAt: number;
	signatures: Array<{
		by: string;
		signature: string;
	}>;
}

/** Balance entry */
export interface BalanceEntry {
	assetClass: AssetClass;
	currency: string;
	balance: number;
	asOf: number;
}

/** Balance sheet */
export interface BalanceSheet {
	did: string;
	asOf: number;
	entries: BalanceEntry[];
	total: number;
}

/** Ledger entry */
export interface LedgerEntry {
	id: string;
	exchange: ExchangeReceipt | EventReceipt;
	balance: number;
	previousBalance: number;
	asOf: number;
}

/** An exchange receipt carries terms; an event receipt does not. */
export function isExchangeReceipt(r: ExchangeReceipt | EventReceipt): r is ExchangeReceipt {
	return 'exchange' in r;
}

/** A ledger entry known to hold an exchange, not a bare event */
type ExchangeEntry = LedgerEntry & { exchange: ExchangeReceipt };

/** Compute balance from exchange chain */
export function computeBalance(
	entries: LedgerEntry[],
	assetClass: AssetClass,
	currency: string
): BalanceSheet {
	const identity = current();
	if (!identity) {
		throw new Error('Must be signed in');
	}

	const filtered = entries.filter((e): e is ExchangeEntry =>
		isExchangeReceipt(e.exchange) &&
		e.exchange.type === 'value' &&
		e.exchange.exchange.assetClass === assetClass &&
		e.exchange.exchange.amount.currency === currency
	);

	const sorted = [...filtered].sort((a, b) => a.asOf - b.asOf);
	
	let balance = 0;
	const balanceEntries: BalanceEntry[] = [];

	for (const entry of sorted) {
		// Find my change
		const myParticipant = entry.exchange.exchange.participants.find(p => p.did === identity.did);
		if (myParticipant) {
			if (myParticipant.role === 'giver') {
				balance -= entry.exchange.exchange.amount.value;
			} else {
				balance += entry.exchange.exchange.amount.value;
			}
		}

		balanceEntries.push({
			assetClass,
			currency,
			balance,
			asOf: entry.asOf
		});
	}

	return {
		did: identity.did,
		asOf: Date.now(),
		entries: balanceEntries,
		total: balance
	};
}

/** Create an exchange receipt */
export async function createExchangeReceipt(exchange: ExchangeTerms): Promise<ExchangeReceipt> {
	const identity = current();
	if (!identity) {
		throw new Error('Must be signed in');
	}

	const receipt: ExchangeReceipt = {
		id: `ex_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
		type: exchange.type,
		exchange,
		createdAt: Date.now(),
		signatures: [],
		status: 'pending'
	};

	// Hash for chaining
	const hash = await sha256(canonical(receipt));

	return { ...receipt, id: hash.slice(0, 16) };
}

/** Create an event receipt */
export function createEventReceipt(
	event: EventType,
	subject: string,
	metadata: Record<string, unknown> = {}
): EventReceipt {
	const identity = current();
	if (!identity) {
		throw new Error('Must be signed in');
	}

	const receipt: EventReceipt = {
		id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
		event,
		subject,
		metadata,
		createdAt: Date.now(),
		signatures: []
	};

	return receipt;
}

/** Event type categories */
export const EVENT_CATEGORIES: Record<EventType, { category: string; searchable: boolean }> = {
	'course.completed': { category: 'learning', searchable: true },
	'course.started': { category: 'learning', searchable: true },
	'course.progress': { category: 'learning', searchable: true },
	'course.assessment': { category: 'learning', searchable: true },
	'badge.earned': { category: 'learning', searchable: true },
	'message.sent': { category: 'communication', searchable: true },
	'message.received': { category: 'communication', searchable: true },
	'message.read': { category: 'communication', searchable: true },
	'contact.shared': { category: 'contact', searchable: true },
	'contact.updated': { category: 'contact', searchable: true },
	'contact.revoked': { category: 'contact', searchable: true },
	'permission.granted': { category: 'permission', searchable: true },
	'permission.used': { category: 'permission', searchable: true },
	'permission.revoked': { category: 'permission', searchable: true },
	'federation.joined': { category: 'federation', searchable: true },
	'federation.left': { category: 'federation', searchable: true },
	'treaty.signed': { category: 'federation', searchable: true },
	'identity.linked': { category: 'identity', searchable: true },
	'identity.unlinked': { category: 'identity', searchable: true },
	'key.added': { category: 'identity', searchable: true },
	// UI
	'ui.page': { category: 'ui', searchable: true },
	'ui.component': { category: 'ui', searchable: true },
	'ui.template': { category: 'ui', searchable: true },
};

/** Asset class metadata */
export const ASSET_CLASS_INFO: Record<AssetClass, { 
	transferable: boolean;
	divisible: boolean;
	expiry?: boolean;
}> = {
	'credit': { transferable: true, divisible: true },
	'bearer': { transferable: true, divisible: false },
	'bond': { transferable: true, divisible: false, expiry: true },
	'equity': { transferable: true, divisible: true },
	'commodity': { transferable: true, divisible: true },
	'service': { transferable: false, divisible: true },
	'token': { transferable: true, divisible: true },
};

/** Exchange type metadata */
export const EXCHANGE_TYPE_INFO: Record<ExchangeType, {
	requiresCounterparty: boolean;
	settles: boolean;
}> = {
	'value': { requiresCounterparty: true, settles: true },
	'gift': { requiresCounterparty: true, settles: false },
	'trade': { requiresCounterparty: true, settles: true },
	'contract': { requiresCounterparty: true, settles: false },
	'settlement': { requiresCounterparty: true, settles: true },
};
