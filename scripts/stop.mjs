// Stops whatever is listening on this repo's fixed ports (see README), so a
// `pnpm dev` left running in another window does not block the next one.
// macOS/Linux: uses lsof. Only the ports below are touched.
import { execSync } from 'node:child_process';

const PORTS = [3100, 5173, 4100, 4173];
let stopped = 0;
for (const port of PORTS) {
	let pids = [];
	try {
		pids = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' }).split('\n').filter(Boolean);
	} catch {
		continue; // nothing listening
	}
	for (const pid of pids) {
		try {
			process.kill(Number(pid), 'SIGTERM');
			console.log(`  stopped ${pid} on port ${port}`);
			stopped++;
		} catch {
			/* already gone */
		}
	}
}
console.log(stopped ? '  done' : '  nothing was running on ' + PORTS.join(', '));
