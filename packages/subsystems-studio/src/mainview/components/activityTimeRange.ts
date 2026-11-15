export type ActivityTimeRange = {
	key: string;
	start: number;
	end: number;
	label: string;
};

export function createActivityTimeRange(
	start: Date,
	end: Date,
	label: string,
): ActivityTimeRange {
	const startTime = start.getTime();
	const endTime = end.getTime();
	return {
		key: `${startTime}-${endTime}`,
		start: startTime,
		end: endTime,
		label,
	};
}

export function isInActivityTimeRange(
	timestamp: string,
	range: ActivityTimeRange,
): boolean {
	const time = Date.parse(timestamp);
	return Number.isFinite(time) && time >= range.start && time < range.end;
}
