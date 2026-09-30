/*
 * Where each core component's code is — ADR-Q-006.
 *
 * q-core/components.ts holds the MANIFESTS (what each may touch, what it
 * promises, its design brief). This holds the CODE, keyed by the same id, so
 * a block naming `q:sign-in@1.0.0` finds its manifest there and its code here.
 * A manifest without an entry here, or an entry without a manifest, is a bug.
 */
import type { Component } from 'svelte';
import SignInBlock from '$lib/components/SignInBlock.svelte';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CODE: Record<string, Component<any>> = {
	'q:sign-in': SignInBlock
};
