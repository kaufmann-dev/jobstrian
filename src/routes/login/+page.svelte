<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/auth-client';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import LogIn from '@lucide/svelte/icons/log-in';
	import Briefcase from '@lucide/svelte/icons/briefcase';

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
		await goto(resolve('/'));
	}
</script>

<div class="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
	<div class="flex items-center gap-3">
		<span
			class="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md"
		>
			<Briefcase class="size-5.5" />
		</span>
		<span class="text-2xl font-semibold tracking-tight">Jobstrian</span>
	</div>
	<Card.Root class="w-full max-w-sm shadow-lg">
		<Card.Header>
			<Card.Title>Anmelden</Card.Title>
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
