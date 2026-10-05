/*
 * This copy's settings file, apps/q/.env (ADR-Q-018 §4), or apps/q/devsite/.env
 * for the development copy (ADR-Q-034 §5). Development only.
 *
 * Read and changed one line at a time, so comments, blank lines and settings
 * Q doesn't manage are left exactly as they were. Git never sees this file
 * (.gitignore), and nothing here sends it anywhere.
 *
 * Changes take effect when `pnpm dev` is restarted: that is when Vite reads it.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/* The development copy's own settings live in devsite/.env (svelte.config.js, ADR-Q-034 §5). */
const FILE = () => path.resolve(process.cwd(), process.env.PUBLIC_Q_SITE?.trim() === 'development' ? 'devsite' : '.', '.env');
const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function unquote(raw: string): string {
	const v = raw.trim();
	if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
	if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1);
	return v.replace(/\s+#.*$/, '');
}

function quote(v: string): string {
	return /[\s#"'=]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

/** Every setting in the file, as written. */
export function readEnvFile(file = FILE()): Record<string, string> {
	if (!existsSync(file)) return {};
	const out: Record<string, string> = {};
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		const m = LINE.exec(line);
		if (m) out[m[1]] = unquote(m[2]);
	}
	return out;
}

/** Set one setting: its line is replaced where it is, or added at the end. */
export function setEnvValue(name: string, value: string, file = FILE()): void {
	if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) throw new Error('That isn’t a setting name.');
	if (/[\r\n]/.test(value)) throw new Error('A setting is one line.');
	const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
	const at = lines.findIndex((l) => LINE.exec(l)?.[1] === name);
	const next = `${name}=${quote(value)}`;
	if (at >= 0) lines[at] = next;
	else {
		if (lines.length && lines[lines.length - 1] === '') lines.pop();
		lines.push(next, '');
	}
	writeFileSync(file, lines.join('\n'));
}
