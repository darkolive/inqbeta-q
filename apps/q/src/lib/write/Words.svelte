<script lang="ts">
	/*
	 * A paragraph you write straight into. Formatted as you see it; kept as
	 * the three marks a block allows (inline-dom.ts).
	 *
	 * Enter starts a new paragraph (Shift+Enter is a line break). Backspace in
	 * an empty one removes it. Paste is words only, never formatting, so
	 * nothing from another page comes along with them.
	 */
	import { inlineHtml, safeHref } from '@inqbeta/q-core/inline';
	import { toInline } from './inline-dom';

	let {
		value = '',
		onchange,
		onenter,
		onempty,
		placeholder = 'Write here…',
		big = false,
		marks = true,
		focus = false
	}: {
		value?: string;
		onchange: (v: string) => void;
		onenter?: () => void;
		onempty?: () => void;
		placeholder?: string;
		big?: boolean;
		marks?: boolean;
		focus?: boolean;
	} = $props();

	let el = $state<HTMLDivElement | null>(null);
	let active = $state(false);
	let linking = $state(false);
	let href = $state('https://');
	let saved: Range | null = null;
	/* What is in the element now, as words — so an outside change can be told
	 * from an echo of our own typing. */
	let shown = '';

	$effect(() => {
		const v = value;
		if (el && v !== shown) {
			el.innerHTML = marks ? inlineHtml(v) : v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
			shown = v;
		}
	});
	$effect(() => {
		if (focus && el) {
			el.focus();
			const r = document.createRange();
			r.selectNodeContents(el);
			r.collapse(false);
			const s = getSelection();
			s?.removeAllRanges();
			s?.addRange(r);
		}
	});

	function input() {
		if (!el) return;
		shown = marks ? toInline(el) : (el.textContent ?? '');
		onchange(shown);
	}

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			onenter?.();
		} else if (e.key === 'Enter' && e.shiftKey && !marks) {
			e.preventDefault();
		} else if (e.key === 'Backspace' && el && !(el.textContent ?? '').length) {
			e.preventDefault();
			onempty?.();
		} else if (marks && (e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'i')) {
			e.preventDefault();
			format(e.key === 'b' ? 'bold' : 'italic');
		}
	}

	function paste(e: ClipboardEvent) {
		e.preventDefault();
		const text = e.clipboardData?.getData('text/plain') ?? '';
		document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' '));
	}

	function format(cmd: 'bold' | 'italic') {
		el?.focus();
		document.execCommand(cmd);
		input();
	}

	function startLink() {
		const s = getSelection();
		saved = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
		href = 'https://';
		linking = true;
	}

	function applyLink() {
		linking = false;
		if (!saved || !el) return;
		el.focus();
		const s = getSelection();
		s?.removeAllRanges();
		s?.addRange(saved);
		if (safeHref(href) && href !== 'https://') document.execCommand('createLink', false, href.trim());
		else document.execCommand('unlink');
		input();
	}
</script>

<div class="relative">
	{#if marks && active}
		<div class="absolute -top-9 right-0 z-10 flex items-center gap-1 rounded-base border border-surface-200-800 bg-surface-50-950 p-1 shadow-sm">
			<button type="button" class="btn btn-sm px-2 font-bold" title="Bold (⌘B)" onmousedown={(e) => { e.preventDefault(); format('bold'); }}>B</button>
			<button type="button" class="btn btn-sm px-2 italic" title="Italic (⌘I)" onmousedown={(e) => { e.preventDefault(); format('italic'); }}>I</button>
			<button type="button" class="btn btn-sm px-2 underline" title="Link the selected words" onmousedown={(e) => { e.preventDefault(); startLink(); }}>Link</button>
			{#if linking}
				<input class="input input-sm w-56" bind:value={href} onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), applyLink())} />
				<button type="button" class="btn btn-sm preset-filled-primary-500" onmousedown={(e) => { e.preventDefault(); applyLink(); }}>Set</button>
			{/if}
		</div>
	{/if}
	<div
		bind:this={el}
		class="words min-h-[1.6em] rounded-base px-2 py-1 outline-none focus:bg-surface-100-900 {big ? 'text-xl font-semibold' : 'leading-relaxed'}"
		contenteditable="true"
		role="textbox"
		tabindex="0"
		aria-multiline={marks}
		data-placeholder={placeholder}
		oninput={input}
		onkeydown={keydown}
		onpaste={paste}
		onfocus={() => (active = true)}
		onblur={() => setTimeout(() => (active = linking), 150)}
	></div>
</div>

<style>
	.words:empty::before {
		content: attr(data-placeholder);
		opacity: 0.45;
	}
	.words :global(a) {
		text-decoration: underline;
	}
</style>
