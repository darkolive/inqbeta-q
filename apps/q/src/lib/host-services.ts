/*
 * Which services this copy has keys for (ADR-Q-018 §4), said without ever
 * saying a key. Pure: given the settings, it answers; the route hands it the
 * settings from .env.
 *
 * A secret is reported as set or not, with its last four characters, so the
 * founder can tell which key it is. Nothing else of it leaves the server, and
 * only on a development copy (routes/api/host/services). Pure, so the page
 * can share its types.
 */
export interface ServiceSetting {
	name: string;
	/** When the founder last set it here, from its signed record (ISO). */
	setAt?: string;
	/** Changed in .env but not yet picked up: restart `pnpm dev`. */
	restart?: boolean;
	/** Whether it is a secret (last four only) or plain (shown whole: an address). */
	secret: boolean;
	set: boolean;
	/** Last four of a secret, or the whole of a plain value. */
	shows?: string;
}
export interface ServiceState {
	id: string;
	called: string;
	what: string;
	/** Who provides it, in a word. */
	from: string;
	settings: ServiceSetting[];
	/** 'on' when every setting is set; 'part' when some are; 'off' when none. */
	is: 'on' | 'part' | 'off';
}

export const HOST_SERVICES: { id: string; called: string; what: string; from: string; settings: { name: string; secret: boolean }[] }[] = [
	{ id: 'email', called: 'Email', what: 'Sign-in codes and messages.', from: 'Resend', settings: [{ name: 'RESEND_API_KEY', secret: true }, { name: 'Q_MAIL_FROM', secret: false }] },
	{ id: 'voice', called: 'Voice', what: 'Reading aloud.', from: 'ElevenLabs', settings: [{ name: 'ELEVENLABS_API_KEY', secret: true }, { name: 'ELEVENLABS_VOICE_ID', secret: false }] },
	{ id: 'ai', called: 'AI', what: 'Help writing and checking.', from: 'Vercel AI Gateway', settings: [{ name: 'AI_GATEWAY_API_KEY', secret: true }] },
	{ id: 'calls', called: 'Calls', what: 'A relay for calls when two devices can’t reach each other.', from: 'Cloudflare', settings: [{ name: 'CF_TURN_KEY_ID', secret: false }, { name: 'CF_TURN_KEY_TOKEN', secret: true }] },
	{
		id: 'backups',
		called: 'Backups',
		what: 'Google Drive, Dropbox and OneDrive as places to keep a vault.',
		from: 'Google, Dropbox, Microsoft',
		settings: [
			{ name: 'GOOGLE_CLIENT_ID', secret: false },
			{ name: 'GOOGLE_CLIENT_SECRET', secret: true },
			{ name: 'DROPBOX_APP_KEY', secret: false },
			{ name: 'DROPBOX_APP_SECRET', secret: true },
			{ name: 'MICROSOFT_CLIENT_ID', secret: false },
			{ name: 'MICROSOFT_CLIENT_SECRET', secret: true }
		]
	},
	{ id: 'own', called: 'Q’s own', what: 'Sending sign-in codes to people who aren’t signed in yet.', from: 'Made on this computer', settings: [{ name: 'Q_SERVICE_SEED', secret: true }, { name: 'Q_OTP_SECRET', secret: true }] }
];

/** What a setting may show: the last four of a long secret, nothing of a short one, all of a plain value. */
export function endsOf(value: string, secret: boolean): string {
	const v = value.trim();
	return secret ? (v.length > 8 ? v.slice(-4) : '') : v;
}

export const SETTABLE = new Set(HOST_SERVICES.flatMap((s) => s.settings.map((x) => x.name)));
export const isSecret = (name: string) => HOST_SERVICES.some((s) => s.settings.some((x) => x.name === name && x.secret));

/** Settings Q makes for you: random, so nobody has to invent one. */
export const MADE_FOR_YOU = new Set(['Q_SERVICE_SEED', 'Q_OTP_SECRET']);

/*
 * A service record (ADR-Q-018 §4): "Email: Resend · ending 4f2a · set 2 Oct by
 * the founder". Signed by the founder, it holds no secret, and it is public:
 * it's how the live site knows which services are on.
 */
export const HOST_SERVICE_SCHEMA = 'inqbeta.host-service/1';
export interface HostServiceRecord {
	schema: typeof HOST_SERVICE_SCHEMA;
	source: 'inqbeta:q/host';
	/** The host's federation DID. */
	host: string;
	service: string;
	setting: string;
	/** endsOf(value): never more of a secret than its last four. */
	ends: string;
	at: string;
}

export function servicesFrom(
	env: Record<string, string | undefined>,
	o: { running?: Record<string, string | undefined>; setAt?: Record<string, string> } = {}
): ServiceState[] {
	return HOST_SERVICES.map((s) => {
		const settings = s.settings.map((x): ServiceSetting => {
			const v = (env[x.name] ?? '').trim();
			const extra = {
				...(o.setAt?.[x.name] ? { setAt: o.setAt[x.name] } : {}),
				...(o.running && (o.running[x.name] ?? '').trim() !== v ? { restart: true } : {})
			};
			if (!v) return { name: x.name, secret: x.secret, set: false, ...extra };
			return { name: x.name, secret: x.secret, set: true, shows: endsOf(v, x.secret), ...extra };
		});
		const n = settings.filter((x) => x.set).length;
		return { id: s.id, called: s.called, what: s.what, from: s.from, settings, is: n === settings.length ? 'on' : n ? 'part' : 'off' };
	});
}
