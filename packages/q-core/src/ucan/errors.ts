/*
 * Why a UCAN was refused. The names are the ones the UCAN spec's own test files
 * use, so a failure here can be compared line for line with any other
 * implementation.
 */
export type UcanErrorName =
	| 'InvalidToken'
	| 'InvalidSignature'
	| 'UnsupportedSignature'
	| 'Expired'
	| 'TooEarly'
	| 'InvalidClaim'
	| 'UnavailableProof'
	| 'InvalidAudience'
	| 'InvalidSubject'
	| 'MatchError'
	| 'Revoked'
	| 'NeedsApproval';

export class UcanError extends Error {
	readonly code: UcanErrorName;
	constructor(code: UcanErrorName, message: string) {
		super(message);
		this.code = code;
		this.name = 'UcanError';
	}
}
