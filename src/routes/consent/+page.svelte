<script lang="ts">
	import AuthShell from '#lib/components/auth-shell.svelte';
	import { authClient } from '#lib/auth-client.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let pending = $state<'accept' | 'deny' | null>(null);
	let failed = $state(false);

	const clientUri = $derived.by(() => {
		if (!data.client.uri) return null;
		try {
			const { protocol } = new URL(data.client.uri);
			return protocol === 'http:' || protocol === 'https:' ? data.client.uri : null;
		} catch {
			return null;
		}
	});

	async function finish(accept: boolean) {
		pending = accept ? 'accept' : 'deny';
		failed = false;
		const result = await authClient.oauth2.consent({ accept }).catch(() => null);
		if (!result || result.error || !result.data?.url) {
			failed = true;
			pending = null;
			return;
		}
		window.location.assign(result.data.url);
	}
</script>

<svelte:head>
	<title>Verbinden · Jobstrian</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<AuthShell
	title="{data.client.name} verbinden?"
	description="Diese Anwendung möchte im Namen deines Jobstrian-Kontos auf Bewerbungen zugreifen."
>
	<Card.Content class="space-y-4">
		{#if clientUri}
			<p class="text-sm break-all text-muted-foreground">{clientUri}</p>
		{/if}
		{#if data.client.redirectHosts.length > 0}
			<p class="text-sm break-words text-muted-foreground">
				Du wirst zurückgeleitet zu {data.client.redirectHosts.join(', ')}.
			</p>
		{/if}
		<div class="space-y-2">
			<h2 class="text-sm font-medium">Diese Anwendung darf</h2>
			<ul class="space-y-2">
				{#each data.scopes as scope (scope.id)}
					<li class="flex items-start gap-2 text-sm">
						<ShieldCheck class="mt-0.5 size-4 shrink-0 text-primary" />
						<span>{scope.description}</span>
					</li>
				{/each}
			</ul>
		</div>
		<p class="text-xs text-muted-foreground">
			Du kannst den Zugriff jederzeit unter App-Einstellungen → Verbundene Apps widerrufen.
		</p>
		{#if failed}
			<Alert.Root variant="destructive">
				<CircleAlert />
				<Alert.Description>
					Die Autorisierungsanfrage ist abgelaufen. Starte die Verbindung erneut in deinem
					KI-Client.
				</Alert.Description>
			</Alert.Root>
		{/if}
	</Card.Content>
	<Card.Footer class="mt-6 gap-2">
		<Button
			variant="outline"
			class="flex-1"
			disabled={pending !== null}
			onclick={() => void finish(false)}
		>
			{#if pending === 'deny'}<Spinner aria-label="Wird abgelehnt" />{/if}
			Ablehnen
		</Button>
		<Button class="flex-1" disabled={pending !== null} onclick={() => void finish(true)}>
			{#if pending === 'accept'}<Spinner aria-label="Wird verbunden" />{/if}
			Verbinden
		</Button>
	</Card.Footer>
</AuthShell>
