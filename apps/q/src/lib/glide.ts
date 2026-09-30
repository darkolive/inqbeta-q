/*
 * A slow, eased scroll to a place on the page.
 *
 * The browser's own smooth scroll has no speed setting, so this eases it by
 * hand over `ms`. Anyone who has asked for less motion jumps straight there.
 * Whichever box is doing the scrolling is found and moved — the window when
 * signed out, the app shell's <main> when a DID is remembered.
 */
export const GLIDE_MS = 1200;

/** Glide to `to` (an element, or the top of the page). Returns false if it did not, so a link can fall back to its own jump. */
export function glide(to: HTMLElement | 'top', ms = GLIDE_MS): boolean {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
		if (to === 'top') window.scrollTo({ top: 0 });
		return to === 'top';
	}
	const from0 = to === 'top' ? document.body : to;
	let box: HTMLElement | null = from0.parentElement;
	while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement;
	const scroller = box ?? (document.scrollingElement as HTMLElement);
	const from = scroller.scrollTop;
	const by = to === 'top' ? -from : to.getBoundingClientRect().top - (box ? box.getBoundingClientRect().top : 0);
	const start = performance.now();
	const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
	const step = (now: number) => {
		const t = Math.min(1, (now - start) / ms);
		scroller.scrollTo({ top: from + by * ease(t), behavior: 'instant' });
		if (t < 1) requestAnimationFrame(step);
		else if (to !== 'top') to.focus({ preventScroll: true });
	};
	requestAnimationFrame(step);
	return true;
}

/** For a link to `#id`: glide there instead of jumping, when motion is welcome. */
export function glideLink(e: MouseEvent) {
	const id = (e.currentTarget as HTMLAnchorElement).hash.slice(1);
	const to = id ? document.getElementById(id) : null;
	if (to && glide(to)) e.preventDefault();
}
