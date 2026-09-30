/*
 * Receipt Lifecycle Triggers
 *
 * Triggers fire when receipts match certain conditions:
 * - By DID (specific or wildcard pattern)
 * - By receipt type (e.g., 'identity.linked', 'federation.treaty')
 * - By lifecycle state (received, opened)
 * - Compound conditions (and/or)
 *
 * Actions:
 * - notify: send notification
 * - auto_unseal: attempt to decrypt
 * - refresh_ui: reload the UI
 * - queue_sync: queue for remote sync
 */
import type { ReceiptState } from './offline-queue';

/** Trigger condition types */
export type TriggerCondition =
	| DIDCondition
	| ReceiptTypeCondition
	| LifecycleCondition
	| CompoundCondition;

/** Match by DID */
export interface DIDCondition {
	type: 'did';
	pattern: string; // exact or wildcard with *
}

/** Match by receipt type */
export interface ReceiptTypeCondition {
	type: 'receipt_type';
	pattern: string; // exact or wildcard with *
}

/** Match by lifecycle state */
export interface LifecycleCondition {
	type: 'lifecycle';
	state: ReceiptState;
}

/** Compound conditions */
export interface CompoundCondition {
	type: 'and' | 'or';
	conditions: TriggerCondition[];
}

/** Available actions */
export type TriggerAction =
	| { type: 'notify'; channel: 'in-app' | 'email'; urgency?: 'low' | 'normal' | 'high' }
	| { type: 'auto_unseal' }
	| { type: 'refresh_ui' }
	| { type: 'queue_sync' }
	| { type: 'run'; command: string; args?: Record<string, unknown> };

/** A trigger rule */
export interface TriggerRule {
	id: string;
	name: string;
	enabled: boolean;
	condition: TriggerCondition;
	action: TriggerAction;
	/** Optional: only fire once per receipt */
	once?: boolean;
	/** Optional: cooldown in ms */
	cooldownMs?: number;
}

/** Trigger event */
export interface TriggerEvent {
	type: 'receipt' | 'command' | 'lifecycle';
	receipt?: {
		id: string;
		hash: string;
		type: string;
		fromDid?: string;
		toDid?: string;
	};
	command?: {
		id: string;
		name: string;
		progress?: number;
	};
	lifecycle?: {
		receiptId: string;
		from: ReceiptState;
		to: ReceiptState;
	};
	timestamp: string;
}

/** Match a DID pattern against an actual DID */
function matchDID(pattern: string, did: string): boolean {
	if (pattern === did) return true;
	if (pattern.endsWith('*')) {
		const prefix = pattern.slice(0, -1);
		return did.startsWith(prefix);
	}
	return false;
}

/** Match a receipt type pattern */
function matchReceiptType(pattern: string, receiptType: string): boolean {
	if (pattern === receiptType) return true;
	if (pattern.endsWith('*')) {
		const prefix = pattern.slice(0, -1);
		return receiptType.startsWith(prefix);
	}
	// Handle dot wildcards: 'federation.treaty.*' matches 'federation.treaty.signed'
	if (pattern.includes('.*')) {
		const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
		return regex.test(receiptType);
	}
	return false;
}

/** Evaluate a single condition */
function evaluateCondition(condition: TriggerCondition, event: TriggerEvent): boolean {
	switch (condition.type) {
		case 'did':
			if (!event.receipt) return false;
			const did = event.receipt.fromDid || event.receipt.toDid || '';
			return matchDID(condition.pattern, did);

		case 'receipt_type':
			if (!event.receipt) return false;
			return matchReceiptType(condition.pattern, event.receipt.type);

		case 'lifecycle':
			if (!event.lifecycle) return false;
			return event.lifecycle.to === condition.state;

		case 'and':
			return condition.conditions.every((c) => evaluateCondition(c, event));

		case 'or':
			return condition.conditions.some((c) => evaluateCondition(c, event));

		default:
			return false;
	}
}

/** Trigger engine state */
interface TriggerEngineState {
	rules: Map<string, TriggerRule>;
	fired: Map<string, number>; // ruleId -> last fired timestamp
	listeners: Set<(event: TriggerEvent) => void>;
}

/** Global trigger engine instance */
const engine: TriggerEngineState = {
	rules: new Map(),
	fired: new Map(),
	listeners: new Set()
};

/** Add a trigger rule */
export function addTriggerRule(rule: TriggerRule): void {
	engine.rules.set(rule.id, rule);
}

/** Remove a trigger rule */
export function removeTriggerRule(id: string): void {
	engine.rules.delete(id);
}

/** Get all trigger rules */
export function getTriggerRules(): TriggerRule[] {
	return Array.from(engine.rules.values());
}

/** Enable or disable a rule */
export function setTriggerEnabled(id: string, enabled: boolean): void {
	const rule = engine.rules.get(id);
	if (rule) {
		engine.rules.set(id, { ...rule, enabled });
	}
}

/** Fire a trigger event */
export async function fireTriggerEvent(event: TriggerEvent): Promise<void> {
	// Notify listeners
	for (const listener of engine.listeners) {
		try {
			listener(event);
		} catch (e) {
			console.error('[Triggers] Listener error:', e);
		}
	}

	// Evaluate rules
	for (const rule of engine.rules.values()) {
		if (!rule.enabled) continue;

		// Check cooldown
		if (rule.cooldownMs) {
			const lastFired = engine.fired.get(rule.id);
			if (lastFired && Date.now() - lastFired < rule.cooldownMs) {
				continue;
			}
		}

		// Check if already fired (once only)
		if (rule.once && event.receipt) {
			const key = `${rule.id}:${event.receipt.id}`;
			if (engine.fired.has(key)) {
				continue;
			}
		}

		// Evaluate condition
		if (evaluateCondition(rule.condition, event)) {
			await executeAction(rule.action, event);

			// Mark as fired
			engine.fired.set(rule.id, Date.now());
			if (rule.once && event.receipt) {
				const key = `${rule.id}:${event.receipt.id}`;
				engine.fired.set(key, Date.now());
			}
		}
	}
}

/** Execute a trigger action */
async function executeAction(action: TriggerAction, event: TriggerEvent): Promise<void> {
	switch (action.type) {
		case 'notify':
			console.log(`[Triggers] Notify: ${action.channel} (urgency: ${action.urgency || 'normal'})`);
			// In implementation: send notification via appropriate channel
			break;

		case 'auto_unseal':
			console.log('[Triggers] Auto-unseal receipt');
			// In implementation: attempt to decrypt sealed container
			break;

		case 'refresh_ui':
			console.log('[Triggers] Refresh UI');
			// In implementation: dispatch custom event or call refresh function
			if (typeof window !== 'undefined') {
				window.dispatchEvent(new CustomEvent('q:refresh'));
			}
			break;

		case 'queue_sync':
			console.log('[Triggers] Queue for sync');
			// In implementation: add to offline queue for sync
			break;

		case 'run':
			console.log(`[Triggers] Run command: ${action.command}`, action.args);
			// In implementation: run custom command
			break;
	}
}

/** Subscribe to trigger events */
export function onTriggerEvent(fn: (event: TriggerEvent) => void): () => void {
	engine.listeners.add(fn);
	return () => engine.listeners.delete(fn);
}

/** Create a trigger event for a receipt */
export function createReceiptEvent(params: {
	receiptId: string;
	receiptHash: string;
	receiptType: string;
	fromDid?: string;
	toDid?: string;
}): TriggerEvent {
	return {
		type: 'receipt',
		receipt: {
			id: params.receiptId,
			hash: params.receiptHash,
			type: params.receiptType,
			fromDid: params.fromDid,
			toDid: params.toDid
		},
		timestamp: new Date().toISOString()
	};
}

/** Create a trigger event for lifecycle state change */
export function createLifecycleEvent(params: {
	receiptId: string;
	from: ReceiptState;
	to: ReceiptState;
}): TriggerEvent {
	return {
		type: 'lifecycle',
		lifecycle: {
			receiptId: params.receiptId,
			from: params.from,
			to: params.to
		},
		timestamp: new Date().toISOString()
	};
}

/** Create a trigger event for a command */
export function createCommandEvent(params: {
	commandId: string;
	commandName: string;
	progress?: number;
}): TriggerEvent {
	return {
		type: 'command',
		command: {
			id: params.commandId,
			name: params.commandName,
			progress: params.progress
		},
		timestamp: new Date().toISOString()
	};
}

/** Helper to create common trigger rules */

/** Notify when a link request is received */
export function createLinkRequestTrigger(): TriggerRule {
	return {
		id: 'notify-link-request',
		name: 'Notify on link request',
		enabled: true,
		condition: {
			type: 'and',
			conditions: [
				{ type: 'receipt_type', pattern: 'identity.linked' },
				{ type: 'lifecycle', state: 'received' }
			]
		},
		action: { type: 'notify', channel: 'in-app', urgency: 'high' },
		once: true
	};
}

/** Auto-open treaty when received */
export function createTreatyAutoOpenTrigger(): TriggerRule {
	return {
		id: 'auto-open-treaty',
		name: 'Auto-open treaties',
		enabled: true,
		condition: {
			type: 'and',
			conditions: [
				{ type: 'receipt_type', pattern: 'federation.treaty.*' },
				{ type: 'lifecycle', state: 'received' }
			]
		},
		action: { type: 'auto_unseal' },
		cooldownMs: 5000 // 5s cooldown
	};
}

/** Refresh UI after sync */
export function createSyncCompleteTrigger(): TriggerRule {
	return {
		id: 'sync-complete-refresh',
		name: 'Refresh UI after sync',
		enabled: true,
		condition: {
			type: 'and',
			conditions: [
				{ type: 'lifecycle', state: 'received' },
				{ type: 'did', pattern: '*' } // Any receipt
			]
		},
		action: { type: 'refresh_ui' },
		cooldownMs: 1000 // 1s cooldown
	};
}
