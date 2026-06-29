<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
	const resolvePath = resolve as unknown as (path: string) => string;
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<ModeWatcher />
<Toaster richColors />
{@render children()}

<div style="display:none">
	{#each locales as locale (locale)}
		<a href={resolvePath(localizeHref(page.url.pathname, { locale }))}>{locale}</a>
	{/each}
</div>
