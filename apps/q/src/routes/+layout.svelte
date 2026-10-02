<script lang="ts">
	/*
	 * Q's shell — Reimagined with Skeleton UI
	 *
	 * Layout: AppBar (header) + Navigation (sidebar/bar) + Main content
	 * - Desktop: Sidebar navigation (left) + content (right)
	 * - Mobile: Bottom bar navigation + full-width content
	 */
	import '../app.css';
	import { onMount } from 'svelte';
	import { page, updated } from '$app/state';
	import { goto } from '$app/navigation';
	import { dev } from '$app/environment';
	import { localHost } from '$lib/host-setup';
	import { Navigation, Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Icon, FaIcon, Status, type IconName } from '@inqbeta/q-ui';
	import { watch, remembered, resumeSession, type Identity } from '@inqbeta/q-core/passkey';
	import { watchFolder } from '@inqbeta/q-core/folder';
	import { startBackgroundSync, stopBackgroundSync } from '@inqbeta/q-core/offline-queue';
	import { theme } from '$lib/settings.svelte';
	import ThemeSwitch from '$lib/components/ThemeSwitch.svelte';
	import SpeechSwitch from '$lib/components/SpeechSwitch.svelte';
	import FrontDoor from '$lib/components/FrontDoor.svelte';
	import BetaBadge from '$lib/components/BetaBadge.svelte';
	import TestSiteNote from '$lib/components/TestSiteNote.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';
	import { isPublicPage } from '$lib/guard';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SideNav from '$lib/components/SideNav.svelte';
	import LanguageMenu from '$lib/components/LanguageMenu.svelte';
	import BackupNeeded from '$lib/components/BackupNeeded.svelte';
	import SpeechNote from '$lib/components/SpeechNote.svelte';
	import Resume from '$lib/components/Resume.svelte';
	import { whereTo } from '$lib/guard';
	import { language } from '$lib/i18n/index.svelte';
	import { thisBrowser } from '@inqbeta/q-core/browser';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { startAutoSync } from '$lib/autosync';
	import { warmWhenIdle, sleepEngine } from '$lib/actions/engine';
	import { ABOUT_YOU } from '$lib/questions/about-you';
	import { answeringOf, answersFrom } from '$lib/answers';
	import type { AnswerSet } from '@inqbeta/q-core/questions';
	import { bellConfig, listen, collect, type Notice } from '$lib/bellboy';
	import { connectMqtt } from '$lib/mqtt-ws';
	import ReceivedView from '$lib/components/ReceivedView.svelte';
	import { readHome } from '$lib/home';
	import { readAnnouncements, readIds, markRead, restoreRead } from '$lib/announcements';
	import { keptFrom, knownKept, keepSoon } from '$lib/kept-settings';
	import { startMessaging, watchArrivals, sendTo, type Signed } from '$lib/messages';
	import { lengthOf } from '$lib/voicemail';
	import { plugins, restorePlugins } from '$lib/plugins.svelte';
	import { peopleFrom } from '$lib/people';
	import type { Announcement } from '@inqbeta/q-core/announcements';
	import { reachFor, watchReach, restoreReach, type Reach } from '$lib/notify';

	/*
	 * The bell (ADR-Q-014 §4): notices from the bellboy. Kept apart from the
	 * older notifications list, which the poll below replaces wholesale.
	 * The bell moves once when one arrives (not for reduced motion), shows a
	 * count, and lists who it's from and the title. Clicking a line collects it.
	 */
	type BellNotice = { notice: Notice; at: Date; state: 'new' | 'collecting' | 'captured' | 'failed'; says?: string };
	let notices = $state<BellNotice[]>([]);
	let ringing = $state(false);
	let announce = $state('');
	const bell = bellConfig();
	/* Your notifications card: what rings, what waits quietly, what's off. */
	let reach = $state<Record<string, Reach>>({});
	$effect(() => watchReach((a) => (reach = a)));
	const peopleReach = $derived(reachFor('people', reach));
	function ring() {
		ringing = true;
		setTimeout(() => (ringing = false), 2400);
	}
	$effect(() => {
		if (!identity || !bell) return;
		let hangUp: (() => void) | null = null;
		let gone = false;
		void listen(bell, (n) => {
			if (notices.some((x) => x.notice.receipt === n.receipt) || capturedHashes.has(n.receipt)) return;
			notices.unshift({ notice: n, at: new Date(), state: 'new' });
			announce = `New: ${n.from} — ${n.title}`;
			if (reachFor('people') === 'ring') ring();
		}).then((h) => (gone ? h() : (hangUp = h)));
		return () => {
			gone = true;
			hangUp?.();
		};
	});
	async function collectNotice(b: BellNotice) {
		if (!bell || b.state === 'collecting' || b.state === 'captured') return;
		b.state = 'collecting';
		const out = await collect(bell, b.notice);
		b.state = out.ok ? 'captured' : 'failed';
		b.says = out.says;
		if (out.ok) {
			/* Open what was captured straight away, as a person reads it. */
			viewing = { kept: { from: b.notice.from, title: b.notice.title, kind: b.notice.kind, hash: b.notice.receipt, collectedAt: new Date().toISOString(), receipt: out.receipt as Record<string, unknown> }, holds: true };
			notificationsOpen = false;
			void refreshLedger();
		}
	}
	const newNotices = $derived(peopleReach === 'ring' ? notices.filter((n) => n.state === 'new').length : 0);

	/*
	 * Announcements from Q's home federation (ADR-Q-016 §6), for its members.
	 * They stay in the bell, read or not, until their time is over.
	 */
	let homeName = $state('');
	let ledger = $state<Ledger | null>(null);
	let homeDid = $state('');
	let announcements = $state<Announcement[]>([]);
	let seen = $state<Set<string>>(new Set());
	let reading = $state<Announcement | null>(null);
	let homeStorage = $state<string | undefined>(undefined);
	let homeBellboy = $state<string | undefined>(undefined);
	const homeReach = $derived(homeDid ? reachFor(`fed:${homeDid}`, reach) : 'quiet');
	$effect(() => {
		if (!identity) return;
		void readHome().then(async (h) => {
			if (!h.ok) return;
			homeName = h.name;
			homeDid = h.federation;
			homeStorage = h.services.storage;
			homeBellboy = h.services.bellboy;
			announcements = await readAnnouncements(h.federation, h.services.storage);
			seen = readIds();
		});
	});
	/*
	 * Listen on the home federation's news channel (ADR-Q-016 §6): the bellboy
	 * pings "there's news", carrying nothing; Q collects the signed
	 * announcements from the storage and checks them. Members only.
	 */
	$effect(() => {
		/* Off on the notifications card: Q doesn't even listen. */
		if (!identity || !homeBellboy || !homeDid || !inHomeFed || homeReach === 'off') return;
		const did = homeDid, storage = homeStorage, url = homeBellboy;
		let line: { close(): void } | null = null;
		let gone = false;
		void connectMqtt(
			{
				url,
				clientId: `q-news-${crypto.randomUUID().slice(0, 8)}`,
				onMessage: async () => {
					const before = new Set(announcements.map((a) => a.id));
					announcements = await readAnnouncements(did, storage);
					if (announcements.some((a) => !before.has(a.id))) {
						announce = `New from ${homeName}`;
						if (reachFor(`fed:${did}`) === 'ring') ring();
					}
				}
			},
			[`q/fed/${did}/news`]
		)
			.then((l) => (gone ? l.close() : (line = l)))
			.catch(() => {
				/* No news line: announcements still arrive whenever Q opens. */
			});
		return () => {
			gone = true;
			line?.close();
		};
	});
	/* Only members (and its caretaker) hear from it. */
	const inHomeFed = $derived(
		!!homeDid && (ledger?.found ?? []).some((f) => (f.kind === 'membership' || f.kind === 'federation') && f.key.endsWith(`:${homeDid}`))
	);
	const heard = $derived(inHomeFed && homeReach !== 'off' ? announcements : []);
	/* Only what rings is counted; quiet ones wait in the list without a number. */
	const unheard = $derived(homeReach === 'ring' ? heard.filter((a) => !seen.has(a.id)).length : 0);
	function openAnnouncement(a: Announcement) {
		markRead(a.id);
		seen = new Set([...seen, a.id]);
		keepSettings();
		reading = a;
		notificationsOpen = false;
	}
	/*
	 * Read: what the bell has captured, read back from your vault, so the
	 * history is the same on any device signed in to it and survives a reload.
	 * Unread: notices still waiting to be collected (above).
	 */
	type Captured = { hash: string; from: string; title: string; at: string; kept: Record<string, unknown>; holds: boolean; where: string };
	/* The receipt open in the drawer. */
	let viewing = $state<{ kept: Record<string, unknown>; holds: boolean; where?: string } | null>(null);
	const captured = $derived.by<Captured[]>(() => {
		const out: Captured[] = [];
		for (const r of ledger?.receipts ?? []) {
			const c = (r.json as { content?: { schema?: string; hash?: string; from?: string; title?: string; collectedAt?: string } } | undefined)?.content;
			if (c?.schema === 'inqbeta.received/1' && c.hash)
				out.push({ hash: c.hash, from: c.from ?? 'Someone', title: c.title ?? 'a message', at: c.collectedAt ?? r.at, kept: c as Record<string, unknown>, holds: r.holds !== 'no', where: r.where });
		}
		return out.sort((a, b) => b.at.localeCompare(a.at));
	});
	const capturedHashes = $derived(new Set(captured.map((c) => c.hash)));
	/* Live notices not yet in the vault: new, being collected, or failed. */
	const waiting = $derived(notices.filter((n) => !capturedHashes.has(n.notice.receipt)));
	const onDay = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

	// Notifications state
	let notificationsOpen = $state(false);
	let unreadCount = $state(0);
	const notifications = $state<{ id: string; type: string; message: string; time: Date; read: boolean }[]>([]);

	// Fetch notifications from API
	async function fetchNotifications() {
		if (!identity?.did) return;
		try {
			const res = await fetch(`/api/notifications?did=${encodeURIComponent(identity.did)}`);
			const data = await res.json();
			if (data.notifications) {
				notifications.length = 0;
				notifications.push(...data.notifications.map((n: any) => ({
					...n,
					time: new Date(n.time)
				})));
				unreadCount = data.unreadCount || 0;
			}
		} catch (e) {
			console.error('Failed to fetch notifications:', e);
		}
	}

	// Watch for identity changes to fetch notifications
	/* Polled only while the tab is visible and online: a hidden tab asking a
	 * server every 30 seconds is battery, network and log noise for nothing.
	 * Coming back to the tab fetches at once. */
	$effect(() => {
		if (!identity?.did) return;
		const tick = () => {
			if (document.visibilityState === 'visible' && navigator.onLine) void fetchNotifications();
		};
		tick();
		const interval = setInterval(tick, 30000);
		document.addEventListener('visibilitychange', tick);
		return () => {
			clearInterval(interval);
			document.removeEventListener('visibilitychange', tick);
		};
	});

	function addNotification(type: string, message: string) {
		const notif = {
			id: crypto.randomUUID(),
			type,
			message,
			time: new Date(),
			read: false
		};
		notifications.unshift(notif);
		unreadCount++;
	}

	function markAllRead() {
		notifications.forEach(n => n.read = true);
		unreadCount = 0;
		// Also mark on server
		if (identity?.did) {
			fetch(`/api/notifications?did=${encodeURIComponent(identity.did)}&id=`, {
				method: 'PATCH'
			}).catch(console.error);
		}
	}

	async function toggleNotifications() {
		notificationsOpen = !notificationsOpen;
		if (notificationsOpen) {
			await fetchNotifications();
		}
	}

	let { children } = $props();

	let identity = $state<Identity | null>(null);
	/* The public DID kept from last time, when the keys are not in this tab. */
	let known = $state<string | null>(null);
	/* Set once the passkey module has answered, so the guard never acts on a guess. */
	let answered = $state(false);

	/* Start watching the folder at once — and notice when it is ready, because
	 * a channel cannot be written down before there is somewhere to write it. */
	/* Said in the header as well as at the door: a reader stays a reader on every
	 * page, and finding that out only when a save fails is too late. */
	let can = $state({ keep: true, read: true, backup: false, says: '', fix: '' });
	$effect(() => {
		can = thisBrowser();
	});

	let folderReady = $state(false);
	$effect(() => watchFolder((s) => (folderReady = s.kind === 'ready')));

	/* A refresh or a new tab carries on as whoever was signed in here, for 30
	 * quiet minutes (passkey.ts, Darren 2026-09-25). Once, on load. */
	let resumed = false;
	$effect(() => {
		if (resumed) return;
		resumed = true;
		void resumeSession();
	});

	/* Every channel kept level in the background while signed in (lib/autosync.ts). */
	$effect(() => {
		if (!identity || !folderReady) return;
		return startAutoSync(() => void refreshLedger());
	});


	/*
	 * `signOut()` clears the remembered DID along with everything else that
	 * belonged to the person, so `remembered()` is already null by the time this
	 * runs. There used to be a sessionStorage flag here saying "ignore what you
	 * remember, we just signed out" — it was covering for a sign-out that did
	 * not clear, and it was fragile besides: it was consumed by whichever
	 * notification arrived first, which need not have been the one that mattered.
	 */
	$effect(() =>
		watch((id) => {
			identity = id;
			known = id?.did ?? remembered();
			answered = true;
			if (id) startBackgroundSync(5 * 60 * 1000);
			else stopBackgroundSync();
			/* Signing in wakes the rule engine, so it is ready before anyone acts;
			 * signing out puts it to sleep (lib/actions/engine.ts, ADR-Q-009). */
			if (id) warmWhenIdle();
			else sleepEngine();
		})
	);

	/*
	 * Where you may be without keys in this tab.
	 *
	 * The keys live in memory for the life of the tab — that is the design, not
	 * a fault — so a reload always arrives here with nothing held. Sending
	 * someone away at that moment is what made the dashboard look like it had
	 * forgotten them: the touch that brings the keys back is on the page they
	 * were just thrown off.
	 *
	 * So: a remembered DID is not signed out, it is one touch away, and it
	 * stays put. Only a browser with nothing remembered is sent to sign in.
	 *
	 * This reads page.url.pathname, so it runs again on every navigation
	 * rather than only on the first subscribe.
	 */

	/*
	 * The first thing after the passkey.
	 *
	 * Signing in makes a DID and nothing else — an identity with nothing said
	 * under it. Q's first question set is what turns that into a graph, so it is
	 * offered here rather than buried, once there is a folder to write it into.
	 *
	 * Offered, not forced: it is a link, it can be ignored for ever, and nothing
	 * else waits on it.
	 */
	let askedAlready = $state<boolean | null>(null);
	$effect(() => watchLedger((l) => (ledger = l)));

	/*
	 * Messages (2 October 2026): collected from your inbox at the storage
	 * when Q opens and whenever the bellboy pings it. Unread ones count on the
	 * bell (if Messages is on); a call rings with Answer.
	 */
	let calling = $state<{ from: string; did: string; inbox?: string; link: string; call?: string } | null>(null);
	/* Calls that rang while you were away: kept here until you call back or close them. */
	let missed = $state<{ did: string; name: string; at: string; call?: string }[]>([]);
	/* Calls known to be over: their caller hung up, or left a voice message. They never ring. */
	const overCalls = new Set<string>();
	const voicemailCalls = new Set<string>();
	const voicemailFor = (call?: string) => !!call && voicemailCalls.has(call);
	$effect(() => {
		if (!identity || !folderReady) return;
		const stopArrivals = watchArrivals((m: Signed) => {
			const who = peopleFrom(ledger, identity?.did).find((p) => p.did === m.did)?.name ?? (m.content.card?.['q:person/called'] || 'Someone');
			/* The caller gave up, or left a voice message: that call is over. */
			if ((m.content.kind === 'call-ended' || m.content.kind === 'voicemail') && m.content.call) {
				overCalls.add(m.content.call);
				if (m.content.kind === 'voicemail') voicemailCalls.add(m.content.call);
				if (calling?.call === m.content.call) {
					calling = null;
					if (m.content.kind === 'call-ended') {
						missed = [{ did: m.did, name: who, at: m.content.at, call: m.content.call }, ...missed.filter((x) => x.did !== m.did)];
						announce = `Missed call from ${who}`;
					}
				}
				/* A voice message says it all: no separate missed call for the same call. */
				if (m.content.kind === 'voicemail') missed = missed.filter((x) => x.call !== m.content.call);
				if (m.content.kind === 'call-ended') return;
			}
			if (m.content.kind === 'call' && m.content.link) {
				/* A call only rings while it's happening: one that waited for you to sign in, or has ended, is a missed call. */
				const over = !!m.content.call && overCalls.has(m.content.call);
				if (over || Date.now() - Date.parse(m.content.at) > 90_000) {
					/* Left a voice message? That notice is enough. */
					if (over && voicemailFor(m.content.call)) return;
					missed = [{ did: m.did, name: who, at: m.content.at, call: m.content.call }, ...missed.filter((x) => x.did !== m.did)];
					announce = `Missed call from ${who}`;
					if (reachFor('people') === 'ring') ring();
					return;
				}
				calling = { from: who, did: m.did, inbox: m.content.replyTo, link: m.content.link, call: m.content.call };
				announce = `${who} is calling`;
				ring();
				return;
			}
			if (m.content.kind === 'call-reply' || m.content.kind === 'call-declined') return;
			announce = m.content.kind === 'linked-back' ? `${who} linked with you` : m.content.kind === 'voicemail' ? `Voice message from ${who}` : `New message from ${who}`;
			if (reachFor('people') === 'ring') ring();
		});
		const stop = startMessaging((n) => n && void refreshLedger());
		return () => {
			stopArrivals();
			stop();
		};
	});
	const people = $derived(peopleFrom(ledger, identity?.did ?? ''));
	/* Read somewhere else in Q (a conversation opened): the bell catches up, and the vault keeps it. */
	$effect(() => {
		const onRead = () => {
			seen = readIds();
			keepSettings();
		};
		window.addEventListener('q-read', onRead);
		return () => window.removeEventListener('q-read', onRead);
	});
	const unreadMessages = $derived.by(() => {
		const me = identity?.did;
		const out: { id: string; did: string; name: string; picture?: string; text: string; at: string; href: string }[] = [];
		for (const r of ledger?.receipts ?? []) {
			const m = r.json as Signed | undefined;
			const kind = m?.content?.kind;
			if (m?.content?.schema !== 'inqbeta.message/1' || (kind !== 'message' && kind !== 'linked-back' && kind !== 'voicemail') || m.did === me || seen.has(m.contentHash)) continue;
			const p = people.find((x) => x.did === m.did);
			/* Someone linking up with your card is news too: who, and that they're in your address book now. */
			out.push(
				kind === 'linked-back'
					? { id: m.contentHash, did: m.did, name: p?.name ?? 'Someone', picture: p?.picture, text: 'Linked up with you. They’re in your address book.', at: m.content.at, href: '/contacts' }
					: kind === 'voicemail'
						? { id: m.contentHash, did: m.did, name: p?.name ?? 'Someone', picture: p?.picture, text: `Voice message, ${lengthOf(m.content.seconds ?? 0)}`, at: m.content.at, href: `/messages/${encodeURIComponent(m.did)}` }
						: { id: m.contentHash, did: m.did, name: p?.name ?? 'Someone', picture: p?.picture, text: m.content.text ?? '', at: m.content.at, href: `/messages/${encodeURIComponent(m.did)}` }
			);
		}
		return out.sort((a, b) => b.at.localeCompare(a.at));
	});
	const unreadCountMessages = $derived(peopleReach === 'ring' ? unreadMessages.length : 0);
	function answerCall() {
		if (!calling) return;
		try {
			sessionStorage.setItem('q.call.with', JSON.stringify({ did: calling.did, inbox: calling.inbox, name: calling.from }));
		} catch {
			/* the reply goes back by link instead */
		}
		const link = new URL(calling.link);
		calling = null;
		/* Within Q, not a reload: you stay signed in and the camera check starts straight away. */
		void goto(`${link.pathname}${link.hash}`);
	}
	function declineCall() {
		if (!calling) return;
		const c = calling;
		calling = null;
		/* Tell them, so their screen doesn't just keep ringing. */
		if (c.inbox) void sendTo({ did: c.did, inbox: c.inbox }, { kind: 'call-declined' });
	}


	/*
	 * Read marks and the notifications card come back from your vault after
	 * signing in (lib/kept-settings), and go back into it when they change.
	 */
	let keptReady = $state(false);
	$effect(() => {
		if (!identity) keptReady = false;
		if (!identity || !folderReady || ledger?.state !== 'ready' || keptReady) return;
		const did = identity.did;
		void Promise.all(ledger.found.filter((f) => f.kind === 'answers').map((f) => answersFrom(f.item))).then((list) => {
			const k = keptFrom(list.filter((a): a is AnswerSet => !!a), did);
			knownKept(k);
			if (k) {
				restoreRead(k.read);
				seen = readIds();
				restoreReach(k.notify);
				restorePlugins(k.plugins);
			}
			keptReady = true;
		});
	});
	function keepSettings() {
		if (identity && keptReady) keepSoon(identity, { read: [...readIds()], notify: reach, plugins: $state.snapshot(plugins.prefs) }, folderReady);
	}
	$effect(() => {
		void reach;
		void plugins.prefs;
		keepSettings();
	});

	$effect(() => {
		if (!identity || !folderReady || ledger?.state !== 'ready') return;
		const found = ledger.found.filter((f) => f.kind === 'answers');
		void Promise.all(found.map((f) => answersFrom(f.item)))
			.then((list) => answeringOf(ABOUT_YOU, list.filter((a): a is AnswerSet => !!a)))
			.then((a) => (askedAlready = !!a));
	});

	const offerQuestions = $derived(
		!!identity &&
			folderReady &&
			/* Never invite somebody to answer questions this browser cannot keep
			 * the answers to. */
			can.keep &&
			askedAlready === false &&
			!page.url.pathname.startsWith('/questions')
	);

	/*
	 * The rules live in $lib/guard.ts, as a function with no browser in it, so
	 * they can be walked route by route in a test. This effect is only the part
	 * that needs a browser — it has gone wrong twice while it was all one thing.
	 */
	$effect(() => {
		const to = whereTo(page.url.pathname, {
			answered,
			signedIn: !!identity,
			/* Read fresh, not off reactive state: signing out clears it, and the
			 * guard must see that in the same tick. */
			remembered: !!(identity?.did ?? remembered())
		});
		if (to) void goto(to);
	});

	/*
	 * A fresh copy opens on set-up (ADR-Q-018 §1). Development only, and asked
	 * once per load: a copy whose host isn't set up on this computer goes to
	 * /setup, whatever page was asked for.
	 */
	let hostAsked = false;
	$effect(() => {
		if (!dev || hostAsked) return;
		hostAsked = true;
		void localHost().then((h) => {
			if (h && !h.mark && location.pathname !== '/setup') void goto('/setup');
		});
	});

	/*
	 * There was a second guard here sending a signed-in person off /keys, on the
	 * grounds that it is "just the sign-in page". It is not: it is where your
	 * keys, your linked devices and your folder live, and it is the one page you
	 * would visit ON PURPOSE while signed in.
	 *
	 * It also made signing out impossible. The sign-out button lived inside
	 * SignIn, every other page renders SignIn only when signed OUT, and this
	 * guard closed the one door left. No way in, no way out.
	 *
	 * Redirecting after signing in is SignIn's own job, which it already does.
	 */

	/* Light or dark, and the language: remembered choices, else the device's. */
	onMount(() => {
		theme.start();
		language.start();
	});


	type Link = { href: string; label: string; icon: IconName };

	/* The side menu folded to icons, or open. Remembered in this browser. */
	let folded = $state(false);
	$effect(() => {
		try {
			folded = localStorage.getItem('q-nav-folded') === 'yes';
		} catch {
			/* open by default */
		}
	});
	$effect(() => {
		const f = folded;
		try {
			localStorage.setItem('q-nav-folded', f ? 'yes' : 'no');
		} catch {
			/* not remembered, which is fine */
		}
	});
	const navLayout = $derived(folded ? 'rail' : 'sidebar');

	// Mobile bottom bar navigation
	const barLinks: Link[] = [
		{ href: '/', label: 'You', icon: 'home' },
		{ href: '/communication', label: 'Talk', icon: 'message' },
		{ href: '/contacts', label: 'People', icon: 'contacts' },
		{ href: '/data', label: 'Files', icon: 'files' },
		{ href: '/balance', label: 'Credits', icon: 'wallet' }
	];

	const isHere = (href: string) => {
		const p = page.url.pathname;
		const at = (h: string) => (h === '/' ? p === '/' : p === h || p.startsWith(h + '/'));
		/* Communication gathers messages and calls. */
		return at(href) || (href === '/communication' && (at('/messages') || at('/call')));
	};
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<TestSiteNote />

{#if !identity && !known && page.url.pathname === '/'}
	<!-- The home page, signed out: the app bar is the sign-in (FrontDoor), and
	     the page below it starts with the arrow. No nav until you are in.
	     A remembered DID gets the shell instead, so the touch that brings the
	     keys back is always to hand. -->
	<FrontDoor />
	{@render children()}
	<SiteFooter />
{:else if !identity && !known && isPublicPage(page.url.pathname)}
	<!-- Contact and the legal pages, for someone not signed in: the mark home,
	     the same three switches, the page, and the footer. No dashboard nav. -->
	<header class="border-b border-surface-200-800">
		<div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
			<div class="flex items-center gap-3">
				<a href="/" aria-label="Q — home"><img src="/inqbeta.svg" alt="Q" class="h-10 w-auto" /></a>
				<BetaBadge />
			</div>
			<div class="flex items-center gap-4">
				<LanguageMenu />
				<ThemeSwitch />
				<SpeechSwitch />
			</div>
		</div>
	</header>
	<main>{@render children()}</main>
	<SiteFooter />
{:else if !identity && !known && page.url.pathname === '/keys'}
	<!-- Signed out, /keys goes home (lib/guard); nothing to show on the way. -->
	{@render children()}
{:else}
	<!-- App layout - full header, sidebar, navigation -->

<!-- Section 1: Header (full width, sticky) -->
<header class="sticky top-0 z-40 border-b border-surface-200-800/70 bg-surface-50-950/90 backdrop-blur">
	<!-- Header container: margin = 50% of sidebar when open, centered when collapsed -->
	<div class="relative flex items-center justify-between {navLayout === 'sidebar' ? 'mx-24 py-4' : 'mx-auto max-w-5xl px-6 py-4'}">
		<!-- Under the switches, only when this page is missing audio (lib/settings: coverage). -->
		<div class="absolute right-0 top-full mt-2"><SpeechNote /></div>
		<!-- Logo + Terminal Icon, and the Beta badge beside them -->
		<div class="flex items-center gap-3">
			<a href="/" class="flex items-end gap-1.5" aria-label="Q Overview">
				<img src="/inqbeta.svg" alt="Q" class="h-10 sm:h-11 w-auto object-contain" />
				<FaIcon name="terminal" size="lg" animation="beat-fade" speed="slow" class="text-surface-700-300 h-5 sm:h-5 mb-2" />
			</a>
			<BetaBadge />
		</div>
		
		<!-- Search Bar -->
		<SearchBar />

		<!--
			The trail is the front door's (FrontDoor): language, light/dark, read
			aloud — the same controls in the same corner, signed in or out — with
			the notifications bell ahead of them. Signing out is on Keys.
		-->
		<div class="flex items-center gap-4">
			<!-- Backup nudge: only when something new has gone five minutes uncarried. -->
			<BackupNeeded />
			<!-- Notifications: no background, the brand orange bell, as tall as the switches.
			     `btn` for the same side padding as the language button, so the three sit evenly. -->
			<button
				type="button"
				aria-label="Notifications"
				onclick={toggleNotifications}
				class="btn py-0 relative text-secondary-500 cursor-pointer {ringing ? 'motion-safe:animate-bounce' : ''}
					focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-500"
			>
				<Icon name="bell" class="size-7" stroke={2} />
				{#if unreadCount + newNotices + unheard + unreadCountMessages + missed.length > 0}
					<span class="absolute -right-2 -top-2 badge-icon preset-filled-error-500 text-xs">
						{unreadCount + newNotices + unheard + unreadCountMessages + missed.length > 9 ? '9+' : unreadCount + newNotices + unheard + unreadCountMessages + missed.length}
					</span>
				{/if}
			</button>

			<LanguageMenu />
			<ThemeSwitch />
			<SpeechSwitch />
		</div>
	</div>
</header>

<!-- What the bell captured, opened as a person reads it (a drawer from the right). -->
<Dialog open={!!viewing} onOpenChange={(e) => { if (!e.open) viewing = null; }}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-end">
			<Dialog.Content class="h-full w-full max-w-lg card bg-surface-50-950 p-6 shadow-xl overflow-y-auto">
				<header class="flex items-center justify-between mb-6">
					<Status tone="good">Captured</Status>
					<button type="button" class="btn btn-sm preset-tonal-surface min-h-11" onclick={() => (viewing = null)}>Close</button>
				</header>
				{#if viewing}
					<ReceivedView kept={viewing.kept} holds={viewing.holds} where={viewing.where ?? ''} />
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>

<!-- An announcement, opened. It stays in the bell until its time is over. -->
<Dialog open={!!reading} onOpenChange={(e) => { if (!e.open) reading = null; }}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-end">
			<Dialog.Content class="h-full w-full max-w-lg card bg-surface-50-950 p-6 shadow-xl overflow-y-auto">
				<header class="flex items-center justify-between mb-6">
					<span class="badge preset-filled-primary-500">From {homeName}</span>
					<button type="button" class="btn btn-sm preset-tonal-surface min-h-11" onclick={() => (reading = null)}>Close</button>
				</header>
				{#if reading}
					<article class="flex flex-col gap-4">
						<h2 class="h3">{reading.title}</h2>
						<p class="text-lg leading-relaxed whitespace-pre-line">{reading.says}</p>
						{#if reading.action}
							<a class="btn preset-filled-primary-500 min-h-11 self-start" href={reading.action.href} onclick={() => (reading = null)}>{reading.action.label}</a>
						{/if}
						<p class="text-sm opacity-60">
							{new Date(reading.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · stays in your bell until
							{new Date(reading.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} · signed by {homeName}
						</p>
					</article>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>

<!-- Read out when a notice arrives, for anyone who can't see the bell move. -->
<p class="sr-only" aria-live="polite">{announce}</p>

<!-- Notifications Dropdown -->
{#if notificationsOpen}
	<div class="fixed inset-0 z-50" onclick={toggleNotifications} onkeydown={(e) => e.key === 'Escape' && (notificationsOpen = false)} role="button" tabindex="0" aria-label="Close notifications"></div>
	<div class="fixed right-4 top-16 z-50 w-80 max-h-96 overflow-y-auto rounded-container border bg-surface-50-950 shadow-xl">
		<div class="flex items-center justify-between border-b border-surface-200-800 p-3">
			<h3 class="font-semibold">Notifications</h3>
			<button type="button" class="text-sm text-primary-500" onclick={markAllRead}>Mark all read</button>
		</div>
		<a href="/cards?tab=notifications" class="flex items-center gap-2 px-3 py-2 text-sm border-b border-surface-200-800 hover:bg-surface-100-900 min-h-11" onclick={() => (notificationsOpen = false)}>
			<Icon name="settings" class="size-4" /> Choose what reaches you
		</a>
		{#if missed.length}
			<p class="px-3 pt-3 text-xs font-bold uppercase opacity-60">Missed calls</p>
			<ul class="divide-y divide-surface-200-800 border-b border-surface-200-800">
				{#each missed as c (c.did)}
					<li class="p-3 flex items-center gap-3">
						<Icon name="phone" class="shrink-0" />
						<span class="flex-1 min-w-0">
							<span class="block text-sm font-bold">{c.name}</span>
							<span class="block text-xs opacity-60">{new Date(c.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
						</span>
						<a class="btn btn-sm preset-filled-primary-500 min-h-11" href="/call?with={encodeURIComponent(c.did)}" onclick={() => { notificationsOpen = false; missed = missed.filter((x) => x.did !== c.did); }}>Call back</a>
					</li>
				{/each}
			</ul>
		{/if}
		{#if unreadMessages.length}
			<p class="px-3 pt-3 text-xs font-bold uppercase opacity-60">People</p>
			<ul class="divide-y divide-surface-200-800 border-b border-surface-200-800">
				{#each unreadMessages.slice(0, 5) as m (m.id)}
					<li>
						<a href={m.href} class="w-full p-3 text-left hover:bg-surface-100-900 flex items-start gap-3 min-h-11" onclick={() => { notificationsOpen = false; if (m.href === '/contacts') markRead(m.id); }}>
							<span class="size-8 shrink-0 overflow-hidden rounded-full bg-surface-100-900 flex items-center justify-center">
								{#if m.picture}<img src={m.picture} alt="" class="size-full object-cover" />{:else}<span class="text-sm font-bold">{m.name.slice(0, 1)}</span>{/if}
							</span>
							<span class="flex flex-col gap-1 min-w-0">
								<span class="text-sm font-bold">{m.name}</span>
								<span class="text-xs opacity-70 truncate">{m.text}</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
		{#if heard.length}
			<p class="px-3 pt-3 text-xs font-bold uppercase opacity-60">From {homeName}</p>
			<ul class="divide-y divide-surface-200-800 border-b border-surface-200-800">
				{#each heard as a (a.id)}
					<li>
						<button type="button" class="w-full p-3 text-left hover:bg-surface-100-900 flex items-start gap-3 min-h-11" onclick={() => openAnnouncement(a)}>
							<Icon name="federations" class="mt-0.5 shrink-0 {seen.has(a.id) ? 'opacity-60' : ''}" />
							<span class="flex flex-col gap-1">
								<span class="text-sm {seen.has(a.id) ? 'opacity-70' : 'font-bold'}">{a.title}</span>
								<span class="text-xs opacity-60">{seen.has(a.id) ? 'Read' : 'New'} · until {new Date(a.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</span>
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		{#if waiting.length}
			<p class="px-3 pt-3 text-xs font-bold uppercase opacity-60">New</p>
			<ul class="divide-y divide-surface-200-800 border-b border-surface-200-800">
				{#each waiting as b (b.notice.receipt)}
					<li>
						<button
							type="button"
							class="w-full p-3 text-left hover:bg-surface-100-900 flex items-start gap-3 min-h-11"
							disabled={b.state === 'collecting' || b.state === 'captured'}
							onclick={() => collectNotice(b)}
						>
							<Icon name="bellboy" class="mt-0.5 shrink-0" />
							<span class="flex flex-col gap-1">
								<span class="text-sm"><span class="font-bold">{b.notice.from}</span> — {b.notice.title}</span>
								{#if b.state === 'new'}
									<span class="text-xs opacity-60">{b.at.toLocaleTimeString()} · Click to collect</span>
								{:else if b.state === 'collecting'}
									<span class="text-xs">Collecting…</span>
								{:else if b.state === 'captured'}
									<Status tone="good">{b.says}</Status>
								{:else}
									<Status tone="needs-you">{b.says}</Status>
								{/if}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		{#if captured.length}
			<p class="px-3 pt-3 text-xs font-bold uppercase opacity-60">Captured</p>
			<ul class="divide-y divide-surface-200-800 border-b border-surface-200-800">
				{#each captured as c (c.hash)}
					<li>
						<button
							type="button"
							class="w-full p-3 text-left hover:bg-surface-100-900 flex items-start gap-3 min-h-11"
							onclick={() => {
								viewing = { kept: c.kept, holds: c.holds, where: c.where };
								notificationsOpen = false;
							}}
						>
							<Icon name="bellboy" class="mt-0.5 shrink-0 opacity-60" />
							<span class="flex flex-col gap-1">
								<span class="text-sm opacity-70"><span class="font-bold">{c.from}</span> — {c.title}</span>
								<span class="text-xs opacity-60">{onDay(c.at)} · Open</span>
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		{#if notifications.length === 0 && waiting.length === 0 && captured.length === 0 && heard.length === 0 && unreadMessages.length === 0 && missed.length === 0}
			<div class="p-4 text-center text-sm opacity-60">No notifications</div>
		{:else}
			<ul class="divide-y divide-surface-200-800">
				{#each notifications as notif (notif.id)}
					<li class="p-3 hover:bg-surface-100-900 {notif.read ? 'opacity-60' : ''}">
						<p class="text-sm">{notif.message}</p>
						<p class="text-xs opacity-60">{notif.time.toLocaleTimeString()}</p>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<!--
	A new deploy is live (svelte.config: version.pollInterval). Said once, calmly,
	with one button — nobody should ever have to clear their browser to get it.
-->
<!-- Someone's calling: one line, Answer or not now. -->
{#if calling}
	<div class="fixed top-20 left-1/2 z-50 -translate-x-1/2 card preset-filled-surface-950-50 shadow-xl px-4 py-3 flex items-center gap-4" role="alert">
		<Icon name="phone" class="motion-safe:animate-bounce" />
		<span class="font-bold">{calling.from} is calling</span>
		<button type="button" class="btn btn-sm preset-filled-success-500 min-h-11" onclick={answerCall}>Answer</button>
		<button type="button" class="btn btn-sm preset-tonal min-h-11" onclick={declineCall}>Not now</button>
	</div>
{/if}

{#if updated.current}
	<div class="fixed bottom-20 md:bottom-6 left-1/2 z-50 -translate-x-1/2 card preset-filled-surface-950-50 shadow-xl px-4 py-3 flex items-center gap-4" role="status">
		<span class="text-sm">Q has been updated.</span>
		<button type="button" class="btn btn-sm preset-filled-primary-500 min-h-11" onclick={() => location.reload()}>Reload</button>
	</div>
{/if}

<!-- Section 2: Navigation + Content -->
<div class="grid min-h-0 md:grid-cols-[auto_1fr]">
		<!-- Desktop: sections, then plugins; folds to one icon per group (lib/nav.ts). -->
		<SideNav bind:folded />

		<!-- Main Content -->
		<main class="min-h-0 overflow-y-auto bg-surface-50-950">
			<div class="mx-auto max-w-5xl p-4 md:p-8">
				{#if !identity && known}
					<Resume did={known} />
				{/if}
				{#if !can.keep}
					<!-- Only a browser with nowhere at all to write lands here now. -->
					<div class="card preset-tonal-warning mb-6 p-4" role="status">
						<p class="font-medium">Reading only — this browser has nowhere to save</p>
						<p class="text-sm mt-1">{can.says}</p>
						{#if can.fix}<p class="text-sm mt-1">{can.fix}</p>{/if}
					</div>
				{/if}
				<!-- The "Your identity has nothing said under it yet" banner was removed on
				     1 October 2026 (Darren: "such a distraction"). The questions stay in the
				     menu; offerQuestions is kept should a quieter invitation be wanted. -->
				{@render children()}
			</div>
			<SiteFooter />
		</main>
	</div>

	<!-- Mobile Bottom Bar Navigation -->
	<Navigation layout="bar" class="border-t border-surface-200-800 md:hidden" aria-label="Q">
		<Navigation.Menu class="grid grid-cols-5">
			{#each barLinks as link (link.href)}
				<Navigation.TriggerAnchor
					href={link.href}
					aria-current={isHere(link.href) ? 'page' : undefined}
					class={isHere(link.href) ? 'preset-tonal-primary' : ''}
				>
					<Icon name={link.icon} />
<Navigation.TriggerText>{link.label}</Navigation.TriggerText>
			</Navigation.TriggerAnchor>
		{/each}
	</Navigation.Menu>
</Navigation>
{/if}
