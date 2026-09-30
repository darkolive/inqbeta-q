<script lang="ts" module>
	import type { FolderItem } from '@inqbeta/q-core/folder';

	export interface FileNode {
		id: string;
		name: string;
		children?: FileNode[];
		item?: FolderItem;
	}

	/**
	 * The folder as a tree of real names — what the files are, not the hashes
	 * they are stored under. Folders first, then files, each alphabetically.
	 */
	export function buildTree(items: FolderItem[]): FileNode {
		const root: FileNode = { id: '/', name: '', children: [] };
		const dirs = new Map<string, FileNode>([['', root]]);
		const dirFor = (path: string): FileNode => {
			const clean = path.split('/').filter(Boolean).join('/');
			const found = dirs.get(clean);
			if (found) return found;
			const parts = clean.split('/');
			const name = parts.pop()!;
			const parent = dirFor(parts.join('/'));
			const node: FileNode = { id: `dir:${clean}`, name, children: [] };
			parent.children!.push(node);
			dirs.set(clean, node);
			return node;
		};
		for (const item of items) {
			if (item.meta) dirFor(item.meta.path).children!.push({ id: `file:${item.diskPath}`, name: item.meta.name, item });
			else dirFor('Would not open').children!.push({ id: `file:${item.diskPath}`, name: item.diskPath.split('/').pop()!, item });
		}
		const sort = (n: FileNode) => {
			n.children?.sort((a, b) => (a.children ? 0 : 1) - (b.children ? 0 : 1) || a.name.localeCompare(b.name));
			n.children?.forEach(sort);
		};
		sort(root);
		return root;
	}
</script>

<script lang="ts">
	/*
	 * Files as a directory tree — Skeleton's TreeView.
	 *
	 * Darren, 2026-09-17: "you're looking at a directory tree of files."
	 * Arrow keys move, Enter or a click opens, Right/Left open and close a
	 * folder (the tree's own keyboard handling). Each row says, for a screen
	 * reader, whether the file is locked.
	 */
	import { TreeView, createTreeViewCollection } from '@skeletonlabs/skeleton-svelte';
	import { Icon } from '@inqbeta/q-ui';

	let {
		items,
		selected = null,
		onselect
	}: { items: FolderItem[]; selected?: string | null; onselect: (item: FolderItem) => void } = $props();

	const root = $derived(buildTree(items));
	const collection = $derived(
		createTreeViewCollection<FileNode>({
			nodeToValue: (n) => n.id,
			nodeToString: (n) => n.name,
			rootNode: root
		})
	);
	/* Every folder open to start with: a folder of a few dozen files reads best whole. */
	const allDirs = $derived.by(() => {
		const out: string[] = [];
		const walk = (n: FileNode) => n.children?.forEach((c) => (c.children ? (out.push(c.id), walk(c)) : null));
		walk(root);
		return out;
	});

	const countIn = (n: FileNode): number => (n.children ? n.children.reduce((s, c) => s + countIn(c), 0) : 1);
	const label = (n: FileNode) =>
		n.item?.intact === false ? 'damaged' : !n.item?.locked ? 'not locked' : n.item.meta ? 'locked' : 'will not open';
</script>

<TreeView
	{collection}
	defaultExpandedValue={allDirs}
	selectedValue={selected ? [`file:${selected}`] : []}
	onSelectionChange={(d) => {
		const node = d.selectedNodes[0];
		if (node?.item) onselect(node.item);
	}}
>
	<TreeView.Label class="sr-only">Files in your folder</TreeView.Label>
	<TreeView.Tree>
		{#each collection.rootNode.children ?? [] as node, index (node.id)}
			{@render treeNode(node, [index])}
		{/each}
	</TreeView.Tree>
</TreeView>

{#snippet treeNode(node: FileNode, indexPath: number[])}
	<TreeView.NodeProvider value={{ node, indexPath }}>
		{#if node.children}
			<TreeView.Branch>
				<TreeView.BranchControl>
					<TreeView.BranchIndicator><Icon name="expand" size={16} /></TreeView.BranchIndicator>
					<TreeView.BranchText>
						<Icon name="files" size={18} />
						<span class="role-label" data-role="label">{node.name}</span>
						<span class="role-count ml-auto" data-role="count">{countIn(node)}</span>
					</TreeView.BranchText>
				</TreeView.BranchControl>
				<TreeView.BranchContent>
					<TreeView.BranchIndentGuide />
					{#each node.children as child, i (child.id)}
						{@render treeNode(child, [...indexPath, i])}
					{/each}
				</TreeView.BranchContent>
			</TreeView.Branch>
		{:else}
			<TreeView.Item>
				<Icon name={node.item?.locked ? 'lock' : 'file'} size={16} class={node.item?.locked && node.item.intact !== false ? '' : 'text-warning-600-400'} />
				<span class="truncate">{node.name}</span>
				<span class="sr-only">, {label(node)}</span>
			</TreeView.Item>
		{/if}
	</TreeView.NodeProvider>
{/snippet}
