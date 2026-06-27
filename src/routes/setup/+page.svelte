<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { setupSchema } from './schema';
	import * as Form from '$lib/components/ui/form/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import AuthShell from '$lib/components/auth-shell.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import { untrack } from 'svelte';
	import { fromAction } from 'svelte/attachments';

	let { data } = $props();

	const form = superForm(
		untrack(() => data.form),
		{
			validators: zod4Client(setupSchema)
		}
	);
	const { form: formData, enhance, message, submitting } = form;
	const enhanceAttachment = fromAction(enhance);
</script>

<svelte:head>
	<title>Einrichtung · Jobstrian</title>
	<meta
		name="description"
		content="Richte dein Jobstrian-Konto ein, um mit der Stellensuche zu starten."
	/>
	<meta name="robots" content="noindex" />
</svelte:head>

<AuthShell title="Einrichten" description="Lege den einzigen Benutzer für diese Installation an.">
	<form method="POST" {@attach enhanceAttachment}>
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
</AuthShell>
