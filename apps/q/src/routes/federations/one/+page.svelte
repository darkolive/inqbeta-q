<script lang="ts">
	/*
	 * One federation (ADR-Q-007).
	 *
	 * As its caretaker: invite people (a link, or a code to scan), see who has
	 * joined, and remove someone — citing the clause, never silently.
	 * As a member: your standing, and a Leave button that asks nobody.
 * Tabs: Home (what it is), Bank (its mint, open to anyone), Members,
 * Communication, and Settings (caretaker only).
 * Its nodes (ADR-Q-010 §10), under Settings: the machines it runs — a bellboy, a directory
 * or both (docs/q/node-sizes.md) — and whether this device
 * can reach their services over the federation's mesh, asked live.
	 *
	 * /federations/one?id=<the federation's DID>
	 */
	import { page } from '$app/state';
	import { Page, Section, Status, Empty, Icon } from '@inqbeta/q-ui';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import SignIn from '$lib/components/SignIn.svelte';
	import ShareLink from '$lib/components/ShareLink.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { PRINCIPLES, STRANDS, JOIN_POLICIES } from '@inqbeta/q-core/federations';
	import {
		invite,
		isFederationRecord,
		isMemberRecord,
		isMembershipRecord,
		leaveFederation,
		recordFrom,
		removeMember,
		suspendMember,
		liftSuspension,
		isNodeRecord,
		listNode,
		withdrawNode,
		type NodeRecord,
		type FederationRecord,
		type MemberRecord,
		type MembershipRecord
	} from '$lib/federations';
	import type { Found } from '$lib/features/registry';
	import { standingAt } from '@inqbeta/q-core/membership';
	import { onSecurePage, reachIndex, reachPostOffice, reachStorage, reachSwitchboard, reachThroughFrontDoor, type Reach } from '$lib/node-health';
	import { iceServers } from '$lib/call/connection';
	import { readHome, HOME_SCHEMA, type Home, type HomeFile } from '$lib/home';
	import { makeAnnouncement, makePublication, type Announcement } from '@inqbeta/q-core/announcements';
	import { openFederationKey } from '@inqbeta/q-core/membership';
	import { signerFor } from '@inqbeta/q-core/passkey';
	import { readAnnouncements, announcementsFile, publishAnnouncements } from '$lib/announcements';
	import { untrack } from 'svelte';
	import { dev } from '$app/environment';
	import { hostServices, hostVercel, madeForYou, renewHost, sendSetting, setService, type VercelView } from '$lib/host-setup';
	import { MADE_FOR_YOU, type ServiceState } from '$lib/host-services';
	import { FEDERATIONS_SETTING } from '$lib/offers';
	import IntroSlides from '$lib/components/IntroSlides.svelte';
	import MoneyPublish from '$lib/components/MoneyPublish.svelte';
	import CoinDesigner from '$lib/components/CoinDesigner.svelte';
	import FederationBank from '$lib/components/FederationBank.svelte';
	import RoleSwitch from '$lib/components/RoleSwitch.svelte';
	import { role } from '$lib/role.svelte';
	import PricingFromFlow from '$lib/components/PricingFromFlow.svelte';
	import FederationSnapshot from '$lib/components/FederationSnapshot.svelte';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	const id = $derived(page.url.searchParams.get('id') ?? '');
	/* Three tabs, one thing each (Darren, 1 October: "always thinking how simple
	 * can the information be conveyed"). ?tab= opens one directly. */
	let tab = $state(page.url.searchParams.get('tab') ?? 'home');
	const found = $derived<Found[]>(ledger?.state === 'ready' ? ledger.found : []);
	const newest = (list: Found[]) => [...list].sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
	const ownItem = $derived(newest(found.filter((f) => f.feature === 'federations' && f.key === `federation:${id}`)));
	const membershipItem = $derived(newest(found.filter((f) => f.key === `membership:${id}`)));
	const memberItems = $derived.by(() => {
		const by = new Map<string, Found>();
		for (const f of found.filter((f) => f.kind === 'member' && f.key.startsWith(`member:${id}:`)))
			if (!by.has(f.key) || f.at > by.get(f.key)!.at) by.set(f.key, f);
		return [...by.values()];
	});

	const nodeItems = $derived.by(() => {
		const by = new Map<string, Found>();
		for (const f of found.filter((f) => f.kind === 'node' && f.key.startsWith(`node:${id}:`)))
			if (!by.has(f.key) || f.at > by.get(f.key)!.at) by.set(f.key, f);
		return [...by.values()];
	});

	let own = $state<FederationRecord | null>(null);
	let mine = $state<MembershipRecord | null>(null);
	let members = $state<MemberRecord[]>([]);
	/* The club's card and its Home (2 October 2026). The founder is member one. */
	const memberCount = $derived(1 + members.filter((m) => !m.removed).length);
	const newMembers = $derived(members.filter((m) => !m.removed && Date.now() - Date.parse(m.joining.at) < 7 * 24 * 3600 * 1000));

	$effect(() => {
		const item = ownItem?.item;
		if (!item) return void (own = null);
		void recordFrom(item).then((r) => (own = isFederationRecord(r) ? r : null));
	});
	$effect(() => {
		const item = membershipItem?.item;
		if (!item) return void (mine = null);
		void recordFrom(item).then((r) => (mine = isMembershipRecord(r) ? r : null));
	});
	$effect(() => {
		const items = memberItems.map((f) => f.item);
		void Promise.all(items.map(recordFrom)).then((rs) => (members = rs.filter(isMemberRecord)));
	});

	/* Nodes, and what this device can reach on each. Health is asked, never kept. */
	let nodes = $state<NodeRecord[]>([]);
	$effect(() => {
		const items = nodeItems.map((f) => f.item);
		void Promise.all(items.map(recordFrom)).then((rs) => (nodes = rs.filter(isNodeRecord).filter((n) => !n.withdrawn)));
	});
	let reach = $state<Record<string, { index?: Reach; postOffice?: Reach; storage?: Reach; relay?: Reach; asking: boolean; at?: string }>>({});
	/* The switchboard is checked the way a call uses it: with a real call's credentials. */
	async function askSwitchboard(n: NodeRecord): Promise<Reach | undefined> {
		const sb = n.services.relay;
		if (!sb) return undefined;
		if (!identity) return { is: 'cannot-ask', says: 'Sign in to check it.' };
		const { servers } = await iceServers(identity);
		return reachSwitchboard(servers, sb.host, sb.port);
	}
	async function ask(n: NodeRecord) {
		reach[n.mesh] = { ...reach[n.mesh], asking: true };
		/* On the live site the mesh can't be reached, so ask the node's front door instead. */
		const gate = home?.ok && home.federation === id ? home.services.storage : undefined;
		if (onSecurePage() && gate) {
			const [front, relay] = await Promise.all([reachThroughFrontDoor(gate), askSwitchboard(n)]);
			reach[n.mesh] = {
				index: n.services.index ? front.index : undefined,
				postOffice: n.services.postOffice ? front.postOffice : undefined,
				storage: n.services.storage ? front.storage : undefined,
				relay,
				asking: false,
				at: new Date().toLocaleTimeString('en-GB')
			};
			return;
		}
		const [index, postOffice, storage, relay] = await Promise.all([
			n.services.index ? reachIndex(n.mesh, n.services.index.port) : Promise.resolve(undefined),
			n.services.postOffice ? reachPostOffice(n.mesh, n.services.postOffice.port) : Promise.resolve(undefined),
			n.services.storage ? reachStorage(n.mesh, n.services.storage.port) : Promise.resolve(undefined),
			askSwitchboard(n)
		]);
		reach[n.mesh] = { index, postOffice, storage, relay, asking: false, at: new Date().toLocaleTimeString('en-GB') };
	}
	$effect(() => {
		for (const n of nodes) if (!untrack(() => reach[n.mesh])) void ask(n);
	});
	const toneOf = (r?: Reach) => (r?.is === 'reached' ? 'good' : r?.is === 'unreached' ? 'needs-you' : 'plain') as 'good' | 'needs-you' | 'plain';
	const wordOf = (r?: Reach) => (r?.is === 'reached' ? 'Reached' : r?.is === 'unreached' ? 'Not reached' : 'Not checked');

	let adding = $state(false);
	let nodeCalled = $state('');
	let nodeMesh = $state('10.42.0.1');
	let nodeLighthouse = $state('');
	let nodeHasPostOffice = $state(true);
	let nodeHasIndex = $state(true);
	let nodeHasStorage = $state(true);
	let nodeHasRelay = $state(true);
	let nodeRelayHost = $state('');
	/* The switchboard's public address: usually the lighthouse's, without its port. */
	const hostOf = (lighthouse?: string) => (lighthouse ?? '').replace(/:\d+$/, '');
	/* A node listed before the switchboard: add it, keeping everything else. */
	let addingRelayTo = $state<string | null>(null);
	let relayHost = $state('');
	async function addSwitchboard(n: NodeRecord) {
		if (!own || !relayHost.trim()) return;
		busy = 'node';
		said = null;
		const out = await listNode(own, {
			called: n.called,
			mesh: n.mesh,
			lighthouse: n.lighthouse,
			postOffice: n.services.postOffice?.port,
			index: n.services.index?.port,
			storage: n.services.storage?.port,
			relay: { host: relayHost.trim(), port: 3478 }
		});
		busy = null;
		if (!out.ok) return void (said = { tone: 'bad', text: out.says });
		said = { tone: 'good', text: `${n.called} now lists its switchboard. Checking it…` };
		addingRelayTo = null;
		await refreshLedger();
	}
	async function addNode() {
		if (!own) return;
		busy = 'node';
		said = null;
		const out = await listNode(own, {
			called: nodeCalled,
			mesh: nodeMesh,
			lighthouse: nodeLighthouse,
			postOffice: nodeHasPostOffice ? 9001 : undefined,
			index: nodeHasIndex ? 8080 : undefined,
			storage: nodeHasStorage ? 8888 : undefined,
			relay: nodeHasRelay && (nodeRelayHost.trim() || hostOf(nodeLighthouse)) ? { host: nodeRelayHost.trim() || hostOf(nodeLighthouse), port: 3478 } : undefined
		});
		busy = null;
		if (!out.ok) return void (said = { tone: 'bad', text: out.says });
		said = { tone: 'good', text: `${out.node.called} is listed. Checking what this device can reach on it…` };
		adding = false;
		nodeCalled = '';
		nodeLighthouse = '';
		await refreshLedger();
	}
	async function withdraw(n: NodeRecord) {
		busy = 'node';
		const out = await withdrawNode(n);
		busy = null;
		said = out.ok ? { tone: 'good', text: `${n.called} is no longer listed. The record of it stays.` } : { tone: 'bad', text: out.says };
		await refreshLedger();
	}

	/*
	 * Q's home federation (ADR-Q-016): publish this federation's standing
	 * invitation as /incubator.json, so signing up to Q is joining it.
	 */
	let home = $state<Home | null>(null);
	$effect(() => void readHome().then((h) => (home = h)));
	const isHome = $derived(!!home?.ok && home.federation === id);
	/*
	 * The host's founder, proved by the host file's own signed founding — not by
	 * the federation record in this browser's vault. So on a fresh localhost,
	 * where the vault may not have been brought across, the founder still gets
	 * Website and Services (both only need the founder's passkey to sign).
	 */
	const hostFounder = $derived(isHome && !!home?.ok && !!identity && identity.did === home.founder);
	/*
	 * Acting in role (ADR-Q-038). Holding the office isn't enough to change
	 * things: you take it up first, and set it down to be just you. Until
	 * offices are built, the only one is caretaker, held by the founder.
	 */
	const offices = $derived(own || hostFounder ? ['caretaker'] : []);
	const acting = $derived(offices.length > 0 && role.isActing(id));
	/* Setting the role down leaves the office's tabs: back to Home. */
	$effect(() => {
		if (!acting && ['website', 'services', 'settings'].includes(tab)) tab = 'home';
	});
	let homeFile = $state<{ url: string; until: string } | null>(null);
	/* Where this federation's services answer from the internet (ADR-Q-016 step 5). */
	let svcStorage = $state('https://storage.135-181-156-21.sslip.io');
	let svcBellboy = $state('wss://bellboy.135-181-156-21.sslip.io');
	$effect(() => {
		if (home?.ok && home.federation === id) {
			if (home.services.storage) svcStorage = home.services.storage;
			if (home.services.bellboy) svcBellboy = home.services.bellboy;
		}
	});
	async function publishHome() {
		if (!identity || !own) return;
		busy = 'home';
		said = null;
		const out = await invite(identity, own, { for: 'Everyone who signs up to Q', days: 90 });
		busy = null;
		if (!out.ok) return void (said = { tone: 'bad', text: out.says });
		const until = new Date(out.invitation.offer.exp * 1000).toISOString();
		const file: HomeFile = {
			schema: HOME_SCHEMA,
			federation: own.founding.federation,
			name: own.founding.name,
			purpose: own.manifest.constitution.purpose,
			invitation: out.link.slice(out.link.indexOf('#') + 1),
			until,
			services: {
				...(svcStorage.trim() ? { storage: svcStorage.trim() } : {}),
				...(svcBellboy.trim() ? { bellboy: svcBellboy.trim() } : {})
			}
		};
		/* On your own computer, it goes straight into this copy (ADR-Q-018). */
		if (dev) {
			busy = 'home';
			const saved = await renewHost(file);
			busy = null;
			said = saved.ok
				? { tone: 'good', text: `Saved in this copy, running until ${onDay(until)}. Commit and push to put it live.` }
				: { tone: 'bad', text: saved.says };
			if (saved.ok) home = await readHome();
			return;
		}
		homeFile = { url: URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })), until };
	}

	/* ---- Your host (ADR-Q-018 §3): its website and its services ---- */
	let services = $state<ServiceState[] | null>(null);
	let restartWaiting = $state(false);
	let vercel = $state<VercelView | null>(null);
	async function loadServices() {
		const got = await hostServices();
		services = got?.services ?? null;
		restartWaiting = !!got?.restart;
		vercel = services?.find((s) => s.id === 'vercel')?.is === 'on' ? await hostVercel() : null;
	}
	/* Where a setting is on the live site: the newest change among its live entries. */
	function onVercel(name: string): { at?: number } | null {
		const live = (vercel?.settings ?? []).filter((e) => e.key === name && e.target.some((t) => t === 'production' || t === 'preview'));
		return live.length ? { at: Math.max(...live.map((e) => e.updatedAt ?? 0)) || undefined } : null;
	}
	/* Replacing one of Q's own secrets on a live site is asked twice. */
	let confirming = $state<string | null>(null);
	async function send(name: string, ends: string) {
		if (!identity || !home?.ok || !vercel?.project) return;
		if (MADE_FOR_YOU.has(name) && onVercel(name) && confirming !== name) return void (confirming = name);
		confirming = null;
		busy = 'send';
		serviceSays = null;
		const out = await sendSetting(identity, home.federation, name, ends, vercel.project);
		busy = null;
		serviceSays = out.ok
			? { tone: 'good', text: `${name} is on your live site now. It’s used from the next deploy: redeploy on Vercel, or push a commit.` }
			: { tone: 'bad', text: out.says };
		if (out.ok) vercel = await hostVercel();
	}
	$effect(() => {
		if (isHome && acting && dev) void loadServices();
	});
	/* One setting at a time: which one is open, and what's being typed. */
	let editing = $state<string | null>(null);
	let typed = $state('');
	let serviceSays = $state<{ tone: 'good' | 'bad'; text: string } | null>(null);
	async function saveSetting(s: ServiceState, name: string, value: string) {
		if (!identity || !home?.ok || !value.trim()) return;
		busy = 'service';
		serviceSays = null;
		const out = await setService(identity, home.federation, s.id, name, value);
		busy = null;
		if (!out.ok) return void (serviceSays = { tone: 'bad', text: out.says });
		editing = null;
		typed = '';
		serviceSays = { tone: 'good', text: `${name} is saved on this computer, and signed by you.` };
		await loadServices();
	}
	/* Vercel is only green once Vercel itself has answered, not just when the boxes are filled in. */
	const vercelRefused = (s: ServiceState) => s.id === 'vercel' && s.is === 'on' && !vercel?.connected;
	const serviceTone = (s: ServiceState) => (vercelRefused(s) ? 'needs-you' : s.is === 'on' ? 'good' : s.is === 'part' ? 'waiting' : 'plain');
	const serviceWord = (s: ServiceState) => (vercelRefused(s) ? (vercel?.says ? 'Vercel said no' : 'Checking…') : s.is === 'on' ? (s.id === 'vercel' ? 'Connected' : 'On') : s.is === 'part' ? 'Partly set' : 'Not set');

	/* ---- Communication (ADR-Q-016 §6): announcements to members ---- */
	let announcements = $state<Announcement[]>([]);
	/* This federation's storage, when it is Q's home and has one (ADR-Q-016 step 5). */
	const storage = $derived(home?.ok && home.federation === id ? home.services.storage : undefined);
	$effect(() => {
		if (id) void readAnnouncements(id, storage).then((l) => (announcements = l));
	});
	let annTitle = $state('');
	let annSays = $state('');
	let annLabel = $state('');
	let annHref = $state('');
	let annDays = $state(14);
	let annFile = $state<{ url: string; note: string } | null>(null);
	/* What's happening right now, in words, so the button never just sits there. */
	let annStage = $state('');
	function offer(list: Announcement[], note: string) {
		annFile = { url: URL.createObjectURL(new Blob([announcementsFile(id, list)], { type: 'application/json' })), note };
	}
	/*
	 * Publish the list: to the federation's storage when it has one — the
	 * gate checks the signatures and rings members — else as a file to push.
	 */
	async function publish(list: Announcement[], key: Awaited<ReturnType<typeof openFederationKey>>, sent: string, filed: string) {
		const live = list.filter((a) => Date.parse(a.until) > Date.now());
		if (storage && own) {
			annStage = `Sending to ${own.founding.name}’s storage…`;
			const publication = await makePublication(signerFor(key), own.founding.federation, live);
			const out = await publishAnnouncements(storage, own.founding.federation, live, publication);
			annStage = '';
			if (out.ok) {
				announcements = live;
				annFile = null;
				said = { tone: 'good', text: sent };
				return;
			}
			said = { tone: 'bad', text: `${out.says} Here it is as a file instead.` };
		}
		announcements = live;
		offer(live, filed);
	}
	async function announce() {
		if (!identity || !own) return;
		busy = 'announce';
		said = null;
		annStage = 'Signing with your thumbprint…';
		try {
			const key = await openFederationKey(own.sealedKey, identity);
			const a = await makeAnnouncement(signerFor(key), {
				federationDid: own.founding.federation,
				title: annTitle,
				says: annSays,
				action: annHref.trim() ? { href: annHref, label: annLabel.trim() || 'Open' } : undefined,
				days: annDays
			});
			await publish([a, ...announcements], key, `Sent. “${a.title}” is in members’ bells until ${onDay(a.until)}.`, `“${a.title}” is signed. Publish the file and members will see it until ${onDay(a.until)}.`);
			annTitle = annSays = annLabel = annHref = '';
		} catch (e) {
			said = { tone: 'bad', text: e instanceof Error ? e.message : String(e) };
		}
		annStage = '';
		busy = null;
	}
	async function takeDown(a: Announcement) {
		if (!identity || !own) return;
		busy = 'announce';
		said = null;
		try {
			const key = await openFederationKey(own.sealedKey, identity);
			await publish(announcements.filter((x) => x.id !== a.id), key, `“${a.title}” is taken down.`, `“${a.title}” is taken out. Publish the file and it goes from members’ bells.`);
		} catch (e) {
			said = { tone: 'bad', text: e instanceof Error ? e.message : String(e) };
		}
		busy = null;
	}

	const founding = $derived(own?.founding ?? mine?.founding ?? null);
	const manifest = $derived(own?.manifest ?? mine?.manifest ?? null);
	const c = $derived(manifest?.constitution);
	const onDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
	const complete = (m: { joining: { signatures: { by: string }[]; offer?: { admits: boolean } } }) =>
		m.joining.signatures.some((s) => s.by === 'federation') || !!m.joining.offer?.admits;

	let said = $state<{ tone: 'good' | 'bad'; text: string; rules?: string[] } | null>(null);
	let busy = $state<string | null>(null);

	/* Inviting */
	let inviteFor = $state('');
	let inviteDays = $state(14);
	let invitation = $state<{ link: string; until: string; admits: boolean } | null>(null);
	async function makeInvite() {
		if (!identity || !own) return;
		busy = 'invite';
		said = null;
		const out = await invite(identity, own, { for: inviteFor, days: inviteDays });
		busy = null;
		if (!out.ok) return void (said = { tone: 'bad', text: out.says });
		invitation = {
			link: out.link,
			until: onDay(new Date(out.invitation.offer.exp * 1000).toISOString()),
			admits: out.invitation.offer.admits
		};
	}

	/* A link to send the member after a decision about them. */
	let tellThem = $state<{ link: string; note: string } | null>(null);
	const nameOf = (m: MemberRecord) =>
		m.called ?? (m.joining.knownAs === 'anonymous' ? 'An anonymous member' : `${m.joining.member.slice(0, 16)}…${m.joining.member.slice(-6)}`);
	const initials = (m: MemberRecord) =>
		m.called ? m.called.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '?';

	/* Suspending */
	const LENGTHS = [
		{ days: 7, called: 'A week' },
		{ days: 14, called: 'Two weeks' },
		{ days: 30, called: 'A month' },
		{ days: 91, called: 'Three months' },
		{ days: 182, called: 'Six months' }
	];
	let suspending = $state<MemberRecord | null>(null);
	let suspendDays = $state(30);
	let suspendClause = $state('The agreement');
	let suspendWhy = $state('');
	async function confirmSuspend() {
		if (!identity || !own || !suspending) return;
		busy = 'suspend';
		said = null;
		const until = new Date(Date.now() + suspendDays * 86_400_000);
		const out = await suspendMember(identity, own, suspending, { clause: suspendClause, says: suspendWhy, until });
		busy = null;
		if (!out.ok) return void (said = { tone: 'bad', text: out.says, rules: 'rules' in out ? out.rules : undefined });
		said = { tone: 'good', text: `${nameOf(suspending)} is suspended until ${onDay(until.toISOString())}. They stay a member, can still leave, and are back on their own after that.` };
		tellThem = { link: out.link, note: `Send this to ${nameOf(suspending)}, so the suspension is in their own folder.` };
		suspending = null;
		suspendWhy = '';
		await refreshLedger();
	}
	async function liftFor(m: MemberRecord) {
		if (!identity || !own) return;
		busy = 'lift';
		said = null;
		const out = await liftSuspension(identity, own, m, 'Lifted early.');
		busy = null;
		if (!out.ok) return void (said = { tone: 'bad', text: out.says });
		said = { tone: 'good', text: `${nameOf(m)}’s suspension is lifted.` };
		tellThem = { link: out.link, note: `Send this to ${nameOf(m)}.` };
		await refreshLedger();
	}

	/* Removing */
	let removing = $state<MemberRecord | null>(null);
	let clause = $state('The agreement');
	let why = $state('');
	async function confirmRemove() {
		if (!identity || !own || !removing) return;
		busy = 'remove';
		said = null;
		const out = await removeMember(identity, own, removing, { clause, says: why });
		busy = null;
		if (!out.ok) return void (said = { tone: 'bad', text: out.says, rules: 'rules' in out ? out.rules : undefined });
		said = { tone: 'good', text: 'Removed. Their belonging has ended; everything they did before stays as it was.' };
		tellThem = { link: out.link, note: `Send this to ${nameOf(removing)}, so they know, in their own folder.` };
		removing = null;
		why = '';
		await refreshLedger();
	}

	/* Leaving */
	let leaving = $state(false);
	async function confirmLeave() {
		if (!identity || !mine) return;
		busy = 'leave';
		said = null;
		const out = await leaveFederation(identity, mine);
		busy = null;
		leaving = false;
		if (!out.ok) return void (said = { tone: 'bad', text: out.says, rules: 'rules' in out ? out.rules : undefined });
		said = { tone: 'good', text: 'You have left. You keep every receipt you had.' };
		await refreshLedger();
	}
</script>

<svelte:head><title>{founding?.name ?? 'Federation'} — Q</title></svelte:head>

<Page title={founding?.name ?? 'Federation'}>
	{#if !identity}
		<SignIn />
	{:else if ledger?.state !== 'ready'}
		<p class="opacity-60">Reading your folder…</p>
	{:else if !founding || !manifest || !c}
		<Empty icon="federations" title="Not found" description="This federation isn't in your folder." />
		<a class="btn preset-tonal mt-4" href="/federations">Back to federations</a>
	{:else}
		<!-- The club's card (2 October 2026): cover, picture, what it's for, and where you stand. -->
		<section class="card preset-outlined-surface-200-800 overflow-hidden mb-6">
			<div class="h-28 sm:h-36 preset-tonal-primary" aria-hidden="true"></div>
			<div class="flex flex-wrap items-end gap-4 px-5 sm:px-7 pb-5 -mt-12">
				{#if isHome && home?.ok && home.logo}
					<img src={home.logo} alt="" class="size-24 rounded-full object-contain bg-surface-50-950 border-4 border-surface-50-950" />
				{:else}
					<span class="size-24 shrink-0 rounded-full bg-primary-500 text-white border-4 border-surface-50-950 flex items-center justify-center h2" aria-hidden="true">{founding.name.slice(0, 1)}</span>
				{/if}
				<div class="flex-1 min-w-60 flex flex-col gap-2 pb-1">
					<p class="text-lg">{c.purpose}</p>
					<div class="flex flex-wrap gap-2">
						{#if own}<span class="badge preset-tonal-primary">{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>{/if}
						<span class="badge preset-tonal-primary">{JOIN_POLICIES.find((p) => p.id === c.joinPolicy)?.called}</span>
						<span class="badge preset-tonal-surface">{STRANDS.find((x) => x.id === c.strand)?.called}{c.endsOn ? `, until ${onDay(c.endsOn)}` : ''}</span>
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-2 pb-1">
			{#if isHome}<Status tone="good">Your host</Status>{/if}
			{#if own}
				<Status tone="good">You look after it</Status>
				<span class="text-sm">Caretaker until {onDay(new Date(own.caretakerUntil * 1000).toISOString())}</span>
			{:else if mine?.left}
				<Status tone="plain">You left</Status>
				<span class="text-sm">{onDay(mine.left.at)}</span>
			{:else if mine?.removed}
				<Status tone="plain">Removed</Status>
				<span class="text-sm">{onDay(mine.removed.at)} — {mine.removed.says} ({mine.removed.clause})</span>
			{:else if mine && standingAt(mine).is === 'suspended'}
				<Status tone="waiting">Suspended until {onDay(mine.suspended!.until)}</Status>
				<span class="text-sm">{mine.suspended!.says} ({mine.suspended!.clause}). You are still a member, and can still leave.</span>
			{:else if mine && complete(mine)}
				<Status tone="good">Member</Status>
				<span class="text-sm">Since {onDay(mine.joining.at)}</span>
				{#if mine.card?.picture}<img src={mine.card.picture} alt="" class="size-8 rounded-full" />{/if}
				<span class="text-sm">
					· Known here as {mine.joining.knownAs === 'anonymous' ? 'an anonymous member' : (mine.card?.name ?? 'you')}
				</span>
			{:else if mine}
				<Status tone="waiting">Waiting to be accepted</Status>
			{/if}
		</div>
			</div>
		</section>

		<!-- Which hat you're wearing (ADR-Q-038). -->
		{#if offices.length}
			<div class="mb-6"><RoleSwitch federation={id} name={founding.name} {offices} /></div>
		{/if}

		{#if said}
			<div class="card p-4 mb-6 {said.tone === 'good' ? 'preset-tonal-success' : 'preset-tonal-error'}" role="status">
				<p>{said.text}</p>
				{#if said.rules?.length}<p class="role-token text-xs mt-2">{said.rules.join(' · ')}</p>{/if}
			</div>
		{/if}

		<Tabs value={tab} onValueChange={(d) => (tab = d.value)}>
			<Tabs.List class="mb-6">
				<Tabs.Trigger value="home" class="min-h-11">Home</Tabs.Trigger>
				{#if isHome && acting}
					<Tabs.Trigger value="website" class="min-h-11">Website</Tabs.Trigger>
					<Tabs.Trigger value="services" class="min-h-11">Services</Tabs.Trigger>
				{/if}
				{#if isHome}<Tabs.Trigger value="bank" class="min-h-11">Bank</Tabs.Trigger>{/if}
				<Tabs.Trigger value="members" class="min-h-11">Members</Tabs.Trigger>
				<Tabs.Trigger value="communication" class="min-h-11">Communication</Tabs.Trigger>
				{#if own && acting}<Tabs.Trigger value="settings" class="min-h-11">Settings</Tabs.Trigger>{/if}
				<Tabs.Indicator />
			</Tabs.List>

			<!-- Bank: the federation's mint, open to anyone (ADR-Q-035, 5 October 2026). -->
			{#if isHome && home?.ok}
				<Tabs.Content value="bank">
					<FederationBank name={founding.name} {identity} />
				</Tabs.Content>
			{/if}

			<!-- Home: a live information portal (2 October 2026). -->
			<Tabs.Content value="home">
				<IntroSlides
					id="federation-home"
					section="Home"
					slides={[
						{ title: `This is ${founding.name}’s home`, says: 'Everything happening in the club, live: what’s coming up, news from the club, and who has just joined.' },
						{ title: 'How it works', says: 'News and events are signed by the club, so you know they really came from it, not from someone pretending.' },
						{ title: 'What you can do', says: 'Read the latest, see what’s coming up, and say hi to new members. The other tabs are for the people, getting word to the club, and how it runs.' }
					]}
				/>
				<div class="flex flex-wrap gap-6">
					<div class="flex-[999_1_32rem] min-w-0 flex flex-col">
						<!-- Its snapshot (ADR-Q-030 §1): the network it runs, Join, what backs its credits. -->
						{#if isHome && home?.ok}<FederationSnapshot {home} {identity} {ledger} name={founding.name} />{/if}
						<Section title="Coming up">
							<Empty icon="festival" title="No events yet" description="Events are coming soon. The club will list them here, with a time and a place, and you’ll be able to say you’re going." />
						</Section>
						<Section title="News from the club">
							{#if !announcements.length}
								<Empty icon="bell" title="Nothing yet" description="When the club has news, it appears here and in members’ bells. Meeting minutes and posts are coming soon." />
							{:else}
								<ul class="flex flex-col gap-4">
									{#each announcements.slice(0, 5) as a (a.id)}
										<li class="flex flex-col gap-1 pb-4 border-b border-surface-200-800">
											<span class="text-xs font-bold text-primary-700-300">News · {onDay(a.at)}</span>
											<span class="font-bold text-lg">{a.title}</span>
											<p class="whitespace-pre-line">{a.says}</p>
											{#if a.action}<a class="btn btn-sm preset-tonal min-h-11 self-start mt-1" href={a.action.href}>{a.action.label}</a>{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</Section>
					</div>
					<aside class="flex-[1_1_16rem] flex flex-col gap-6">
						{#if acting && newMembers.length}
							<section class="card preset-outlined-secondary-500 p-4 flex flex-col gap-3">
								<h2 class="h5">New this week</h2>
								<ul class="flex flex-col gap-2">
									{#each newMembers as m (m.joining.member)}
										<li class="flex items-center gap-3">
											{#if m.picture}<img src={m.picture} alt="" class="size-10 rounded-full" />{:else}<span class="size-10 rounded-full preset-tonal-primary" aria-hidden="true"></span>{/if}
											<span><strong>{m.called ?? 'Someone'}</strong> joined {onDay(m.joining.at)}</span>
										</li>
									{/each}
								</ul>
							</section>
						{/if}
						<section class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-2">
							<h2 class="h5">About the club</h2>
							<dl class="flex flex-col gap-1 text-sm">
								<dt class="opacity-70">How people join</dt>
								<dd class="mb-2">{JOIN_POLICIES.find((p) => p.id === c.joinPolicy)?.means}</dd>
								<dt class="opacity-70">Founded</dt>
								<dd class="mb-2">{onDay(founding.at)}</dd>
								{#if own}<dt class="opacity-70">You look after it until</dt><dd class="mb-2">{onDay(new Date(own.caretakerUntil * 1000).toISOString())}</dd>{/if}
								<dt class="opacity-70">Its key</dt>
								<dd class="role-token text-xs break-all">{founding.federation}</dd>
							</dl>
						</section>
					</aside>
				</div>
			</Tabs.Content>

			<!-- Your host's website (ADR-Q-018 §3, §5): what people see, and going live. -->
			{#if isHome && acting && home?.ok}
				<Tabs.Content value="website">
					<Section title="What people see" description="The front of your host. Every page of it is a receipt, signed by the host.">
						<div class="card preset-outlined-surface-200-800 p-6 flex flex-col items-center text-center gap-3 max-w-xl">
							{#if home.logo}<img src={home.logo} alt="" class="h-20 w-auto object-contain" />{/if}
							<p class="h3">{home.name}</p>
							<p class="opacity-80">{home.purpose}</p>
						</div>
						<a class="btn preset-filled-primary-500 min-h-11 mt-4" href="/" target="_blank" rel="noopener">View website</a>
					</Section>
					<Section title="Going live" description="Putting this copy on the internet, at your own address.">
						{#if dev}
							<p class="max-w-2xl">This is the copy on your own computer. Going live comes next: Q will take you through putting your copy on GitHub and Vercel, one card at a time. Your keys go straight from this computer to Vercel, never through a web page.</p>
						{:else}
							<p class="max-w-2xl">This is the live site. Changes to it are made on the founder’s own computer and sent here.</p>
						{/if}
					</Section>
				</Tabs.Content>

				<!-- Your host's services (ADR-Q-018 §4): which keys are set, never the keys. -->
				<Tabs.Content value="services">
					<Section title="Services" description="What your host can do for its members. Each one needs a key from the company that provides it.">
						{#if !dev}
							<p class="max-w-2xl">Services are set on the founder’s own computer. Keys never pass through this page.</p>
							<!-- Pricing and hiring need no keys, so they work on the live site too. -->
							<div class="mt-4"><PricingFromFlow /></div>
						{:else if !services}
							<p class="opacity-60">Looking at this copy’s settings…</p>
						{:else}
							<ul class="grid gap-4 sm:grid-cols-2">
								{#each services as s (s.id)}
									<li class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-2">
										<div class="flex items-center gap-3">
											<span class="font-bold">{s.called}</span>
											<span class="ml-auto"><Status tone={serviceTone(s)}>{serviceWord(s)}</Status></span>
										</div>
										<p class="text-sm opacity-80">{s.what} <span class="opacity-70">From {s.from}.</span></p>
										<ul class="flex flex-col gap-3 text-sm">
											{#each s.settings as x (x.name)}
												<li class="flex flex-col gap-2">
													<div class="flex flex-wrap items-center gap-2">
														<span class="role-token text-xs">{x.name}</span>
														<span class="opacity-70">{!x.set ? 'not set' : x.secret ? (x.shows ? `set · ends ${x.shows}` : 'set') : x.shows}</span>
														{#if x.setAt}<span class="text-xs opacity-60">· {onDay(x.setAt)}</span>{/if}
														{#if x.restart}<Status tone="waiting">Restart to use</Status>{/if}
														{#if x.name === FEDERATIONS_SETTING}
															<!-- A plugin: on or off, nothing to type. -->
															<span class="ml-auto flex gap-2" role="group" aria-label="Federations">
																{#each ['on', 'off'] as v (v)}
																	<button
																		type="button"
																		class="btn btn-sm min-h-11 {(x.shows ?? 'off') === v ? 'preset-filled-primary-500' : 'preset-tonal'}"
																		aria-pressed={(x.shows ?? 'off') === v}
																		disabled={busy !== null}
																		onclick={() => void saveSetting(s, x.name, v)}>{v === 'on' ? 'On' : 'Off'}</button>
																{/each}
															</span>
														{:else if editing !== x.name}
															<span class="ml-auto flex gap-2">
																{#if MADE_FOR_YOU.has(x.name) && !x.set}
																	<button type="button" class="btn btn-sm preset-filled-primary-500 min-h-11" disabled={busy !== null} onclick={() => void saveSetting(s, x.name, madeForYou(x.name))}>Make for me</button>
																{/if}
																<button type="button" class="btn btn-sm preset-tonal min-h-11" disabled={busy !== null} onclick={() => ((editing = x.name), (typed = ''), (serviceSays = null))}>{x.set ? 'Change' : 'Set'}</button>
															</span>
														{/if}
													</div>
													{#if vercel?.connected && x.set && !s.localOnly}
														{@const there = onVercel(x.name)}
														<div class="flex flex-wrap items-center gap-2 text-xs">
															<span class="opacity-70">{there ? `On your live site${there.at ? ` · changed ${onDay(new Date(there.at).toISOString())}` : ''}` : 'Not on your live site yet'}</span>
															<button type="button" class="btn btn-sm preset-tonal min-h-11 ml-auto" disabled={busy !== null} onclick={() => void send(x.name, x.shows ?? '')}>
																{busy === 'send' ? 'Sending…' : there ? 'Send again' : 'Send to live site'}
															</button>
														</div>
														{#if confirming === x.name}
															<div class="card preset-tonal-warning p-3 flex flex-col gap-2 text-sm" role="alertdialog" aria-label="Replace on the live site">
																<p>Your live site already has its own {x.name}. Replacing it means anything made with the old one stops working: sign-in codes in flight, and channels sealed to it.</p>
																<div class="flex flex-wrap gap-2">
																	<button type="button" class="btn btn-sm preset-filled-error-500 min-h-11" onclick={() => void send(x.name, x.shows ?? '')}>Replace it</button>
																	<button type="button" class="btn btn-sm preset-tonal min-h-11" onclick={() => (confirming = null)}>Keep the live one</button>
																</div>
															</div>
														{/if}
													{/if}
													{#if editing === x.name}
														<div class="flex flex-wrap items-center gap-2">
															<input
																class="input min-h-11 flex-1 min-w-48 {x.secret ? 'role-token' : ''}"
																type={x.secret ? 'password' : 'text'}
																autocomplete="off"
																spellcheck="false"
																aria-label={x.name}
																bind:value={typed}
															/>
															<button type="button" class="btn btn-sm preset-filled-primary-500 min-h-11" disabled={busy !== null || !typed.trim()} onclick={() => void saveSetting(s, x.name, typed)}>
																{busy === 'service' ? 'Saving… touch your passkey' : 'Save'}
															</button>
															<button type="button" class="btn btn-sm preset-tonal min-h-11" onclick={() => ((editing = null), (typed = ''))}>Cancel</button>
														</div>
													{/if}
												</li>
											{/each}
										</ul>
									</li>
								{/each}
							</ul>
							{#if identity && home?.ok}<CoinDesigner {identity} host={home.federation} onChanged={() => void loadServices()} />{/if}
							{#if identity}<MoneyPublish {identity} onChanged={() => void loadServices()} />{/if}
							<div class="mt-4"><PricingFromFlow /></div>
							{#if vercel?.connected}
								<p class="text-sm mt-4"><Status tone="good">Connected to Vercel</Status> <span class="opacity-80">Project {vercel.project}. Send each key when you’re ready; nothing goes until you press it.</span></p>
							{:else if vercel?.says}
								<p class="text-sm card preset-tonal-error p-3 mt-4">{vercel.says}</p>
							{:else}
								<p class="text-sm opacity-70 mt-4">Fill in the Vercel card to send keys to your live site.</p>
							{/if}
							{#if serviceSays}<p class="text-sm card p-3 mt-4 {serviceSays.tone === 'good' ? 'preset-tonal-success' : 'preset-tonal-error'}" aria-live="polite">{serviceSays.text}</p>{/if}
							{#if restartWaiting}
								<div class="card preset-tonal-warning p-4 mt-4 max-w-2xl">
									<p class="font-bold">Restart Q to use the new keys</p>
									<p class="text-sm">In the terminal running <span class="role-token">pnpm dev</span>, press Ctrl+C, then run <span class="role-token">pnpm dev</span> again.</p>
								</div>
							{/if}
							<p class="text-sm opacity-70 mt-4 max-w-2xl">Keys are kept in <span class="role-token">apps/q/.env</span> on this computer, which git never sees. Each one you set is signed by you, and that record says only which key it is, never the key.</p>
						{/if}
					</Section>
				</Tabs.Content>
			{/if}

			<!-- Members: inviting and looking after people (caretaker); your own membership. -->
			<Tabs.Content value="members">
				<IntroSlides
					id="federation-members"
					section="Members"
					slides={[
						{ title: 'The people in the club', says: 'Your own membership, and what every member agreed to when they joined.' },
						{ title: 'You choose how you’re known', says: 'Anonymous, by name, or by name and picture: you chose when you joined, and the club never owns your identity.' },
						{ title: 'Leaving is always yours', says: 'You can leave at any time, alone, and keep every receipt you had. Nobody has to say yes.' }
					]}
				/>
				{#if own && acting}
					<Section title="Invite someone" description="Make a link, or a code they can scan. It is signed by the federation and runs out on its own.">
						<div class="flex flex-col gap-4 sm:flex-row sm:items-end">
							<label class="label">
								<span class="label-text">Who it’s for (a note, optional)</span>
								<input class="input" type="text" bind:value={inviteFor} />
							</label>
							<label class="label max-w-40">
								<span class="label-text">Good for</span>
								<select class="select" bind:value={inviteDays}>
									<option value={7}>7 days</option>
									<option value={14}>14 days</option>
									<option value={30}>30 days</option>
								</select>
							</label>
							<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy !== null} onclick={makeInvite}>
								{busy === 'invite' ? 'Making…' : 'Make invitation'}
							</button>
						</div>
						{#if invitation}
							<div class="mt-4">
								<ShareLink
									link={invitation.link}
									label="Invitation"
									note={invitation.admits
										? `Whoever opens this and signs the agreement becomes a member, until ${invitation.until}. Share it only with people you mean.`
										: `Whoever opens this can ask to join, until ${invitation.until}. You’ll accept each request yourself.`}
								/>
							</div>
						{/if}
					</Section>

					<Section title="Members" description="People who have joined and told you. Requests arrive as a link they send you.">
						<ul class="flex flex-col gap-2">
							<li class="card preset-outlined-surface-200-800 p-3 flex flex-wrap items-center gap-3">
								<Status tone="good">Member</Status><span>You — founder and caretaker</span>
							</li>
							{#each members as m (m.joining.member)}
								<li class="card preset-outlined-surface-200-800 p-3 flex flex-wrap items-center gap-3">
									{#if m.removed}
										<Status tone="plain">Removed</Status>
									{:else if standingAt(m).is === 'suspended'}
										<Status tone="waiting">Suspended until {onDay(m.suspended!.until)}</Status>
									{:else if complete(m)}
										<Status tone="good">Member</Status>
									{:else}
										<Status tone="waiting">Waiting</Status>
									{/if}
									{#if m.picture}
										<img src={m.picture} alt="" class="size-10 rounded-full" />
									{:else}
										<span class="size-10 rounded-full preset-tonal flex items-center justify-center font-bold" aria-hidden="true">{initials(m)}</span>
									{/if}
									<span class="font-bold">{nameOf(m)}</span>
									<span class="text-sm opacity-60">joined {onDay(m.joining.at)}</span>
									{#if m.removed}
										<span class="text-sm">— {m.removed.says} ({m.removed.clause})</span>
									{:else}
										<span class="ml-auto flex flex-wrap gap-2">
											{#if standingAt(m).is === 'suspended'}
												<button type="button" class="btn btn-sm preset-tonal min-h-11" disabled={busy !== null} onclick={() => liftFor(m)}>Lift early</button>
											{:else}
												<button type="button" class="btn btn-sm preset-tonal min-h-11" onclick={() => { suspending = m; removing = null; }}>Suspend…</button>
											{/if}
											<button type="button" class="btn btn-sm preset-tonal min-h-11" onclick={() => { removing = m; suspending = null; }}>Remove…</button>
										</span>
									{/if}
								</li>
							{/each}
						</ul>

						{#if suspending}
							<div class="card preset-tonal-warning p-4 mt-4 flex flex-col gap-3" role="alertdialog" aria-label="Suspend a member">
								<p class="font-bold">Suspend {nameOf(suspending)}?</p>
								<p class="text-sm">They stay a member, paused until the date, then back on their own. They can still leave. Nothing they did before changes.</p>
								<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="How long">
									{#each LENGTHS as l (l.days)}
										<button type="button" role="radio" aria-checked={suspendDays === l.days} class="btn min-h-11 {suspendDays === l.days ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => (suspendDays = l.days)}>{l.called}</button>
									{/each}
								</div>
								<p class="text-sm">Until {onDay(new Date(Date.now() + suspendDays * 86_400_000).toISOString())}.</p>
								<label class="label">
									<span class="label-text">The rule it relies on</span>
									<select class="select" bind:value={suspendClause}>
										<option>The agreement</option>
										<option>The federation’s rules</option>
									</select>
								</label>
								<label class="label">
									<span class="label-text">Why, in plain words</span>
									<textarea class="textarea" rows="2" bind:value={suspendWhy}></textarea>
								</label>
								<div class="flex flex-wrap gap-3">
									<button type="button" class="btn preset-filled-warning-500 min-h-11" disabled={busy !== null || !suspendWhy.trim()} onclick={confirmSuspend}>
										{busy === 'suspend' ? 'Suspending…' : 'Suspend'}
									</button>
									<button type="button" class="btn preset-tonal min-h-11" onclick={() => (suspending = null)}>Not now</button>
								</div>
							</div>
						{/if}

						{#if tellThem}
							<div class="mt-4"><ShareLink link={tellThem.link} label="Send this to them" note={tellThem.note} /></div>
						{/if}

						{#if removing}
							<div class="card preset-tonal-warning p-4 mt-4 flex flex-col gap-3" role="alertdialog" aria-label="Remove a member">
								<p class="font-bold">Remove {removing.called ?? 'this member'}?</p>
								<p class="text-sm">Their belonging ends from now. Everything they did before stays valid. The removal is signed by the federation and says which rule it relies on.</p>
								<label class="label">
									<span class="label-text">The rule it relies on</span>
									<select class="select" bind:value={clause}>
										<option>The agreement</option>
										<option>The federation’s rules</option>
									</select>
								</label>
								<label class="label">
									<span class="label-text">Why, in plain words</span>
									<textarea class="textarea" rows="2" bind:value={why}></textarea>
								</label>
								<div class="flex flex-wrap gap-3">
									<button type="button" class="btn preset-filled-error-500 min-h-11" disabled={busy !== null || !why.trim()} onclick={confirmRemove}>
										{busy === 'remove' ? 'Removing…' : 'Remove'}
									</button>
									<button type="button" class="btn preset-tonal min-h-11" onclick={() => (removing = null)}>Keep them</button>
								</div>
							</div>
						{/if}
					</Section>

				{/if}
				{#if mine && !mine.left && !mine.removed}
					<Section title="Leaving" description="You can leave at any time. Nobody is asked, and you keep every receipt you had.">
						{#if !leaving}
							<button type="button" class="btn preset-tonal min-h-11" onclick={() => (leaving = true)}>Leave…</button>
						{:else}
							<div class="card preset-tonal-warning p-4 flex flex-col gap-3" role="alertdialog" aria-label="Leave this federation">
								<p class="font-bold">Leave {founding.name}?</p>
								<div class="flex flex-wrap gap-3">
									<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy !== null} onclick={confirmLeave}>
										{busy === 'leave' ? 'Leaving…' : 'Leave'}
									</button>
									<button type="button" class="btn preset-tonal min-h-11" onclick={() => (leaving = false)}>Stay</button>
								</div>
							</div>
						{/if}
					</Section>
				{/if}
				<Section title="What members agree to" description="Each of these is a step a new member agrees to, one at a time.">
					<ol class="flex flex-col gap-3 list-decimal pl-6">
						<li><p class="font-bold">The agreement</p><p>{c.agreement}</p></li>
						{#each c.consent ?? [] as b (b.id)}
							<li><p class="font-bold">{b.title}</p><p class="whitespace-pre-line">{b.says}</p></li>
						{/each}
						<li><p class="font-bold">What can never change</p><p class="text-sm">Shown below.</p></li>
					</ol>
				</Section>

				<Section title="What can never change" description="Every federation carries these. No vote can remove them.">
					<ul class="list-disc pl-6 space-y-1">
						{#each PRINCIPLES as p (p.id)}<li>{p.says}</li>{/each}
					</ul>
				</Section>

			</Tabs.Content>

			<!-- Communication: announcements to members (ADR-Q-016 §6). -->
			<Tabs.Content value="communication">
				<IntroSlides
					id="federation-communication"
					section="Communication"
					slides={[
						{ title: 'Getting word to and from the club', says: 'News the club sends to its members, and soon, messages to the secretary and questions to the club.' },
						{ title: 'How it works', says: 'Everything the club announces is signed by it, and stays in members’ bells until its time is over.' },
						{ title: 'What’s coming', says: 'Message the secretary, ask the club a question, and answers everyone can see so nobody asks twice.' }
					]}
				/>
				{#if own && acting}
					<Section title="Tell your members" description="An announcement is signed by the federation and stays in members’ bells, read or not, until its time is over.">
						<div class="flex flex-col gap-4 max-w-2xl">
							<label class="label"><span class="label-text">Title</span><input class="input" bind:value={annTitle} /></label>
							<label class="label"><span class="label-text">What you want to say</span><textarea class="textarea" rows="4" bind:value={annSays}></textarea></label>
							<div class="grid gap-4 sm:grid-cols-2">
								<label class="label"><span class="label-text">A button (optional)</span><input class="input" bind:value={annLabel} /></label>
								<label class="label"><span class="label-text">Where it goes</span><input class="input" bind:value={annHref} /></label>
							</div>
							<label class="label max-w-48"><span class="label-text">Shows for</span>
								<select class="select" bind:value={annDays}>
									<option value={7}>A week</option><option value={14}>Two weeks</option><option value={30}>A month</option><option value={90}>Three months</option>
								</select>
							</label>
							<button type="button" class="btn preset-filled-primary-500 min-h-11 self-start" disabled={busy !== null || !annTitle.trim() || !annSays.trim()} onclick={() => void announce()}>
								{busy === 'announce' ? 'Sending…' : 'Sign and send'}
							</button>
							{#if annStage}
								<p class="text-sm" aria-live="polite">{annStage}</p>
							{:else if said}
								<p class="text-sm card p-3 {said.tone === 'good' ? 'preset-tonal-success' : 'preset-tonal-error'}" aria-live="polite">{said.text}</p>
							{:else if !annTitle.trim() || !annSays.trim()}
								<p class="text-xs opacity-60">Write a title and a message, and the button wakes up.</p>
							{/if}
						</div>
						{#if annFile}
							<div class="card preset-tonal p-4 mt-6 flex flex-col gap-3">
								<p class="font-bold">{annFile.note}</p>
								{#if isHome}
									<ol class="list-decimal pl-6 text-sm space-y-1">
										<li>Download the file.</li>
										<li>Put it in the repo at <span class="role-token">apps/q/static/announcements.json</span>.</li>
										<li>Commit and push. Every member’s Q checks the federation’s signature on each one.</li>
									</ol>
								{:else}
									<p class="text-sm">For now only Q’s home federation publishes announcements this way. Others will send theirs through their own bellboy.</p>
								{/if}
								<a class="btn preset-filled-primary-500 min-h-11 self-start" href={annFile.url} download="announcements.json">Download announcements.json</a>
							</div>
						{/if}
					</Section>
				{/if}
				<Section title="Announcements" description={announcements.length ? 'What this federation has told its members, while it still applies.' : ''}>
					{#if !announcements.length}
						<Empty icon="bell" title="Nothing announced" description="When there’s news, it appears here and in members’ bells." />
					{:else}
						<ul class="flex flex-col gap-3">
							{#each announcements as a (a.id)}
								<li class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-2">
									<div class="flex flex-wrap items-center gap-3">
										<span class="font-bold">{a.title}</span>
										<span class="text-xs opacity-60">{onDay(a.at)} · shows until {onDay(a.until)}</span>
										{#if own && acting}<button type="button" class="btn btn-sm preset-tonal min-h-11 ml-auto" disabled={busy !== null} onclick={() => void takeDown(a)}>Take it down</button>{/if}
									</div>
									<p class="whitespace-pre-line">{a.says}</p>
									{#if a.action}<a class="btn btn-sm preset-tonal min-h-11 self-start" href={a.action.href}>{a.action.label}</a>{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</Section>
			</Tabs.Content>

			<!-- Settings: the machines it runs. Caretaker only, in role. -->
			{#if own && acting}
				<Tabs.Content value="settings">
				<IntroSlides
					id="federation-settings"
					section="Settings"
					slides={[
						{ title: 'How the club runs', says: isHome ? 'Your host’s invitation, and the machines it runs.' : 'Who carries the club’s messages and calls, and the machines it runs.' },
						{ title: 'Changes are receipts', says: 'Every change is signed, so members can always see what changed, and when.' },
						{ title: 'What can never change', says: 'Anyone may leave at any time and keep their receipts. No vote can remove that.' }
					]}
				/>
				<!--
					Only the host itself has a standing invitation for everyone who signs up
					(ADR-Q-016). A club founded inside it never sees this: which federation is
					the host is decided when the copy is set up (ADR-Q-018), not here.
				-->
				{#if isHome}
				<Section title="Your host’s invitation" description="Signing up joins the host. Its standing invitation is signed by this federation and runs for 90 days.">
					{#if home?.ok}
						<p class="mb-3 flex flex-wrap items-center gap-2"><Status tone="good">This is your host</Status> <span class="text-sm">Its invitation runs until {onDay(home.until)}. Renew it before then.</span></p>
					{/if}
					{#if homeFile}
						<div class="card preset-tonal p-4 flex flex-col gap-3">
							<p class="font-bold">Your invitation is made and signed.</p>
							<ol class="list-decimal pl-6 text-sm space-y-1">
								<li>Download the file.</li>
								<li>Put it in the repo at <span class="role-token">apps/q/static/incubator.json</span>.</li>
								<li>Commit and push. Every Q checks its signature before trusting it.</li>
							</ol>
							<a class="btn preset-filled-primary-500 min-h-11 self-start" href={homeFile.url} download="incubator.json">Download incubator.json</a>
							<p class="text-xs opacity-60">Runs until {onDay(homeFile.until)}.</p>
						</div>
					{:else}
						<div class="grid gap-3 sm:grid-cols-2 mb-4 max-w-3xl">
							<label class="label"><span class="label-text">Its storage (https)</span><input class="input role-token text-xs" bind:value={svcStorage} /></label>
							<label class="label"><span class="label-text">Its bellboy (wss)</span><input class="input role-token text-xs" bind:value={svcBellboy} /></label>
						</div>
						<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy !== null} onclick={() => void publishHome()}>
							{busy === 'home' ? 'Signing…' : 'Renew the invitation'}
						</button>
					{/if}
				</Section>
				{/if}

				<Section
					title="Nodes"
					description={isHome
						? 'The machines this federation runs, on its own private mesh. Whether each service answers is checked from this device, now — never stored.'
						: 'Who carries this federation’s messages and calls: its host’s services, or its own node.'}
				>
					{#if nodes.length === 0 && !adding}
						{#if isHome}
							<Empty icon="federations" title="No nodes yet" description="A node runs the federation’s bellboy, directory, storage and switchboard — any or all of them. List one when it’s on the mesh." />
						{:else}
							<!-- The real choice, and what each costs (ADR-Q-020 §2). -->
							<div class="grid gap-4 sm:grid-cols-2 max-w-3xl">
								<div class="card preset-outlined-primary-500 p-4 flex flex-col gap-2">
									<p class="font-bold flex items-center gap-2"><Status tone="good">In use</Status> {home?.ok ? home.name : 'Your host'}’s services</p>
									<p class="text-sm">Its bellboy, storage and switchboard carry {founding.name}’s messages and calls.</p>
									<ul class="text-sm list-disc pl-5 space-y-1">
										<li>The bellboy is free.</li>
										<li>Storage and the switchboard come with a free allowance each month, then credits.</li>
									</ul>
									<p class="text-xs opacity-70">Credits are coming next.</p>
								</div>
								<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-2">
									<p class="font-bold">Your own node</p>
									<p class="text-sm">{founding.name}’s own machine runs its bellboy, storage and switchboard. Nothing is spent with {home?.ok ? home.name : 'the host'}; you look after it, from your own computer.</p>
								</div>
							</div>
						{/if}
					{/if}
					<ul class="flex flex-col gap-3">
						{#each nodes as n (n.mesh)}
							{@const r = reach[n.mesh]}
							<li class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-3">
								<div class="flex flex-wrap items-center gap-3">
									<span class="font-bold">{n.called}</span>
									<span class="role-token text-xs">mesh {n.mesh}</span>
									{#if n.lighthouse}<Status tone="plain">Lighthouse · {n.lighthouse}</Status>{/if}
									<span class="ml-auto flex flex-wrap gap-2">
										<button type="button" class="btn btn-sm preset-tonal min-h-11" disabled={r?.asking} onclick={() => ask(n)}>
											{r?.asking ? 'Checking…' : 'Check again'}
										</button>
										<button type="button" class="btn btn-sm preset-tonal min-h-11" disabled={busy !== null} onclick={() => withdraw(n)}>Withdraw</button>
									</span>
								</div>
								<dl class="grid gap-2 sm:grid-cols-[10rem_8rem_1fr] items-center">
									{#if n.services.postOffice}
										<dt class="flex items-center gap-2"><Icon name="bellboy" />Bellboy</dt>
										<dd><Status tone={toneOf(r?.postOffice)}>{r?.asking ? 'Checking' : wordOf(r?.postOffice)}</Status></dd>
										<dd class="text-sm">{r?.postOffice?.is === 'cannot-ask' ? '' : (r?.postOffice?.says ?? '')} <span class="role-token text-xs opacity-60">ws :{n.services.postOffice.port}</span></dd>
									{/if}
									{#if n.services.index}
										<dt class="flex items-center gap-2"><Icon name="directory" />Directory</dt>
										<dd><Status tone={toneOf(r?.index)}>{r?.asking ? 'Checking' : wordOf(r?.index)}</Status></dd>
										<dd class="text-sm">{r?.index?.is === 'cannot-ask' ? '' : (r?.index?.says ?? '')} <span class="role-token text-xs opacity-60">http :{n.services.index.port}</span></dd>
									{/if}
								{#if n.services.storage}
									<dt class="flex items-center gap-2"><Icon name="storage-unit" />Storage</dt>
									<dd><Status tone={toneOf(r?.storage)}>{r?.asking ? 'Checking' : wordOf(r?.storage)}</Status></dd>
									<dd class="text-sm">{r?.storage?.is === 'cannot-ask' ? '' : (r?.storage?.says ?? '')} <span class="role-token text-xs opacity-60">http :{n.services.storage.port}</span></dd>
								{/if}
								{#if n.services.relay}
									<dt class="flex items-center gap-2"><Icon name="switchboard" />Switchboard</dt>
									<dd><Status tone={toneOf(r?.relay)}>{r?.asking ? 'Checking' : wordOf(r?.relay)}</Status></dd>
									<dd class="text-sm">{r?.relay?.says ?? ''} <span class="role-token text-xs opacity-60">turn {n.services.relay.host}:{n.services.relay.port} · public</span></dd>
								{:else}
									<!-- Listed before the switchboard existed: always shown, so it's never hidden. -->
									<dt class="flex items-center gap-2"><Icon name="switchboard" />Switchboard</dt>
									<dd><Status tone="plain">Not listed</Status></dd>
									<dd class="text-sm">
										{#if addingRelayTo !== n.mesh}
											<button type="button" class="btn btn-sm preset-filled-primary-500 min-h-11" disabled={busy !== null || !own} onclick={() => ((addingRelayTo = n.mesh), (relayHost = hostOf(n.lighthouse)))}>Add it</button>
										{/if}
									</dd>
								{/if}
								</dl>
								{#if addingRelayTo === n.mesh}
									<div class="card preset-tonal p-3 flex flex-col gap-2">
										<p class="text-sm">The switchboard is on the node’s <strong>public</strong> address, so callers anywhere can reach it.</p>
										<label class="label max-w-sm"><span class="label-text">Its public address</span><input class="input role-token" type="text" bind:value={relayHost} /></label>
										<div class="flex flex-wrap gap-2">
											<button type="button" class="btn btn-sm preset-filled-primary-500 min-h-11" disabled={busy !== null || !relayHost.trim()} onclick={() => void addSwitchboard(n)}>{busy === 'node' ? 'Listing…' : 'Add it'}</button>
											<button type="button" class="btn btn-sm preset-tonal min-h-11" onclick={() => (addingRelayTo = null)}>Not now</button>
										</div>
									</div>
								{/if}
								{#if [r?.postOffice, r?.index, r?.storage].some((x) => x?.is === 'cannot-ask')}
									<p class="text-sm">Not checked from here: a secure (https) page can’t reach the federation’s private mesh. They’re checked from Q on a computer that’s on the mesh.</p>
								{:else if r?.at}<p class="text-xs opacity-60">Checked from this device at {r.at}.</p>{/if}
							</li>
						{/each}
					</ul>

					{#if adding}
						<div class="card preset-tonal p-4 mt-4 flex flex-col gap-3">
							<p class="font-bold">List a node</p>
							<label class="label">
								<span class="label-text">What you call it</span>
								<input class="input" type="text" bind:value={nodeCalled} />
							</label>
							<label class="label">
								<span class="label-text">Its address on the mesh</span>
								<input class="input role-token" type="text" bind:value={nodeMesh} />
							</label>
							<label class="label">
								<span class="label-text">If it’s the mesh’s lighthouse, its public address (optional)</span>
								<input class="input role-token" type="text" bind:value={nodeLighthouse} />
							</label>
							<fieldset class="flex flex-wrap gap-4">
								<legend class="label-text mb-1">What it runs</legend>
								<label class="flex items-center gap-2"><input class="checkbox" type="checkbox" bind:checked={nodeHasPostOffice} /><Icon name="bellboy" /> Bellboy (port 9001)</label>
								<label class="flex items-center gap-2"><input class="checkbox" type="checkbox" bind:checked={nodeHasIndex} /><Icon name="directory" /> Directory (port 8080)</label>
							<label class="flex items-center gap-2"><input class="checkbox" type="checkbox" bind:checked={nodeHasStorage} /><Icon name="storage-unit" /> Storage (port 8888)</label>
							<label class="flex items-center gap-2"><input class="checkbox" type="checkbox" bind:checked={nodeHasRelay} /><Icon name="switchboard" /> Switchboard (public, port 3478)</label>
							</fieldset>
							{#if nodeHasRelay}
								<label class="label max-w-sm">
									<span class="label-text">The switchboard’s public address (blank: the lighthouse’s)</span>
									<input class="input role-token" type="text" bind:value={nodeRelayHost} />
								</label>
							{/if}
							<div class="flex flex-wrap gap-3">
								<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy !== null || !nodeCalled.trim()} onclick={addNode}>
									{busy === 'node' ? 'Listing…' : 'List it'}
								</button>
								<button type="button" class="btn preset-tonal min-h-11" onclick={() => (adding = false)}>Not now</button>
							</div>
						</div>
					{:else}
						<button type="button" class="btn preset-tonal min-h-11 mt-4" onclick={() => (adding = true)}>{isHome || nodes.length ? 'List a node…' : 'Run your own node…'}</button>
					{/if}
				</Section>
				</Tabs.Content>
			{/if}
		</Tabs>

		<a class="btn preset-tonal-surface min-h-11" href="/federations">Back to federations</a>
	{/if}
</Page>
