<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import PersonAvatar from '#lib/components/person-avatar.svelte';
	import { authClient } from '#lib/auth-client.js';
	import { resolveHref } from '#lib/paths.js';
	import { toggleMode } from 'mode-watcher';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Settings from '@lucide/svelte/icons/settings';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import Users from '@lucide/svelte/icons/users';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Check from '@lucide/svelte/icons/check';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import LogOut from '@lucide/svelte/icons/log-out';

	type NavItem = { href: string; label: string; icon: typeof Briefcase; exact?: boolean };

	let { children, data } = $props();
	const sessionTouchInterval = 5 * 60 * 1000;
	let lastSessionTouch = 0;

	const slug = $derived(page.params.person);
	const currentPerson = $derived(slug ? data.people.find((p) => p.slug === slug) : undefined);
	// First path segment after the person ("/jobs"), so switching keeps the section.
	const section = $derived(/\/p\/[^/]+(\/[^/]+)?/.exec(page.url.pathname)?.[1] ?? '');

	const navItems: NavItem[] = $derived(
		currentPerson
			? [
					{
						href: `/p/${currentPerson.slug}`,
						label: 'Übersicht',
						icon: LayoutDashboard,
						exact: true
					},
					{ href: `/p/${currentPerson.slug}/jobs`, label: 'Stellen', icon: Briefcase },
					{ href: `/p/${currentPerson.slug}/leads`, label: 'Betriebe', icon: MapPin },
					{
						href: `/p/${currentPerson.slug}/applications`,
						label: 'Bewerbungen',
						icon: ClipboardList
					},
					{ href: `/p/${currentPerson.slug}/settings`, label: 'Einstellungen', icon: Settings }
				]
			: [
					{ href: '/', label: 'Übersicht', icon: LayoutDashboard, exact: true },
					{ href: '/settings', label: 'Einstellungen', icon: Settings }
				]
	);

	function isActive(item: NavItem): boolean {
		const pathname = page.url.pathname.replace(/\/+$/, '') || '/';
		return item.exact ? pathname === item.href : pathname.startsWith(item.href);
	}

	function personHref(personSlug: string): string {
		return `/p/${personSlug}${currentPerson ? section : ''}`;
	}

	function touchSession(event: Event) {
		if (!event.isTrusted) return;
		const now = Date.now();
		if (now - lastSessionTouch < sessionTouchInterval) return;
		lastSessionTouch = now;

		void fetch(resolve('auth/session/touch'), {
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
		<div
			class="mx-auto flex min-h-14 w-full max-w-[90rem] flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 sm:flex-nowrap sm:gap-x-4 sm:py-0"
		>
			<a href={resolve('')} class="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight">
				<span
					class="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
				>
					<Briefcase class="size-4.5" />
				</span>
				<span class="hidden md:inline">Jobstrian</span>
			</a>

			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="sm"
							class="h-8 min-w-0 gap-2 px-1.5"
							aria-label={currentPerson
								? `Person wechseln, aktuell ${currentPerson.name}`
								: 'Person wählen'}
						>
							{#if currentPerson}
								<PersonAvatar person={currentPerson} size="sm" />
								<span class="max-w-32 truncate sm:max-w-48">{currentPerson.name}</span>
							{:else}
								<span
									class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
								>
									<Users class="size-3.5" />
								</span>
								<span class="truncate">Alle Personen</span>
							{/if}
							<ChevronsUpDown class="size-3.5 shrink-0 text-muted-foreground" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="w-64">
					<DropdownMenu.Label>Personen</DropdownMenu.Label>
					{#each data.people as person (person.id)}
						<DropdownMenu.Item>
							{#snippet child({ props })}
								<a
									{...props}
									href={resolveHref(personHref(person.slug))}
									aria-current={person.slug === slug ? 'true' : undefined}
								>
									<PersonAvatar {person} size="sm" />
									<span class="min-w-0 flex-1 truncate">{person.name}</span>
									{#if person.slug === slug}
										<Check class="size-4 shrink-0" />
									{/if}
								</a>
							{/snippet}
						</DropdownMenu.Item>
					{:else}
						<p class="px-2 py-1.5 text-sm text-muted-foreground">Noch keine Person angelegt.</p>
					{/each}
					<DropdownMenu.Separator />
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a {...props} href={resolve('')}>
								<Users class="size-4" />
								Alle Personen
							</a>
						{/snippet}
					</DropdownMenu.Item>
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a {...props} href={resolve('settings')}>
								<SlidersHorizontal class="size-4" />
								Personen &amp; KI verwalten
							</a>
						{/snippet}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			<nav
				class="order-last flex w-full items-center gap-1 sm:order-none sm:w-auto"
				aria-label="Hauptnavigation"
			>
				{#each navItems as item (item.href)}
					<Button
						href={item.href}
						variant="ghost"
						size="sm"
						class={[
							'flex-1 px-2 sm:flex-none sm:px-3',
							isActive(item)
								? 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary dark:bg-primary/15 dark:hover:bg-primary/20'
								: 'text-muted-foreground hover:text-foreground'
						]}
						aria-label={item.label}
						aria-current={isActive(item) ? 'page' : undefined}
					>
						<item.icon class="size-4" />
						<span class="hidden sm:inline">{item.label}</span>
					</Button>
				{/each}
			</nav>

			<div class="ml-auto flex items-center gap-1">
				{#if currentPerson}
					<Button
						href="/settings"
						variant="ghost"
						size="icon"
						aria-label="App-Einstellungen"
						title="App-Einstellungen"
					>
						<SlidersHorizontal class="size-4" />
					</Button>
				{/if}
				<Button variant="ghost" size="icon" onclick={toggleMode} aria-label="Theme wechseln">
					<Sun class="size-4 dark:hidden" />
					<Moon class="hidden size-4 dark:block" />
				</Button>

				<Button
					variant="ghost"
					size="icon"
					aria-label="Abmelden"
					onclick={() => authClient.signOut({ callbackURL: '/login' })}
					><LogOut class="size-4" /></Button
				>
			</div>
		</div>
	</header>
	<main class="mx-auto w-full max-w-[90rem] flex-1 px-4 py-8">
		<!-- Remount person pages on person switch so list, polling and form state never leak across people. -->
		{#key slug}
			{@render children()}
		{/key}
	</main>
</div>
