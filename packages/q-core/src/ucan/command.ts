/*
 * Commands — what a UCAN lets you do, written as a path. `/inqbeta` covers
 * `/inqbeta/read` but not `/inqbetax`; `/` covers everything.
 */
import { UcanError } from './errors';

export function checkCommand(cmd: unknown): string {
	if (typeof cmd !== 'string' || !cmd.startsWith('/'))
		throw new UcanError('InvalidToken', 'A command must start with "/".');
	if (cmd !== '/' && cmd.endsWith('/')) throw new UcanError('InvalidToken', 'A command must not end with "/".');
	if (cmd !== cmd.toLowerCase()) throw new UcanError('InvalidToken', 'A command must be lowercase.');
	if (cmd.includes('//')) throw new UcanError('InvalidToken', 'A command must not have empty segments.');
	return cmd;
}

/** Does holding `granted` prove `wanted`? */
export function covers(granted: string, wanted: string): boolean {
	if (granted === '/') return true;
	return wanted === granted || wanted.startsWith(granted + '/');
}
