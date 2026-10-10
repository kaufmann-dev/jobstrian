<script lang="ts">
	import { toast } from 'svelte-sonner';
	import ConfirmDialog from '#lib/components/confirm-dialog.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import Copy from '@lucide/svelte/icons/copy';
	import Unplug from '@lucide/svelte/icons/unplug';
	import IdActionForm from './id-action-form.svelte';
	import type { PageData } from './$types';

	type ConnectedApp = PageData['connectedApps'][number];

	let { connectedApps, mcpUrl }: { connectedApps: ConnectedApp[]; mcpUrl: string } = $props();

	let confirmOpen = $state(false);
	let target = $state.raw<ConnectedApp | null>(null);
	let revokeForm = $state<HTMLFormElement | null>(null);
	let revoking = $state(false);

	const commands = $derived([
		{ label: 'Claude Code', command: `claude mcp add --transport http jobstrian ${mcpUrl}` },
		{ label: 'Codex', command: `codex mcp add jobstrian --url ${mcpUrl}` }
	]);

	async function copy(text: string, what: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(`${what} kopiert`);
		} catch {
			toast.error('Kopieren fehlgeschlagen');
		}
	}

	function askRevoke(app: ConnectedApp) {
		target = app;
		confirmOpen = true;
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Verbundene Apps</Card.Title>
		<Card.Description>
			Hier siehst du KI-Anwendungen (z. B. Claude), die über MCP auf deine Bewerbungen zugreifen
			dürfen.
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-6">
		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="mcp-url">MCP-URL</Label>
				<div class="flex gap-2">
					<Input
						id="mcp-url"
						readonly
						value={mcpUrl}
						class="font-mono text-xs sm:text-sm"
						onfocus={(event) => event.currentTarget.select()}
					/>
					<Button
						variant="outline"
						size="icon"
						aria-label="MCP-URL kopieren"
						title="MCP-URL kopieren"
						onclick={() => copy(mcpUrl, 'MCP-URL')}
					>
						<Copy />
					</Button>
				</div>
			</div>
			{#each commands as { label, command } (label)}
				<div class="space-y-2">
					<p class="text-sm font-medium">{label}</p>
					<div class="flex items-start gap-2">
						<code
							class="min-w-0 flex-1 overflow-x-auto rounded-xl bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap"
						>
							{command}
						</code>
						<Button
							variant="outline"
							size="icon"
							aria-label={`Befehl für ${label} kopieren`}
							title={`Befehl für ${label} kopieren`}
							onclick={() => copy(command, 'Befehl')}
						>
							<Copy />
						</Button>
					</div>
				</div>
			{/each}
		</div>

		<div class="space-y-3 border-t pt-6">
			<h3 class="text-sm font-medium">Verbundene Anwendungen</h3>
			{#if connectedApps.length === 0}
				<div
					class="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center"
				>
					<Unplug class="size-8 text-muted-foreground" aria-hidden="true" />
					<p class="text-sm text-muted-foreground">Noch keine Anwendung verbunden.</p>
				</div>
			{:else}
				<ul class="space-y-2">
					{#each connectedApps as app (app.clientId)}
						<li class="flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center">
							<div class="min-w-0 flex-1 space-y-1.5">
								<div>
									<p class="truncate font-medium">{app.name}</p>
									{#if app.uri}
										<p class="text-xs break-all text-muted-foreground">{app.uri}</p>
									{/if}
									<p class="text-xs text-muted-foreground">
										Verbunden am {new Date(app.grantedAt).toLocaleDateString('de-AT')}
									</p>
								</div>
								{#if app.scopes.length > 0}
									<div class="flex flex-wrap gap-1">
										{#each app.scopes as scope (scope)}
											<Badge variant="secondary">{scope}</Badge>
										{/each}
									</div>
								{/if}
							</div>
							<Button
								variant="destructive"
								size="sm"
								class="w-full sm:w-auto sm:shrink-0"
								onclick={() => askRevoke(app)}
							>
								<Unplug /> Widerrufen
							</Button>
						</li>
					{/each}
				</ul>
			{/if}
			<p class="text-xs text-muted-foreground">
				Nach dem Widerrufen können bereits ausgestellte Zugriffstokens noch bis zu 15 Minuten
				verwendet werden.
			</p>
		</div>
	</Card.Content>
</Card.Root>

{#if target}
	<IdActionForm
		action="revokeApp"
		field="clientId"
		id={target.clientId}
		bind:element={revokeForm}
		bind:pending={revoking}
		ondone={(ok) => {
			if (ok) confirmOpen = false;
		}}
	/>
{/if}

<ConfirmDialog
	bind:open={confirmOpen}
	title={target ? `Zugriff für „${target.name}“ widerrufen?` : 'Zugriff widerrufen?'}
	actions={[
		{
			label: 'Widerrufen',
			variant: 'destructive',
			icon: Unplug,
			loading: revoking,
			onclick: () => revokeForm?.requestSubmit()
		}
	]}
>
	{#snippet description()}
		Die Anwendung verliert den Zugriff auf deine Bewerbungen und muss neu verbunden werden. Bereits
		ausgestellte Zugriffstokens bleiben noch bis zu 15 Minuten gültig.
	{/snippet}
</ConfirmDialog>
