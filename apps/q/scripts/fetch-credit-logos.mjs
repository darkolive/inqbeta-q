/*
 * Fetch the credit logos — monotone SVGs, drawn in the theme's own colour.
 *
 *   npm run credit-logos
 *
 * From Simple Icons (simpleicons.org): one-colour brand SVGs, published CC0
 * for exactly this kind of use — crediting a project by its mark. The marks
 * themselves stay their owners' trademarks; Q uses them only to say thank you,
 * and links each to its project.
 *
 * Each file is saved to src/lib/credits/<id>.svg with its fill set to
 * currentColor, so it takes the text colour — olive, orange, light or dark —
 * rather than a fixed black. Credits.svelte picks up whatever is there; a
 * project with no file keeps its name alone.
 *
 * Not every project is in Simple Icons. The ones that are not are listed at
 * the end: take their mark from the project's own press or brand page, save
 * it as src/lib/credits/<id>.svg, and run this again to tidy it.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'src/lib/credits';
const CDN = (slug) => `https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${slug}.svg`;

/* id (as in Credits.svelte) → Simple Icons slugs to try, in order. */
const WANTED = {
	svelte: ['svelte'],
	skeleton: ['skeleton'],
	tailwind: ['tailwindcss'],
	dgraph: ['dgraph'],
	vercel: ['vercel'],
	typescript: ['typescript'],
	docker: ['docker'],
	/* Simple Icons' "Nebula" is the streaming service, not Slack's mesh network. */
	nebula: [],
	mosquitto: ['eclipsemosquitto'],
	spin: ['spin', 'fermyon'],
	seaweedfs: ['seaweedfs'],
	cedar: ['cedar'],
	claude: ['claude', 'anthropic'],
	chatgpt: ['openai'],
	minimax: ['minimax']
};

/* One colour, the theme's: fill = currentColor; no title (the name is beside it). */
function tidy(svg) {
	return svg
		.replace(/<title>[\s\S]*?<\/title>/g, '')
		.replace(/\sfill="[^"]*"/g, '')
		.replace(/\s(width|height)="[^"]*"/g, '')
		/* Idempotent: running again must not add the same attributes twice. */
		.replace(/\s(aria-hidden|focusable|role|class)="[^"]*"/g, '')
		.replace(/<svg\b/, '<svg fill="currentColor" aria-hidden="true" focusable="false"');
}

mkdirSync(OUT, { recursive: true });
const missing = [];
let unreachable = false;
for (const [id, slugs] of Object.entries(WANTED)) {
	let got = null;
	for (const slug of slugs) {
		try {
			const res = await fetch(CDN(slug));
			if (res.ok) {
				got = { slug, svg: await res.text() };
				break;
			}
		} catch {
			unreachable = true;
		}
	}
	if (got) {
		writeFileSync(`${OUT}/${id}.svg`, tidy(got.svg));
		console.log(`  ✓ ${id.padEnd(11)} simple-icons/${got.slug}`);
	} else missing.push(id);
}

/* Anything already saved by hand gets the same tidying. */
for (const f of readdirSync(OUT).filter((f) => f.endsWith('.svg'))) {
	const p = `${OUT}/${f}`;
	writeFileSync(p, tidy(readFileSync(p, 'utf8')));
}

if (unreachable && missing.length === Object.keys(WANTED).length) {
	console.log('\n  Could not reach Simple Icons (cdn.jsdelivr.net) — check the connection and run again.\n');
	process.exit(1);
}
if (missing.length) {
	console.log(`\n  Not in Simple Icons: ${missing.join(', ')}`);
	console.log(`  Save each project's own mark as ${OUT}/<id>.svg and run this again.\n`);
}
