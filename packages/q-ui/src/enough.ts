/**
 * How full an "enough" battery is (5 October 2026, ADR-Q-035), from what you
 * have and what you need held back: empty when you have only what's needed,
 * full at twice it. With nothing needed, anything at all is full.
 */
export function enoughLevel(have: number, needed: number): number {
	const spare = Math.max(0, have - needed);
	return needed > 0 ? Math.min(1, spare / needed) : spare > 0 ? 1 : 0;
}
