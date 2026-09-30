/*
 * How the front door SOUNDS — English.
 *
 * The words on screen live in lib/i18n. These are the same words as a
 * performance: what to stress, where to breathe, how each line should feel.
 * The directions in [square brackets] are ElevenLabs audio tags. They are
 * performed, never spoken, and never shown.
 *
 * THE EXPRESSION LANGUAGE — one small vocabulary, used the same way on every
 * page, so Q always sounds like the same person:
 *
 *   [calm] [confident]     statements of principle — the rhythm lines
 *   [warmly]               the line that lands; "your rules"
 *   [reassuring]           a promise about safety or privacy
 *   [matter-of-fact]       lists, facts, no selling
 *   [explaining]           how to do something; the hints
 *   [brightly] [curious]   naming a thing you can pick; labels
 *   [inviting]             a question that opens what follows
 *   [sincere] [quietly]    something that matters; said plainly
 *   [short pause] [pause]  the beat between rhythm lines
 *
 * Tags go in English in every language — they direct the voice, and the voice
 * reads them the same way whatever language the words are in.
 *
 * A key with no script here is read by the browser's own voice from the
 * on-screen words. A key with a script is recorded by `npm run voice`.
 */
import type { Key } from '../../i18n/en';

export default {
	'signin.title': '[calm] [confident] Your data. [short pause] Your device. [short pause] [warmly] Your rules.',
	'signin.line': '[reassuring] Everything stays in your own folder. [matter-of-fact] No accounts. No cloud. No tracking.',
	'signin.where': '[inviting] So — where is your passkey?',

	'place.device': '[brightly] This device.',
	'place.key': '[curious] A key.',
	'place.phone': '[brightly] Or your phone.',
	'place.thisPhone': '[brightly] This phone.',

	'place.device.hint': '[explaining] That’s Touch ID, Face ID, or Windows Hello.',
	'place.key.hint': '[explaining] A YubiKey — just plug it in, or tap it.',
	'place.phone.hint': '[explaining] Scan a QR code with your phone.',
	'place.thisPhone.hint': '[explaining] Face ID, or Touch ID.',

	'home.nothingStored':
		'[sincere] [quietly] Nothing is stored by us. [pause] Not your keys. Not your D I D. [explaining] They’re rebuilt from your passkey, every time. [matter-of-fact] Ways to reach you come later, in Settings.',
	'home.whatQIs': '[curious] [inviting] So… what is Q?',

	/* The home page below the fold (29 September): intro, story, uses, beta. */
	'home.intro.lead': '[confident] [warmly] Q keeps the proof of what happened.',
	'home.intro.body': '[explaining] Whenever something happens between people — a lesson, a job, a payment, joining a club — Q writes a receipt. Both sides sign it. Both sides keep it. Nobody in the middle holds your data, and nobody can quietly change the record.',
	'story.1.t': '[inviting] Two people. Two computers.',
	'story.1.d': '[explaining] Ana and Ben each have Q, and their own folder. There is nothing in the middle.',
	'story.2.t': '[brightly] Something happens.',
	'story.2.d': '[explaining] Ana teaches Ben a lesson — or does a job, or pays him back.',
	'story.3.t': '[confident] Q writes a receipt.',
	'story.3.d': '[explaining] What happened, and when — signed with Ana’s passkey.',
	'story.4.t': '[warmly] Ben agrees.',
	'story.4.d': '[explaining] He checks it and signs too. Now it is both of theirs.',
	'story.5.t': '[reassuring] Each keeps a copy.',
	'story.5.d': '[reassuring] The same receipt, in Ana’s folder and in Ben’s. No server holds it.',
	'story.6.t': '[confident] Proof that holds.',
	'story.6.d': '[sincere] Years later, either can show it. Change one word and the signatures no longer match.',
	'uses.title': '[inviting] What people use it for',
	'uses.learning.t': '[brightly] Proof of learning',
	'uses.learning.d': '[matter-of-fact] Courses and study, recorded as you go — yours to show, not locked in someone else’s system.',
	'uses.clubs.t': '[brightly] Clubs and federations',
	'uses.clubs.d': '[matter-of-fact] Joining, consent and membership, run fairly — from a camping club to a co-op.',
	'uses.site.t': '[brightly] Your own website',
	'uses.site.d': '[matter-of-fact] Write and publish pages from Q. Every release is a signed receipt.',
	'uses.work.t': '[brightly] Work and payments',
	'uses.work.d': '[matter-of-fact] Jobs done, agreements made, money moved — evidence both sides hold.',
	'uses.festival.t': '[brightly] Community festivals',
	'uses.festival.d': '[matter-of-fact] Volunteers, stallholders and tickets, with a clear record for everyone involved.',
	'uses.calls.t': '[brightly] Calls and messages',
	'uses.calls.d': '[matter-of-fact] Talk person to person. A receipt keeps the facts — who, when, how long — never what was said.',
	'beta.touch': '[inviting] Stay in touch',
	'beta.why': '[reassuring] [quietly] Only used to tell you about Q. It goes to Darren at Dark Olive, nowhere else.',

	/* The home page below the fold (29 September). */
	'sec.title': '[curious] [sincere] How secure is this?',
	'sec.lead': '[confident] Q is built on open, published standards — the ones the security world checks its own work against. In plain words:',
	'sec.honest': '[sincere] [quietly] These are the standards Q is built on, not a certificate. Q is in beta and has not had an independent security audit yet.',
	'sec.phish.t': '[confident] No password to steal.',
	'sec.phish.d': '[explaining] Your passkey never leaves your device, and it only works on this site — a lookalike site gets nothing.',
	'sec.nothing.t': '[confident] Nothing stored by us.',
	'sec.nothing.d': '[explaining] Your keys are rebuilt on your device from your passkey, every time. There is no copy of them anywhere else.',
	'sec.did.t': '[confident] Your identity is yours.',
	'sec.did.d': '[explaining] A decentralised identifier made from your own key — not an account on our server.',
	'sec.lock.t': '[confident] Locked before it leaves.',
	'sec.lock.d': '[explaining] Every file is encrypted on your device before it is synced or backed up.',
	'sec.tamper.t': '[confident] Any change shows.',
	'sec.tamper.d': '[explaining] Every receipt is named by its own fingerprint. Change a single byte and the name no longer matches.',
	'sec.ucan.t': '[confident] Permissions anyone can check.',
	'sec.ucan.d': '[explaining] Who may do what is a signed token, checked against the specification’s own test vectors.',
	'sec.cedar.t': '[confident] Rules decided by a proven engine.',
	'sec.cedar.d': '[explaining] Q’s rules run in Cedar, the policy language built and open-sourced by Amazon Web Services, with a formally verified core.',
	'sec.leave.t': '[confident] Leave no trace.',
	'sec.leave.d': '[explaining] One button clears everything Q kept in the browser. Cloud copies can only touch the folder Q made.',

	/* The home page below the fold (29 September). */
	'love.title': '[warmly] Built with love',
	'love.line': '[sincere] [warmly] Free to give — never free to take.',
	'thanks.title': '[warmly] With thanks to',
	'thanks.ai': '[warmly] And to the engineering teams behind',
	'thanks.community': '[warmly] [sincere] And the wider community — the languages, the standards, and everyone who gives their work away.',

	/* The home page below the fold (29 September). */
	'love.source': '[confident] [warmly] Q is open source, under the GNU Affero licence. Dark Olive C-I-C holds the copyright; you are free to inspect it, run it and change it here.',

	/* The home page below the fold (29 September). */
	'thanks.referral': '[matter-of-fact] Some of these links are referral links — if you sign up through them, it helps fund Q.'
} satisfies Partial<Record<Key, string>>;
