<script lang="ts">
	import { icon, type IconDefinition, type SizeProp } from '@fortawesome/fontawesome-svg-core';

	// Import specific icons we need to keep bundle small
	import { faTerminal } from '@fortawesome/free-solid-svg-icons';
	/* GitHub's own mark, from Font Awesome's brand set — not redrawn. */
	import { faGithub } from '@fortawesome/free-brands-svg-icons';

	// Map of available animated icons
	const animatedIcons: Record<string, IconDefinition> = {
		terminal: faTerminal,
		github: faGithub
	};

	let { 
		name, 
		size = '1x', 
		animation = undefined,
		speed = undefined,
		class: klass = '' 
	}: { 
		name: keyof typeof animatedIcons; 
		size?: SizeProp;
		animation?: 'beat' | 'fade' | 'spin' | 'pulse' | 'beat-fade' | 'bounce' | 'shake' | 'flip';
		speed?: 'slow' | 'slower' | 'fast' | 'faster';
		class?: string;
	} = $props();

	/*
	 * Font Awesome sets size with a class, not a parameter. The animation
	 * classes go on the wrapper below, where the duration override can reach
	 * the svg.
	 */
	const faIcon = $derived(icon(animatedIcons[name], { classes: [`fa-${size}`] }));

	const animationStyle = $derived(speed ? `animation-duration: ${speed === 'slower' ? '3s' : speed === 'slow' ? '2s' : speed === 'faster' ? '0.5s' : speed === 'fast' ? '0.75s' : '1s'};` : '');
</script>

<!-- Render FA icon with optional animation -->
{#if faIcon}
	<span 
		class="fa-icon {klass}" 
		class:fa-beat={animation === 'beat'} 
		class:fa-fade={animation === 'fade'} 
		class:fa-spin={animation === 'spin'} 
		class:fa-pulse={animation === 'pulse'} 
		class:fa-beat-fade={animation === 'beat-fade'} 
		class:fa-bounce={animation === 'bounce'} 
		class:fa-shake={animation === 'shake'} 
		class:fa-flip={animation === 'flip'}
		style={animationStyle}
	>
		{@html faIcon.html[0]}
	</span>
{/if}

<style>
	.fa-icon {
		display: inline-block;
	}
	.fa-icon[style*="animation-duration"] :global(svg) {
		animation-duration: inherit;
	}
</style>
