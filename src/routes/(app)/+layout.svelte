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
		await goto(resolve('/login'));
	}
</script>

<div class="flex min-h-svh flex-col">
	<header
		class="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60"
	>
		<div class="mx-auto flex h-14 w-full max-w-[90rem] items-center gap-4 px-4 sm:gap-6">
			<a
				href={resolve('/')}
				class="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight"
			>
				<span
					class="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"
				>
					<Briefcase class="size-4.5" />
				</span>
				<span class="hidden md:inline">Jobstrian</span>
			</a>
			<nav class="flex items-center gap-1" aria-label="Hauptnavigation">
				{#each navItems as item (item.href)}
					<Button
						href={item.href}
						variant="ghost"
						size="sm"
						class={isActive(item.href)
							? 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary dark:bg-primary/15 dark:hover:bg-primary/20'
							: 'text-muted-foreground hover:text-foreground'}
						aria-current={isActive(item.href) ? 'page' : undefined}
					>
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
	<main class="mx-auto w-full max-w-[90rem] flex-1 px-4 py-8">
		{@render children()}
	</main>
</div>
