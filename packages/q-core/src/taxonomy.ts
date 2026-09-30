/*
 * Evidence Taxonomy
 *
 * A taxonomy for categorizing evidence types in the inQbeta system.
 * This maps to DID identifiers and Dgraph predicates for indexing.
 *
 * The taxonomy is hierarchical:
 * - Category (broad type)
 * - Medium (format/substrate)
 * - Schema (specific structure)
 */
import { toDid, publicKeyFrom } from './did';

/** Top-level evidence categories */
export type EvidenceCategory =
	| 'document'    // Text documents, PDFs, etc.
	| 'media'      // Audio, video, images
	| 'code'        // Source code, scripts
	| 'data'        // Structured data (JSON, CSV, etc.)
	| 'instruction' // Commands, prompts
	| 'attestation' // Signed statements
	| 'credential'  // Certificates, badges
	| 'artifact';   // Generic artifacts

/** Media subtypes */
export type MediaType =
	| 'audio'
	| 'video'
	| 'image'
	| 'text'; // Text within media (subtitles, transcripts)

/** Document subtypes */
export type DocumentType =
	| 'text'       // Plain text, Markdown
	| 'pdf'        // PDF documents
	| 'html'       // Web pages
	| 'markup';    // XML, LaTeX, etc.

/** Code subtypes */
export type CodeType =
	| 'source'     // Source code files
	| 'script'     // Executable scripts
	| 'config'     // Configuration files
	| 'template';  // Templates, schemas

/** Data subtypes */
export type DataType =
	| 'json'
	| 'xml'
	| 'csv'
	| 'yaml'
	| 'sql'
	| 'graph';     // Graph data, triples

/** Instruction subtypes */
export type InstructionType =
	| 'prompt'     // AI prompts
	| 'command'     // CLI commands
	| 'api'         // API specifications
	| 'contract';   // Smart contracts

/** Attestation subtypes */
export type AttestationType =
	| 'receipt'    // Evidence receipts
	| 'link'       // Identity links
	| 'permission'  // UCAN permissions
	| 'signature';  // Raw signatures

/** Credential subtypes */
export type CredentialType =
	| 'certificate'
	| 'badge'
	| 'license'
	| 'degree';

/** Combined evidence type */
export interface EvidenceType {
	category: EvidenceCategory;
	subtype: MediaType | DocumentType | CodeType | DataType | InstructionType | AttestationType | CredentialType;
	mimeType: string;
	extension: string[];
}

/** Evidence type registry */
export const EVIDENCE_TYPES: Record<string, EvidenceType> = {
	// Document types
	'text/plain': { category: 'document', subtype: 'text', mimeType: 'text/plain', extension: ['.txt', '.md'] },
	'application/pdf': { category: 'document', subtype: 'pdf', mimeType: 'application/pdf', extension: ['.pdf'] },
	'text/html': { category: 'document', subtype: 'html', mimeType: 'text/html', extension: ['.html', '.htm'] },
	'application/xml': { category: 'document', subtype: 'markup', mimeType: 'application/xml', extension: ['.xml'] },
	'text/latex': { category: 'document', subtype: 'markup', mimeType: 'text/latex', extension: ['.tex'] },

	// Media types
	'audio/mpeg': { category: 'media', subtype: 'audio', mimeType: 'audio/mpeg', extension: ['.mp3', '.m4a'] },
	'audio/wav': { category: 'media', subtype: 'audio', mimeType: 'audio/wav', extension: ['.wav'] },
	'video/mp4': { category: 'media', subtype: 'video', mimeType: 'video/mp4', extension: ['.mp4'] },
	'video/webm': { category: 'media', subtype: 'video', mimeType: 'video/webm', extension: ['.webm'] },
	'image/png': { category: 'media', subtype: 'image', mimeType: 'image/png', extension: ['.png'] },
	'image/jpeg': { category: 'media', subtype: 'image', mimeType: 'image/jpeg', extension: ['.jpg', '.jpeg'] },
	'image/gif': { category: 'media', subtype: 'image', mimeType: 'image/gif', extension: ['.gif'] },
	'image/svg+xml': { category: 'media', subtype: 'image', mimeType: 'image/svg+xml', extension: ['.svg'] },
	'image/webp': { category: 'media', subtype: 'image', mimeType: 'image/webp', extension: ['.webp'] },

	// Code types
	'text/javascript': { category: 'code', subtype: 'source', mimeType: 'text/javascript', extension: ['.js', '.mjs'] },
	'text/typescript': { category: 'code', subtype: 'source', mimeType: 'text/typescript', extension: ['.ts'] },
	'text/python': { category: 'code', subtype: 'source', mimeType: 'text/python', extension: ['.py'] },
	'text/rust': { category: 'code', subtype: 'source', mimeType: 'text/rust', extension: ['.rs'] },
	'text/go': { category: 'code', subtype: 'source', mimeType: 'text/go', extension: ['.go'] },
	'application/json': { category: 'code', subtype: 'config', mimeType: 'application/json', extension: ['.json'] },
	'application/yaml': { category: 'code', subtype: 'config', mimeType: 'application/yaml', extension: ['.yml', '.yaml'] },
	'application/toml': { category: 'code', subtype: 'config', mimeType: 'application/toml', extension: ['.toml'] },

	// Data types
	'application/json': { category: 'data', subtype: 'json', mimeType: 'application/json', extension: ['.json'] },
	'application/xml': { category: 'data', subtype: 'xml', mimeType: 'application/xml', extension: ['.xml'] },
	'text/csv': { category: 'data', subtype: 'csv', mimeType: 'text/csv', extension: ['.csv'] },
	'application/x-sql': { category: 'data', subtype: 'sql', mimeType: 'application/x-sql', extension: ['.sql'] },

	// Instruction types
	'text/x-prompt': { category: 'instruction', subtype: 'prompt', mimeType: 'text/x-prompt', extension: ['.prompt'] },
	'text/x-shellscript': { category: 'instruction', subtype: 'command', mimeType: 'text/x-shellscript', extension: ['.sh', '.bash'] },
	'application/openapi+json': { category: 'instruction', subtype: 'api', mimeType: 'application/openapi+json', extension: ['.openapi'] },
	'application/x-solidity': { category: 'instruction', subtype: 'contract', mimeType: 'application/x-solidity', extension: ['.sol'] },

	// Attestation types (inQbeta-specific)
	'application/x-receipt': { category: 'attestation', subtype: 'receipt', mimeType: 'application/x-receipt', extension: ['.receipt', '.json'] },
	'application/x-link': { category: 'attestation', subtype: 'link', mimeType: 'application/x-link', extension: ['.link', '.json'] },
	'application/x-ucan': { category: 'attestation', subtype: 'permission', mimeType: 'application/x-ucan', extension: ['.ucan'] },
	'application/x-signature': { category: 'attestation', subtype: 'signature', mimeType: 'application/x-signature', extension: ['.sig'] },

	// Credential types
	'application/x-certificate': { category: 'credential', subtype: 'certificate', mimeType: 'application/x-certificate', extension: ['.crt', '.pem'] },
	'application/x-badge': { category: 'credential', subtype: 'badge', mimeType: 'application/x-badge', extension: ['.json'] },
	'application/x-license': { category: 'credential', subtype: 'license', mimeType: 'application/x-license', extension: ['.json'] },
	'application/x-degree': { category: 'credential', subtype: 'degree', mimeType: 'application/x-degree', extension: ['.json'] },
};

/** Get evidence type from MIME type */
export function getEvidenceType(mimeType: string): EvidenceType | undefined {
	return EVIDENCE_TYPES[mimeType.toLowerCase()];
}

/** DID taxonomy for evidence */
export interface EvidenceDID {
	/** The DID for this evidence */
	did: string;
	/** Evidence type */
	type: EvidenceType;
	/** Content hash */
	contentHash: string;
	/** Original filename */
	filename?: string;
	/** Size in bytes */
	size?: number;
	/** When created */
	createdAt?: number;
}

/** Create a DID for evidence */
export function createEvidenceDID(params: {
	type: EvidenceType;
	contentHash: string;
	filename?: string;
}): EvidenceDID {
	// Build the DID path
	const path = `/${params.type.category}/${params.type.subtype}/${params.contentHash.slice(0, 16)}`;
	
	// Note: This would use the inQbeta DID method
	// For now, return a structured object
	return {
		did: `did:inqbeta:evidence${path}`,
		type: params.type,
		contentHash: params.contentHash,
		filename: params.filename
	};
}

/** Dgraph schema predicates for evidence */
export const DGRAPH_EVIDENCE_PREDICATES = {
	// Core
	'evidence.id': 'string @index(exact) @upsert',
	'evidence.did': 'string @index(exact)',
	'evidence.contentHash': 'string @index(hash)',
	'evidence.category': 'string @index(exact)',
	'evidence.subtype': 'string @index(exact)',
	'evidence.mimeType': 'string @index(exact)',
	
	// Metadata
	'evidence.filename': 'string @index(trigram)',
	'evidence.size': 'int @index(int)',
	'evidence.createdAt': 'datetime @index(hour)',
	
	// Relationships
	'evidence.author': 'uid @reverse',
	'evidence.subject': 'uid @reverse',
	'evidence.previous': 'uid @reverse',
	'evidence.chain': '[uid] @reverse',
	
	// Content
	'evidence.title': 'string @index(trigram)',
	'evidence.description': 'string @index(trigram)',
	'evidence.tags': '[string] @index(exact)',
} as const;

/** Query helpers for evidence */
export const EVIDENCE_QUERIES = {
	/** Find evidence by content hash */
	byHash: `
		query byHash($hash: string!) {
			evidence(func: eq(evidence.contentHash, $hash)) {
				uid
				evidence.id
				evidence.did
				evidence.contentHash
				evidence.category
				evidence.subtype
				evidence.mimeType
				evidence.title
			}
		}
	`,

	/** Find evidence by category */
	byCategory: `
		query byCategory($category: string!) {
			evidence(func: eq(evidence.category, $category)) {
				uid
				evidence.id
				evidence.did
				evidence.category
				evidence.subtype
				evidence.mimeType
				evidence.title
				evidence.createdAt
			}
		}
	`,

	/** Get evidence chain */
	chain: `
		query chain($id: string!) {
			chain(func: uid($id)) {
				evidence.id
				evidence.previous {
					uid
					evidence.id
				}
			}
		}
	`,
};
