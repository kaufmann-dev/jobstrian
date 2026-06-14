import type { Action } from 'svelte/action';

/**
 * Renders a dropdown in `document.body` and pins it directly beneath an anchor
 * element with `position: fixed`. This lets suggestion lists escape ancestors
 * that clip overflow (e.g. cards with `overflow-hidden`) instead of being cut
 * off at their boundaries. Position tracks the anchor on scroll and resize.
 */
export const anchoredDropdown: Action<HTMLElement, HTMLElement> = (node, anchor) => {
	let current = anchor;

	function reposition() {
		const rect = current.getBoundingClientRect();
		node.style.position = 'fixed';
		node.style.top = `${rect.bottom + 4}px`;
		node.style.left = `${rect.left}px`;
		node.style.width = `${rect.width}px`;
	}

	document.body.appendChild(node);
	reposition();

	// `true` captures scrolls on any ancestor, not just the window.
	window.addEventListener('scroll', reposition, true);
	window.addEventListener('resize', reposition);

	return {
		update(next: HTMLElement) {
			current = next;
			reposition();
		},
		destroy() {
			window.removeEventListener('scroll', reposition, true);
			window.removeEventListener('resize', reposition);
			node.remove();
		}
	};
};
