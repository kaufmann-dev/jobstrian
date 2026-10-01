<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import AuthShell from '#lib/components/auth-shell.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import LogIn from '@lucide/svelte/icons/log-in';
	import type { PageProps } from './$types';
	import { authClient } from '#lib/auth-client.js';
	import { OIDC_PROVIDER_ID } from '#lib/oidc-policy.js';

	let { data }: PageProps = $props();
	let pending = $state(false);
	let startError = $state(false);

	async function signIn() {
		pending = true;
		startError = false;
		const { error } = await authClient.signIn.social({
			provider: OIDC_PROVIDER_ID,
			callbackURL: data.returnTo,
			errorCallbackURL: '/login'
		});
		if (error) {
			startError = true;
			pending = false;
		}
	}
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
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void signIn();
		}}
	>
		<Card.Content class="space-y-4">
			<p class="text-sm text-muted-foreground">
				Die Anmeldung erfolgt über den zentralen Identitätsdienst.
			</p>
			{#if startError}
				<p class="text-sm text-destructive" role="alert">
					Der Anmeldedienst ist gerade nicht erreichbar. Bitte versuche es erneut.
				</p>
			{:else if data.providerError}
				<p class="text-sm text-destructive" role="alert">
					Die Anmeldung wurde nicht abgeschlossen. Bitte versuche es erneut.
				</p>
			{/if}
		</Card.Content>
		<Card.Footer class="mt-6">
			<Button type="submit" class="w-full" disabled={pending}>
				<LogIn class="size-4" />
				Mit OIDC anmelden
			</Button>
		</Card.Footer>
	</form>
	<nav
		aria-label="Rechtliche Informationen"
		class="flex justify-center gap-4 border-t px-5 pt-5 text-xs text-muted-foreground"
	>
		<a
			href="https://legal.kaufmann.dev/imprint?site=jobstrian.kaufmann.dev"
			class="inline-flex min-h-6 items-center underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
		>
			Imprint
		</a>
		<a
			href="https://legal.kaufmann.dev/privacy?site=jobstrian.kaufmann.dev"
			class="inline-flex min-h-6 items-center underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
		>
			Privacy
		</a>
	</nav>
</AuthShell>
