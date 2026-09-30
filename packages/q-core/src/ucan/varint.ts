/* Unsigned LEB128 varints — how multiformats write their numbers. */

export function varint(n: number): number[] {
	if (!Number.isSafeInteger(n) || n < 0) throw new Error('A varint must be a non-negative integer.');
	const out: number[] = [];
	do {
		let b = n % 128;
		n = Math.floor(n / 128);
		if (n > 0) b |= 0x80;
		out.push(b);
	} while (n > 0);
	return out;
}

/** Reads a varint at `at`; returns the value and the position after it. Refuses padded forms. */
export function readVarint(bytes: Uint8Array, at = 0): [value: number, next: number] {
	let value = 0;
	let scale = 1;
	for (let i = at; i < bytes.length && i < at + 9; i++) {
		const b = bytes[i];
		value += (b & 0x7f) * scale;
		scale *= 128;
		if (!(b & 0x80)) {
			if (b === 0 && i > at) throw new Error('A varint must use its shortest form.');
			return [value, i + 1];
		}
	}
	throw new Error('Unreadable varint.');
}
