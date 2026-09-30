<script lang="ts">
	/*
	 * "How secure is this?" — the home page, under the uses (29 September).
	 *
	 * Each card says one plain thing in words anyone can follow, then names
	 * the standards underneath it, so someone who knows them recognises them
	 * at a glance. Every line is TRUE OF THE CODE, not aspirational:
	 *
	 *   passkeys        FIDO2 / W3C WebAuthn, PRF extension (q-core/passkey.ts),
	 *                   rpId locked to the registered root domain
	 *   keys            HKDF-SHA-256 from the PRF secret; never stored
	 *   identity        did:key from an Ed25519 key (q-core/did.ts)
	 *   encryption      AES-256-GCM vault (vault.ts); X25519 sealing (seal.ts)
	 *   tamper          SHA-256 content IDs, DAG-CBOR (ucan/cid.ts, cbor.ts)
	 *   permissions     UCAN 1.0 with varsig, against the spec's test vectors
	 *   rules           Cedar (packages/q-actions), open-sourced by AWS
	 *   leaving         Clear-Site-Data (api/leave); Google Drive by OAuth 2.0
	 *                   with PKCE, drive.file scope (google-drive.ts)
	 *
	 * And the honest line: standards Q is built on, not a certificate; no
	 * independent audit yet. Change a card only when the code changes.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import type { IconName } from '@inqbeta/q-ui/icons';
	import { t, type Key } from '$lib/i18n/index.svelte';
	import QText from './QText.svelte';

	/* The standards' own names are not translated: they are what people look for. */
	const CARDS: { key: string; icon: IconName; standards: string[] }[] = [
		{ key: 'phish', icon: 'fingerprint', standards: ['FIDO2', 'W3C WebAuthn', 'ICANN domain'] },
		{ key: 'nothing', icon: 'eye-off', standards: ['WebAuthn PRF', 'HKDF-SHA-256 · RFC 5869'] },
		{ key: 'did', icon: 'keys', standards: ['W3C DID', 'did:key', 'Ed25519 · RFC 8032'] },
		{ key: 'lock', icon: 'lock', standards: ['AES-256-GCM', 'NIST SP 800-38D', 'ISO/IEC 19772', 'X25519 · RFC 7748'] },
		{ key: 'tamper', icon: 'verified', standards: ['SHA-256', 'CID', 'DAG-CBOR'] },
		{ key: 'ucan', icon: 'shield-check', standards: ['UCAN 1.0', 'Varsig'] },
		{ key: 'cedar', icon: 'balance', standards: ['Cedar', 'AWS', 'Formal verification', 'WebAssembly'] },
		{ key: 'leave', icon: 'eye-off', standards: ['W3C Clear-Site-Data', 'OAuth 2.0 + PKCE · RFC 7636', 'drive.file'] }
	];
	const k = (key: string, part: 't' | 'd') => `sec.${key}.${part}` as Key;
</script>

<section class="w-full max-w-5xl space-y-6" aria-labelledby="sec-title">
	<header class="max-w-2xl mx-auto text-center space-y-3">
		<Icon name="lock" class="size-12 mx-auto text-primary-600-400" stroke={2} />
		<h2 id="sec-title" class="h3" data-read="sec.title">{t('sec.title')}</h2>
		<p class="text-lg text-surface-700-300 text-balance" data-read="sec.lead"><QText text={t('sec.lead')} /></p>
	</header>

	<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each CARDS as c (c.key)}
			<li class="card preset-tonal p-5 flex flex-col gap-2">
				<Icon name={c.icon} class="size-8 text-primary-600-400" stroke={2} />
				<h3 class="h5" data-read={k(c.key, 't')}>{t(k(c.key, 't'))}</h3>
				<p class="text-sm text-surface-700-300 flex-1" data-read={k(c.key, 'd')}><QText text={t(k(c.key, 'd'))} /></p>
				<ul class="flex flex-wrap gap-1.5 pt-2" aria-label="Standards">
					{#each c.standards as s (s)}
						<li class="badge preset-outlined-surface-500 text-xs">{s}</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ul>

	<p class="max-w-2xl mx-auto text-center text-sm text-surface-700-300" data-read="sec.honest"><QText text={t('sec.honest')} /></p>
</section>
