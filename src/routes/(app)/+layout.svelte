<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button/index.js';
	import { toggleMode } from 'mode-watcher';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Settings from '@lucide/svelte/icons/settings';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import LogOut from '@lucide/svelte/icons/log-out';

	let { children } = $props();

	const navItems = [
		{ href: '/', label: 'Übersicht', icon: LayoutDashboard },
		{ href: '/jobs', label: 'Stellen', icon: Briefcase },
		{ href: '/leads', label: 'Betriebe', icon: MapPin },
		{ href: '/settings', label: 'Einstellungen', icon: Settings }
	];

	function isActive(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}

	async function logout() {
		await authClient.signOut();
		await goto('/login');
	}
</script>

<div class="flex min-h-svh flex-col">
	<header class="border-b">
		<div class="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
			<a href={resolve('/')} class="flex items-center gap-2 font-semibold">
				<Briefcase class="size-5" />
				Jobstrian
			</a>
			<nav class="flex items-center gap-1">
				{#each navItems as item (item.href)}
					<Button href={item.href} variant={isActive(item.href) ? 'secondary' : 'ghost'} size="sm">
						<item.icon class="size-4" />
						<span class="hidden sm:inline">{item.label}</span>
					</Button>
				{/each}
			</nav>
			<div class="ml-auto flex items-center gap-1">
				<Button variant="ghost" size="icon" onclick={toggleMode} aria-label="Theme wechseln">
					<Sun class="size-4 dark:hidden" />
					<Moon class="hidden size-4 dark:block" />
				</Button>
				<Button variant="ghost" size="icon" onclick={logout} aria-label="Abmelden">
					<LogOut class="size-4" />
				</Button>
			</div>
		</div>
	</header>
	<main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
		{@render children()}
	</main>
</div>
