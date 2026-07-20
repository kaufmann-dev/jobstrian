<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import AuthShell from '$lib/components/auth-shell.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import LogIn from '@lucide/svelte/icons/log-in';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Anmelden · Jobstrian</title>
	<meta
		name="description"
		content="Melde dich bei Jobstrian an, um deine Stellensuche fortzusetzen."
	/>
	<meta name="robots" content="noindex" />
</svelte:head>

<AuthShell title="Anmelden" description="Melde dich an, um deine Jobsuche zu verwalten.">
	<form method="POST" action="?/oidc">
		<Card.Content class="space-y-4">
			<p class="text-sm text-muted-foreground">
				Die Anmeldung erfolgt über den zentralen Identitätsdienst.
			</p>
			{#if form?.error}
				<p class="text-sm text-destructive" role="alert">{form.error}</p>
			{:else if data.providerError}
				<p class="text-sm text-destructive" role="alert">
					Die Anmeldung wurde nicht abgeschlossen. Bitte versuche es erneut.
				</p>
			{/if}
		</Card.Content>
		<Card.Footer class="mt-6">
			<Button type="submit" class="w-full">
				<LogIn class="size-4" />
				Mit OIDC anmelden
			</Button>
		</Card.Footer>
	</form>
</AuthShell>
