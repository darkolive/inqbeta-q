/*
 * Federation Module
 *
 * Handles federation creation, membership, and management.
 * 
 * Federation Schema:
 * {
 *   id: string,           // Unique federation ID
 *   name: string,         // Display name
 *   description: string,  // What this federation is about
 *   founder: string,       // DID of founder
 *   created: number,      // Timestamp
 *   members: Member[],     // Initial members (just founder)
 *   rules: FederationRules // Governance rules
 * }
 */
import { current, unlock } from './passkey';
import { seal, type Sealed } from './seal';
import { saveLocked } from './folder';

/** Federation member */
export interface FederationMember {
	did: string;
	role: 'founder' | 'admin' | 'member' | 'observer';
	joined: number;
}

/** Federation rules */
export interface FederationRules {
	joinPolicy: 'open' | 'invite' | 'approve';
	canInvite: string[]; // Roles that can invite
	canRemove: string[]; // Roles that can remove members
}

/** Federation record */
export interface Federation {
	id: string;
	name: string;
	description: string;
	founder: string;
	created: number;
	members: FederationMember[];
	rules: FederationRules;
}

/** Create a new federation */
export async function createFederation(
	name: string,
	description: string
): Promise<{ ok: boolean; federation?: Federation; error?: string }> {
	// Require passkey
	const identity = current();
	if (!identity) {
		const result = await unlock();
		if (!result.ok) {
			return { ok: false, error: result.says };
		}
	}

	const id = current();
	if (!id) {
		return { ok: false, error: 'No identity available' };
	}

	// Create federation record
	const federation: Federation = {
		id: generateFederationId(),
		name,
		description,
		founder: id.did,
		created: Date.now(),
		members: [
			{
				did: id.did,
				role: 'founder',
				joined: Date.now()
			}
		],
		rules: {
			joinPolicy: 'open',
			canInvite: ['founder', 'admin'],
			canRemove: ['founder']
		}
	};

	// Seal the federation record (signs with passkey)
	const sealed = await seal(federation);

	// Save to folder
	const fileName = `federation-${federation.id}.json`;
	const path = 'federations/';
	
	try {
		await saveLocked(path, fileName, JSON.stringify(sealed, null, 2), 'application/json');
		console.log('Federation saved to folder:', fileName);
	} catch (err) {
		console.error('Failed to save federation:', err);
		return { ok: false, error: 'Failed to save federation to folder' };
	}

	return { ok: true, federation };
}

/** Generate a unique federation ID */
function generateFederationId(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let result = 'fed_';
	for (let i = 0; i < 12; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

/** Join a federation */
export async function joinFederation(
	federationId: string,
	role: 'member' | 'observer' = 'member'
): Promise<{ ok: boolean; error?: string }> {
	const identity = current();
	if (!identity) {
		const result = await unlock();
		if (!result.ok) {
			return { ok: false, error: result.says };
		}
	}

	const id = current();
	if (!id) {
		return { ok: false, error: 'No identity available' };
	}

	// TODO: Verify federation exists and join policy allows
	// TODO: Create membership receipt

	console.log(`Joining federation ${federationId} as ${role}`);

	return { ok: true };
}

/** Leave a federation */
export async function leaveFederation(
	federationId: string
): Promise<{ ok: boolean; error?: string }> {
	const identity = current();
	if (!identity) {
		const result = await unlock();
		if (!result.ok) {
			return { ok: false, error: result.says };
		}
	}

	const id = current();
	if (!id) {
		return { ok: false, error: 'No identity available' };
	}

	// TODO: Create leaving receipt
	console.log(`Leaving federation ${federationId}`);

	return { ok: true };
}

/** Get trust score for a federation */
export function calculateTrustScore(members: FederationMember[]): number {
	if (members.length === 0) return 0;
	
	// Simple trust: based on member count and roles
	let score = members.length * 10;
	const founder = members.find(m => m.role === 'founder');
	if (founder) score += 20;
	
	// Cap at 100
	return Math.min(score, 100);
}
