<script lang="ts">
	import { personColor, personInitials } from '#lib/people.js';
	import { cn } from '#lib/utils.js';

	type Props = {
		person: { name: string; color: string };
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	};

	let { person, size = 'md', class: className }: Props = $props();

	const color = $derived(personColor(person.color));
	const initials = $derived(personInitials(person.name));

	const chipSizes = {
		sm: 'size-6 text-[0.65rem]',
		md: 'size-8 text-xs',
		lg: 'size-12 text-base'
	} as const;

	const dotSizes = {
		sm: 'size-2',
		md: 'size-2.5',
		lg: 'size-3'
	} as const;
</script>

<span
	class={cn(
		'relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
		chipSizes[size],
		color.soft,
		className
	)}
	aria-hidden="true"
>
	{initials}
	<span
		class={cn(
			'absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-background',
			dotSizes[size],
			color.dot
		)}
	></span>
</span>
