<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
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
	const sessionTouchInterval = 5 * 60 * 1000;
	let lastSessionTouch = 0;

	const navItems = [
		{ href: '/', label: 'Übersicht', icon: LayoutDashboard },
		{ href: '/jobs', label: 'Stellen', icon: Briefcase },
		{ href: '/leads', label: 'Betriebe', icon: MapPin },
		{ href: '/settings', label: 'Einstellungen', icon: Settings }
	];

	function isActive(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}

	function touchSession(event: Event) {
		if (!event.isTrusted) return;
		const now = Date.now();
		if (now - lastSessionTouch < sessionTouchInterval) return;
		lastSessionTouch = now;

		void fetch(resolve('/auth/session/touch'), {
			method: 'POST',
			headers: { 'x-jobstrian-user-interaction': '1' },
			credentials: 'same-origin',
			keepalive: true
		}).catch(() => undefined);
	}
</script>

<svelte:window onpointerdown={touchSession} onkeydown={touchSession} onclick={touchSession} />

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
					class="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
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
				<form method="POST" action={resolve('/logout')}>
					<Button type="submit" variant="ghost" size="icon" aria-label="Abmelden">
						<LogOut class="size-4" />
					</Button>
				</form>
			</div>
		</div>
	</header>
	<main class="mx-auto w-full max-w-[90rem] flex-1 px-4 py-8">
		{@render children()}
	</main>
</div>
