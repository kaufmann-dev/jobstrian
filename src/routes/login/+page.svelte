<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import LogIn from '@lucide/svelte/icons/log-in';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		loading = true;
		error = '';
		const { error: err } = await authClient.signIn.email({ email, password });
		loading = false;
		if (err) {
			error = err.message ?? 'Anmeldung fehlgeschlagen';
			return;
		}
		await goto('/');
	}
</script>

<div class="flex min-h-svh items-center justify-center p-4">
	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<Card.Title class="text-2xl">Jobstrian</Card.Title>
			<Card.Description>Melde dich an, um deine Jobsuche zu verwalten.</Card.Description>
		</Card.Header>
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
	</Card.Root>
</div>
