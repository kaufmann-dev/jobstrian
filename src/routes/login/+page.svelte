<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/auth-client';
	import * as Card from '$lib/components/ui/card/index.js';
	import AuthShell from '$lib/components/auth-shell.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import LogIn from '@lucide/svelte/icons/log-in';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	function signInErrorMessage(): string {
		return 'Anmeldung fehlgeschlagen. Bitte prüfe E-Mail und Passwort.';
	}

	async function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		loading = true;
		error = '';
		const { error: err } = await authClient.signIn.email({ email, password });
		loading = false;
		if (err) {
			error = signInErrorMessage();
			return;
		}
		await goto(resolve('/'));
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
	<form {onsubmit}>
		<Card.Content class="space-y-4">
			<div class="space-y-2">
				<Label for="email">E-Mail</Label>
				<Input id="email" type="email" bind:value={email} required autocomplete="email" />
			</div>
			<div class="space-y-2">
				<Label for="password">Passwort</Label>
				<Input
					id="password"
					type="password"
					bind:value={password}
					required
					autocomplete="current-password"
				/>
			</div>
			{#if error}
				<p class="text-sm text-destructive" role="alert">{error}</p>
			{/if}
		</Card.Content>
		<Card.Footer class="mt-6">
			<Button type="submit" class="w-full" disabled={loading}>
				{#if loading}
					<Spinner class="size-4" />
				{:else}
					<LogIn class="size-4" />
				{/if}
				Anmelden
			</Button>
		</Card.Footer>
	</form>
</AuthShell>
