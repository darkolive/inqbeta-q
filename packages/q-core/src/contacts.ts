/*
 * Zero-Knowledge Contact Exchange
 *
 * A universal system for sharing contact details without storing personal data.
 *
 * THE CONCEPT:
 * - I share my contact info with you (encrypted, signed)
 * - You add it to your "address book"
 * - The address book contains instructions on how to contact me
 * - Those instructions are tied to my DID
 * - I can reach you through those instructions
 * - Nobody (including the system) knows the mapping
 *
 * RECEIPT STRUCTURE:
 * {
 *   type: 'contact',
 *   from: 'did:key:z6M...',
 *   to: 'did:key:z6N...',
 *   instructions: {
 *     name: 'hash(name)',
 *     email: 'hash(email)',
 *     phone: 'hash(phone)',
 *     social: { twitter: 'hash(@handle)', ... }
 *   },
 *   permissions: {
 *     canSeeFace: true,
 *     canCall: true,
 *     canMessage: true
 *   },
 *   sealed: true/false
 * }
 */
import { current } from './passkey';
import { sha256, canonical } from './canonical';

/** Contact field types */
export type ContactField = 
	| 'name'
	| 'email'
	| 'phone'
	| 'social';

export type SocialPlatform = 
	| 'twitter' 
	| 'github' 
	| 'mastodon'
	| 'bluesky'
	| 'linkedin'
	| 'website';

/** What channels are available */
export interface ContactChannels {
	canSeeFace?: boolean;   // Photo/avatar
	canCall?: boolean;       // Voice/video call
	canMessage?: boolean;    // Text/chat
	canEmail?: boolean;      // Email
	canSMS?: boolean;        // SMS
	canNotify?: boolean;      // Push notifications
}

/** My contact card - what I share */
export interface ContactCard {
	/** My DID */
	from: string;
	/** When shared */
	at: number;
	/** What I'm sharing (hashed) */
	fields: {
		name?: string;      // hash of name
		email?: string;     // hash of email  
		phone?: string;     // hash of phone
		social?: Partial<Record<SocialPlatform, string>>; // hash of @handle
		avatar?: string;    // hash of avatar URL (for display)
	};
	/** What they can do */
	channels: ContactChannels;
	/** Optional: sealed so only recipient can read */
	sealed?: boolean;
	/** Signature */
	signature?: string;
}

/** Address book entry */
export interface AddressBookEntry {
	/** Their DID */
	did: string;
	/** Contact card received */
	card: ContactCard;
	/** When added */
	addedAt: number;
	/** Custom label user gave */
	label?: string;
	/** Group/tags */
	tags?: string[];
	/** Favorite */
	favorite?: boolean;
}

/** Storage keys */
const ADDRESS_BOOK_KEY = 'inqbeta-address-book';

/** Compute field hash */
export async function hashField(value: string): Promise<string> {
	return sha256(canonical({ v: value.toLowerCase().trim() }));
}

/** Create my contact card to share */
export async function createContactCard(params: {
	name?: string;
	email?: string;
	phone?: string;
	social?: Record<SocialPlatform, string>;
	avatar?: string;
	channels: ContactChannels;
}): Promise<ContactCard> {
	const identity = current();
	if (!identity) {
		throw new Error('Must be signed in');
	}

	const card: ContactCard = {
		from: identity.did,
		at: Date.now(),
		fields: {},
		channels: params.channels
	};

	// Hash all fields
	if (params.name) card.fields.name = await hashField(params.name);
	if (params.email) card.fields.email = await hashField(params.email);
	if (params.phone) card.fields.phone = await hashField(params.phone);
	if (params.social) {
		const social: Partial<Record<SocialPlatform, string>> = {};
		for (const [platform, handle] of Object.entries(params.social)) {
			social[platform as SocialPlatform] = await hashField(handle);
		}
		card.fields.social = social;
	}
	if (params.avatar) card.fields.avatar = await hashField(params.avatar);

	return card;
}

/** Add contact to address book */
export function addToAddressBook(card: ContactCard, label?: string): void {
	const book = getAddressBook();
	
	const entry: AddressBookEntry = {
		did: card.from,
		card,
		addedAt: Date.now(),
		label,
		tags: [],
		favorite: false
	};

	// Update or add
	const existing = book.findIndex(e => e.did === card.from);
	if (existing >= 0) {
		book[existing] = entry;
	} else {
		book.push(entry);
	}

	localStorage.setItem(ADDRESS_BOOK_KEY, JSON.stringify(book));
}

/** Get address book */
export function getAddressBook(): AddressBookEntry[] {
	try {
		const stored = localStorage.getItem(ADDRESS_BOOK_KEY);
		return stored ? JSON.parse(stored) : [];
	} catch {
		return [];
	}
}

/** Remove from address book */
export function removeFromAddressBook(did: string): void {
	const book = getAddressBook().filter(e => e.did !== did);
	localStorage.setItem(ADDRESS_BOOK_KEY, JSON.stringify(book));
}

/** Update contact */
export function updateContact(did: string, updates: Partial<AddressBookEntry>): void {
	const book = getAddressBook();
	const entry = book.find(e => e.did === did);
	if (entry) {
		Object.assign(entry, updates);
		localStorage.setItem(ADDRESS_BOOK_KEY, JSON.stringify(book));
	}
}

/** Check if can use a channel */
export function canChannel(entry: AddressBookEntry, channel: keyof ContactChannels): boolean {
	return entry.card.channels[channel] ?? false;
}

/** Search address book */
export function searchAddressBook(query: string): AddressBookEntry[] {
	const book = getAddressBook();
	const q = query.toLowerCase();
	return book.filter(e => 
		e.label?.toLowerCase().includes(q) ||
		e.tags?.some(t => t.toLowerCase().includes(q))
	);
}

/** Get by DID */
export function getContact(did: string): AddressBookEntry | undefined {
	return getAddressBook().find(e => e.did === did);
}

/**
 * RECEIPT: Contact Exchange
 * 
 * This is the attestation that enables contact sharing
 */
export type ContactReceiptType = 
	| 'contact.share'    // Initial share
	| 'contact.update'  // Version update
	| 'contact.revoke';  // Revoke/replace

/** Contact receipt - versioned */
export interface ContactReceipt {
	type: ContactReceiptType;
	from: string;
	to: string;
	card: ContactCard;
	version: number;
	previousHash?: string;
	signature: string;
	/** For revoke */
	replacement?: string;
}

/**
 * Create a contact exchange receipt (versioned)
 */
export function createContactReceipt(
	to: string,
	card: ContactCard,
	previousHash?: string
): ContactReceipt {
	const identity = current();
	if (!identity) {
		throw new Error('Must be signed in');
	}

	// Determine type
	const type: ContactReceiptType = previousHash ? 'contact.update' : 'contact.share';

	// Build canonical form
	const canonicalForm = {
		type,
		from: identity.did,
		to,
		card,
		previousHash
	};

	// In production: sign with passkey
	const signature = `sig_${Date.now()}`;
	const version = previousHash ? 2 : 1;

	return {
		type,
		from: identity.did,
		to,
		card,
		version,
		previousHash,
		signature
	};
}

/**
 * Create a revoke receipt
 */
export function createRevokeReceipt(
	to: string,
	previousHash: string,
	replacement?: string
): ContactReceipt {
	const identity = current();
	if (!identity) {
		throw new Error('Must be signed in');
	}

	return {
		type: 'contact.revoke',
		from: identity.did,
		to,
		card: { from: identity.did, at: Date.now(), fields: {}, channels: {} },
		version: 0,
		previousHash,
		signature: `sig_${Date.now()}`,
		replacement
	};
}

/** Check if contact is outdated */
export function checkVersion(entry: ContactReceipt, currentVersion: number): {
	outdated: boolean;
	updateAvailable: boolean;
	message: string;
} {
	if (entry.version < currentVersion) {
		return {
			outdated: true,
			updateAvailable: true,
			message: `Update available (v${currentVersion})`
		};
	}
	
	if (entry.version > currentVersion) {
		return {
			outdated: false,
			updateAvailable: false,
			message: 'This is newer than your version'
		};
	}

	return {
		outdated: false,
		updateAvailable: false,
		message: 'Up to date'
	};
}
