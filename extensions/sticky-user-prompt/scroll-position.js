export function effectiveScrollTop(rawScrollTop, isFollowingEnd, stickyHeight) {
	const layoutDisplacement = isFollowingEnd ? stickyHeight : 0;
	return Math.max(0, rawScrollTop - layoutDisplacement);
}
