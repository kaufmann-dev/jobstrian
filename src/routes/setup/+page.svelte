<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { setupSchema } from './schema';
	import * as Form from '$lib/components/ui/form/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import { untrack } from 'svelte';

	let { data } = $props();

	const form = superForm(
		untrack(() => data.form),
		{
			validators: zod4Client(setupSchema)
		}
	);
	const { form: formData, enhance, message, submitting } = form;
</script>

<svelte:head>
	<title>Einrichtung · Jobstrian</title>
	<meta name="description" content="Richte dein Jobstrian-Konto ein, um mit der Stellensuche zu starten." />
	<meta name="robots" content="noindex" />
</svelte:head>

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
			<Card.Title>Einrichten</Card.Title>
			<Card.Description>Lege den einzigen Benutzer für diese Installation an.</Card.Description>
		</Card.Header>
		<form method="POST" use:enhance>
			<Card.Content class="space-y-4">
				<Form.Field {form} name="email">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>E-Mail</Form.Label>
							<Input {...props} type="email" bind:value={$formData.email} autocomplete="email" />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="password">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Passwort</Form.Label>
							<Input
								{...props}
								type="password"
								bind:value={$formData.password}
								autocomplete="new-password"
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="confirmPassword">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Passwort bestätigen</Form.Label>
							<Input
								{...props}
								type="password"
								bind:value={$formData.confirmPassword}
								autocomplete="new-password"
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				{#if $message}
					<p class="text-sm text-destructive">{$message}</p>
				{/if}
			</Card.Content>
			<Card.Footer class="mt-6">
				<Button type="submit" class="w-full" disabled={$submitting}>
					{#if $submitting}
						<Spinner class="size-4" />
					{:else}
						<UserPlus class="size-4" />
					{/if}
					Benutzer anlegen
				</Button>
			</Card.Footer>
		</form>
	</Card.Root>
</div>
