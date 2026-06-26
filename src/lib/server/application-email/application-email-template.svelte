<script lang="ts">
	let { body }: { body: string } = $props();
	const paragraphs = $derived(
		body
			.split(/\n{2,}/)
			.map((part) => part.trim())
			.filter(Boolean)
	);
</script>

<div style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.55; color: #111827;">
	{#each paragraphs as paragraph (paragraph)}
		<p style="margin: 0 0 16px; white-space: pre-line;">{paragraph}</p>
	{/each}
</div>
