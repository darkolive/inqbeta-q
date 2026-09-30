/*
 * Key Types and Conditions
 *
 * A receipt can have different opening conditions:
 * - Key types (passkey, password, etc.)
 * - Time conditions (valid from, valid until)
 * - Location conditions (where it can be opened)
 * - Multi-sig (N of M keys required)
 *
 * This enables sophisticated access control while keeping receipts simple.
 */
import { toDid } from './did';

/** Key types */
export type KeyType =
	| 'passkey'      // Biometric/FIDO2
	| 'password'     // Knowledge-based
	| 'hardware'     // Hardware token (Ledger, YubiKey)
	| 'time'         // Time-locked (opens at/until)
	| 'location'     // Location-locked (GPS, network)
	| 'multi'        // Multi-signature (N of M)
	| 'capability';  // Scope-limited

/** Time condition */
export interface TimeCondition {
	/** Opens at this time (epoch seconds) */
	validFrom?: number;
	/** Closes at this time (epoch seconds) */
	validUntil?: number;
}

/** Location condition */
export interface LocationCondition {
	/** Required network type */
	network?: 'online' | 'offline' | 'any';
	/** Required IP range (CIDR) */
	ipRange?: string[];
	/** Required geographic region */
	region?: string[];
	/** Must be on specific device */
	deviceId?: string;
}

/** Multi-sig condition */
export interface MultiSigCondition {
	/** Required signatures */
	required: number;
	/** Total available keys */
	total: number;
	/** List of allowed signers (DIDs) */
	signers: string[];
}

/** Capability scope */
export interface CapabilityScope {
	/** What commands are allowed */
	commands: string[];
	/** What subjects can be accessed */
	subjects?: string[];
	/** Max uses (for consumable capabilities) */
	maxUses?: number;
	/** Delegation allowed */
	delegable?: boolean;
}

/** Key rule - defines what opens a receipt */
export interface KeyRule {
	/** Key type */
	type: KeyType;
	/** The key identifier (DID for passkey, etc.) */
	key?: string;
	/** Time condition */
	time?: TimeCondition;
	/** Location condition */
	location?: LocationCondition;
	/** Multi-sig condition */
	multiSig?: MultiSigCondition;
	/** Capability scope */
	capability?: CapabilityScope;
}

/** A receipt can have multiple key rules (OR logic by default, AND for multi-sig) */
export interface ReceiptKey {
	/** Human-readable name */
	name: string;
	/** The rule */
	rule: KeyRule;
	/** Meta additional conditions */
	meta?: Record<string, unknown>;
}

/** Full receipt structure */
export interface TypedReceipt {
	/** Receipt ID */
	id: string;
	/** What type of receipt */
	receiptType:
		| 'message'
		| 'request'
		| 'response'
		| 'attestation'
		| 'credential'
		| 'certificate'
		| 'permission'
		| 'link'
		| 'seal';
	/** Who created it */
	author: string;
	/** What it's about */
	subject: string;
	/** When it happened */
	timestamp: number;
	/** The content (sealed or plaintext) */
	content: unknown;
	/** Content type (what kind of data) */
	contentType: string;
	/** Hash of content */
	contentHash: string;
	/** Keys required to open */
	keys: ReceiptKey[];
	/** Previous receipt in chain */
	previousHash?: string;
	/** Signatures */
	signatures: Array<{
		by: string;
		signature: string;
	}>;
}

/** Check if a key rule is satisfied */
export async function checkKeyRule(rule: KeyRule, context: {
	currentTime?: number;
	location?: { ip?: string; region?: string };
	deviceId?: string;
}): Promise<{ satisfied: boolean; reason: string }> {
	const now = context.currentTime ?? Math.floor(Date.now() / 1000);

	// Time check
	if (rule.time) {
		if (rule.time.validFrom && now < rule.time.validFrom) {
			return { satisfied: false, reason: `Not valid until ${new Date(rule.time.validFrom * 1000).toISOString()}` };
		}
		if (rule.time.validUntil && now > rule.time.validUntil) {
			return { satisfied: false, reason: `Expired at ${new Date(rule.time.validUntil * 1000).toISOString()}` };
		}
	}

	// Location check
	if (rule.location) {
		if (rule.location.network === 'offline' && context.location?.ip) {
			return { satisfied: false, reason: 'Must be offline to open' };
		}
		if (rule.location.network === 'online' && !context.location?.ip) {
			return { satisfied: false, reason: 'Must be online to open' };
		}
		if (rule.location.region?.length && context.location?.region) {
			const allowed = rule.location.region.map(r => r.toLowerCase());
			if (!allowed.includes(context.location.region.toLowerCase())) {
				return { satisfied: false, reason: `Must be in one of: ${allowed.join(', ')}` };
			}
		}
	}

	// Device check
	if (rule.location?.deviceId && context.deviceId) {
		if (rule.location.deviceId !== context.deviceId) {
			return { satisfied: false, reason: 'Wrong device' };
		}
	}

	// Multi-sig check is handled at a higher level

	return { satisfied: true, reason: 'Key rule satisfied' };
}

/** Receipt type categories for indexing */
export const RECEIPT_TYPES = {
	// Communication
	message: { category: 'communication', searchable: true },
	request: { category: 'communication', searchable: true },
	response: { category: 'communication', searchable: true },

	// Attestation
	attestation: { category: 'attestation', searchable: true },
	credential: { category: 'attestation', searchable: true },
	certificate: { category: 'attestation', searchable: true },

	// Access control
	permission: { category: 'access', searchable: true },
	link: { category: 'access', searchable: true },

	// Sealed content
	seal: { category: 'sealed', searchable: false },
} as const;

/** Dgraph predicates for key rules */
export const DGRAPH_KEY_PREDICATES = {
	// Core receipt
	'receipt.id': 'string @index(exact) @upsert',
	'receipt.type': 'string @index(exact)',
	'receipt.category': 'string @index(exact)',
	'receipt.author': 'uid @reverse',
	'receipt.subject': 'string @index(exact)',
	'receipt.timestamp': 'datetime @index(hour)',
	'receipt.contentHash': 'string @index(hash)',
	'receipt.contentType': 'string @index(exact)',
	'receipt.previousHash': 'string @index(hash)',

	// Keys/opening conditions
	'receipt.keys': '[uid] @reverse',
	'key.type': 'string @index(exact)',
	'key.name': 'string @index(trigram)',
	'key.satisfied': 'bool @index',

	// Time conditions
	'key.validFrom': 'datetime @index(hour)',
	'key.validUntil': 'datetime @index(hour)',

	// Location conditions
	'key.network': 'string @index(exact)',
	'key.region': '[string] @index(exact)',
	'key.deviceId': 'string @index(exact)',

	// Multi-sig
	'key.requiredSigs': 'int @index(int)',
	'key.totalSigs': 'int @index(int)',
	'key.signer': '[string] @index(exact)',

	// Capability
	'key.commands': '[string] @index(exact)',
	'key.maxUses': 'int @index(int)',
	'key.delegable': 'bool @index',

	// Chain
	'receipt.chain': '[uid] @reverse',
} as const;

/** Dgraph queries for key-based search */
export const KEY_QUERIES = {
	/** Find receipts I can open with my passkey */
	openableWithPasskey: `
		query openable($did: string!) {
			receipts(func: eq(receipt.author, $did)) @filter(eq(key.satisfied, true)) {
				uid
				receipt.id
				receipt.type
				receipt.timestamp
				receipt.keys {
					key.name
					key.type
					key.satisfied
				}
			}
		}
	`,

	/** Find time-locked receipts */
	timeLocked: `
		query timeLocked($now: datetime!) {
			receipts(func: ge(key.validFrom, $now)) {
				uid
				receipt.id
				receipt.type
				key.validFrom
				key.name
			}
		}
	`,

	/** Find multi-sig receipts requiring my signature */
	pendingMultiSig: `
		query pendingMultiSig($did: string!) {
			receipts(func: eq(key.signer, $did)) @filter(eq(key.type, "multi")) {
				uid
				receipt.id
				receipt.type
				receipt.author
				key.requiredSigs
				key.totalSigs
			}
		}
	`,

	/** Find receipts expiring soon */
	expiringSoon: `
		query expiringSoon($soon: datetime!, $later: datetime!) {
			receipts(func: ge(key.validUntil, $soon)) @filter(lt(key.validUntil, $later)) {
				uid
				receipt.id
				receipt.type
				key.validUntil
			}
		}
	`,
};

/** Example key rules */
export const EXAMPLE_KEY_RULES = {
	// Standard passkey
	passkeyOnly: {
		name: 'Passkey',
		rule: { type: 'passkey' }
	},

	// Time-locked for future reveal
	timeLocked: {
		name: 'Time-locked reveal',
		rule: { 
			type: 'passkey',
			time: { validFrom: Math.floor(Date.now() / 1000) + 86400 } // Opens tomorrow
		}
	},

	// Expires after certain time
	expiresAt: {
		name: 'One-time use',
		rule: { 
			type: 'passkey',
			time: { validUntil: Math.floor(Date.now() / 1000) + 3600 } // Expires in 1 hour
		}
	},

	// Location-restricted
	officeOnly: {
		name: 'Office only',
		rule: { 
			type: 'passkey',
			location: { region: ['GB', 'US'] }
		}
	},

	// Multi-sig required
	boardApproval: {
		name: 'Board approval (3 of 5)',
		rule: {
			type: 'multi',
			multiSig: {
				required: 3,
				total: 5,
				signers: [
					'did:key:z6Mka...',
					'did:key:z6Mkb...',
					'did:key:z6Mkc...',
					'did:key:z6Mkd...',
					'did:key:z6Mke...'
				]
			}
		}
	},

	// Capability-limited
	readOnly: {
		name: 'Read-only access',
		rule: {
			type: 'capability',
			capability: {
				commands: ['read'],
				maxUses: 100,
				delegable: false
			}
		}
	}
};
