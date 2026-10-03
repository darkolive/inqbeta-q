/*
 * The few Node APIs the local-site door uses (routes/api/local-site), typed
 * by hand because this app does not depend on @types/node — and adding a
 * dependency for five functions, in an app that otherwise never touches a
 * disk, would be the wrong trade. If more server code ever needs Node, add
 * @types/node and delete this file.
 */
declare module 'node:fs' {
	export function existsSync(path: string): boolean;
	export function readFileSync(path: string, encoding: 'utf8'): string;
	export function readFileSync(path: string): Uint8Array;
	export function readdirSync(path: string): string[];
	export function writeFileSync(path: string, data: string | Uint8Array): void;
	export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
	export function statSync(path: string): { isDirectory(): boolean; size: number };
}
declare module 'node:child_process' {
	interface Stream {
		on(event: 'data', cb: (d: Uint8Array) => void): void;
	}
	export function spawn(
		cmd: string,
		args: string[],
		o: { cwd: string; env: Record<string, string | undefined>; shell: boolean }
	): {
		stdout: Stream;
		stderr: Stream;
		on(event: 'error', cb: (e: Error) => void): void;
		on(event: 'close', cb: (code: number | null) => void): void;
	};
}
declare module 'node:crypto' {
	export function createHash(alg: 'sha256'): { update(b: Uint8Array | string): { digest(enc: 'hex'): string } };
}
declare module 'node:path' {
	const path: {
		resolve(...parts: string[]): string;
		join(...parts: string[]): string;
		relative(from: string, to: string): string;
		dirname(p: string): string;
	};
	export default path;
}
declare const process: { cwd(): string; env: Record<string, string | undefined> };
