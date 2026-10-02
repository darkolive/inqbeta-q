#!/usr/bin/env node
/*
 * How many members can a node serve? (docs/q/node-capacity.md)
 *
 *   node bin/capacity.mjs            the table, for every device below
 *   node bin/capacity.mjs --json     the same, as data
 *
 * Every number comes from the ASSUMPTIONS and DEVICES here. Change one, run it
 * again. Figures marked "measured" came from the Hetzner CPX12 test on
 * 1 October 2026; everything else is an estimate until a load test replaces it.
 */

/* ---- How members use a host, at its busiest hour ---- */
const ASSUMPTIONS = {
	onlineShare: 0.1, //            members with Q open at once (holding a bellboy connection)
	connectionKB: 64, //            memory per open connection: Mosquitto + Caddy (WebSocket over TLS)
	transitMBPerMember: 1, //       held in the storage at once, on average: messages, cards, receipts waiting
	directoryKBPerMember: 30, //    the directory's share per member on disk: published facts, offers, memberships, indexes
	directoryCacheKBPerMember: 25, // and in memory, to stay quick
	inCallShare: 0.01, //           members on a video call at once
	relayedShare: 0.15, //          calls that can't connect directly and use the relay
	relayMbpsPerCall: 3, //         a relayed 1:1 video call: 1.5 Mbit/s each way, both forwarded
	relayedHoursPerMemberMonth: 0.3, // 2 hours of calls a month, 15% of them relayed
	baseMB: 534 //                  all four services idle, measured on CPX12
};

/* ---- Machines. upMbps: what the relay can send out. diskGB: free for the node. ---- */
const DEVICES = [
	{ name: 'Raspberry Pi Zero 2 W', where: 'home', ramMB: 512, cores: 4, diskGB: 16, upMbps: 20, monthlyTB: Infinity, jobs: ['bellboy'], slowCores: true, note: 'Bellboy only' },
	{ name: 'Raspberry Pi 5 8 GB + SSD', where: 'home', ramMB: 8192, cores: 4, diskGB: 200, upMbps: 50, monthlyTB: Infinity, jobs: ['bellboy', 'storage', 'directory', 'relay'] },
	{ name: 'Mini PC (N100, 16 GB)', where: 'home', ramMB: 16384, cores: 4, diskGB: 400, upMbps: 50, monthlyTB: Infinity, jobs: ['bellboy', 'storage', 'directory', 'relay'] },
	{ name: 'Mini PC at home, switchboard rented', where: 'split', ramMB: 16384, cores: 4, diskGB: 400, upMbps: 50, monthlyTB: Infinity, jobs: ['bellboy', 'storage', 'directory'], note: 'With the switchboard on a CPX12 or Cloudflare' },
	{ name: 'Hetzner CPX12', where: 'rented', ramMB: 2048, cores: 1, diskGB: 25, upMbps: 300, monthlyTB: 20, jobs: ['bellboy', 'storage', 'directory', 'relay'], note: 'Measured: all four idle at 534 MB' },
	{ name: 'Hetzner CPX22', where: 'rented', ramMB: 4096, cores: 2, diskGB: 60, upMbps: 300, monthlyTB: 20, jobs: ['bellboy', 'storage', 'directory', 'relay'] },
	{ name: 'Hetzner CPX32', where: 'rented', ramMB: 8192, cores: 4, diskGB: 140, upMbps: 400, monthlyTB: 20, jobs: ['bellboy', 'storage', 'directory', 'relay'] }
];

/* Of the memory left after the services start, each job's share. */
const RAM_SHARE = { bellboy: 0.25, directory: 0.6 };
/* A single core's ceiling for TLS connections held open (conservative). */
const CONNECTIONS_PER_CORE = 5000;

const A = ASSUMPTIONS;
const floor = (n) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : Infinity);

export function capacity(d) {
	const freeMB = Math.max(0, d.ramMB - (d.jobs.length === 1 ? 60 : A.baseMB));
	const out = {};
	if (d.jobs.includes('bellboy')) {
		const byRam = (freeMB * (d.jobs.length === 1 ? 0.8 : RAM_SHARE.bellboy) * 1024) / A.connectionKB;
		const byCpu = d.cores * CONNECTIONS_PER_CORE * (d.slowCores ? 0.1 : 1); // a Zero's cores are slow
		out.bellboy = floor(Math.min(byRam, byCpu) / A.onlineShare);
	}
	if (d.jobs.includes('storage')) out.storage = floor((d.diskGB * 0.5 * 1024) / A.transitMBPerMember);
	if (d.jobs.includes('directory')) {
		const byDisk = (d.diskGB * 0.3 * 1024 * 1024) / A.directoryKBPerMember;
		const byRam = (freeMB * RAM_SHARE.directory * 1024) / A.directoryCacheKBPerMember;
		out.directory = floor(Math.min(byDisk, byRam));
	}
	if (d.jobs.includes('relay')) {
		const perMemberMbps = A.inCallShare * A.relayedShare * A.relayMbpsPerCall;
		const byPipe = (d.upMbps * 0.8) / perMemberMbps;
		const perMemberGB = (A.relayedHoursPerMemberMonth * A.relayMbpsPerCall * 3600) / 8 / 1000 / 2; // each call is shared by two members
		const byMonth = (d.monthlyTB * 1000) / perMemberGB;
		out.relay = floor(Math.min(byPipe, byMonth));
	}
	const [limit, members] = Object.entries(out).sort((a, b) => a[1] - b[1])[0];
	return { ...d, perJob: out, members, limit };
}

const NAMES = { bellboy: 'bellboy', storage: 'storage', directory: 'directory', relay: 'switchboard' };
const round = (n) => (n === Infinity ? '—' : n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const rows = DEVICES.map(capacity);

if (process.argv.includes('--json')) {
	console.log(JSON.stringify({ assumptions: A, rows }, null, 2));
} else {
	console.log('| Device | Bellboy | Storage | Directory | Switchboard | Members | Limited by |');
	console.log('|---|---|---|---|---|---|---|');
	for (const r of rows) {
		const j = r.perJob;
		console.log(`| ${r.name} | ${round(j.bellboy ?? Infinity)} | ${round(j.storage ?? Infinity)} | ${round(j.directory ?? Infinity)} | ${round(j.relay ?? Infinity)} | **${round(r.members)}** | ${NAMES[r.limit]} |`);
	}
}
