/*
 * A slide's picture, mounted out of sight so a video can copy it frame by
 * frame (ADR-Q-033, export as video). Light mode, as the video is.
 */
import { flushSync, mount, unmount } from 'svelte';
import type { Slide } from '@inqbeta/q-core/storybook';
import ExportPicture from './ExportPicture.svelte';

export function livePicture(slide: Slide) {
	const props = $state({ slide, t: 0 });
	const host = document.createElement('div');
	host.setAttribute('aria-hidden', 'true');
	host.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;height:320px;pointer-events:none;color-scheme:light';
	document.body.append(host);
	const app = mount(ExportPicture, { target: host, props });
	return {
		at(t: number) {
			props.t = Math.min(1, Math.max(0, t));
			flushSync();
		},
		svg: () => host.querySelector('svg') as SVGSVGElement,
		remove() {
			void unmount(app);
			host.remove();
		}
	};
}
