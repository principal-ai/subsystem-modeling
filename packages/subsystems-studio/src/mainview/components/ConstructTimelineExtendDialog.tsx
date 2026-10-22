import { useEffect, useRef, type CSSProperties } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { CONSTRUCT_TIMELINE_DEFAULT_COMMITS, CONSTRUCT_TIMELINE_MAX_COMMITS, type ConstructTimelineOptions } from "../../shared/construct-timeline";
import { Modal, ModalBody, ModalButton, ModalFooter, ModalHeader } from "./Modal";

export function ConstructTimelineExtendDialog({ options, onOptionsChange, hasTimeline, busy, running, onClose, onSubmit }: {
	options: ConstructTimelineOptions;
	onOptionsChange: (options: ConstructTimelineOptions) => void;
	hasTimeline: boolean;
	busy: boolean;
	running: boolean;
	onClose: () => void;
	onSubmit: () => void;
}) {
	const { theme } = useTheme();
	const form = useRef<HTMLFormElement>(null);
	const firstInput = useRef<HTMLInputElement>(null);
	const disabled = busy || running;
	const title = hasTimeline ? "Continue analysis" : "Start analysis";
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	useEffect(() => {
		const previous = document.activeElement as HTMLElement | null;
		(form.current?.querySelector<HTMLElement>('button[aria-pressed="true"]') ?? firstInput.current)?.focus();
		return () => { if (previous?.isConnected) previous.focus(); };
	}, []);
	const input: CSSProperties = {
		width: "100%", minWidth: 0, boxSizing: "border-box",
		border: `1px solid ${theme.colors.border}`, borderRadius: 5, padding: "7px 9px",
		color: theme.colors.text, background: theme.colors.background, font: "inherit",
	};
	const presets = (label: string, choices: Array<{ label: string; options: ConstructTimelineOptions }>) =>
		<div role="group" aria-label={label} style={{ display: "grid", gap: 6 }}>
			<span style={{ fontSize: theme.fontSizes[1], color: muted }}>{label}</span>
			<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
				{choices.map((choice) => {
					const selected = options.maxCommits === choice.options.maxCommits
						&& options.maxMinutes === choice.options.maxMinutes && options.historyPeriod === choice.options.historyPeriod;
					return <button key={choice.label} type="button" disabled={disabled} aria-pressed={selected}
						onClick={() => onOptionsChange(choice.options)}
						style={{ padding: "7px 12px", borderRadius: 5, font: "inherit", fontSize: theme.fontSizes[1],
							border: `1px solid ${selected ? theme.colors.primary : theme.colors.border}`,
							background: selected ? theme.colors.primary : theme.colors.background,
							color: selected ? theme.colors.background : theme.colors.text, cursor: disabled ? "default" : "pointer",
							opacity: disabled ? 0.6 : 1 }}>{choice.label}</button>;
				})}
			</div>
		</div>;
	return <Modal ariaLabel={title} onClose={onClose} width={480}>
		<form ref={form} style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
			onSubmit={(event) => { event.preventDefault(); if (!disabled) onSubmit(); }}
			onKeyDown={(event) => {
				if (event.key !== "Tab") return;
				const controls = [...form.current!.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
				const first = controls[0], last = controls.at(-1);
				if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
				else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
			}}>
			<ModalHeader title={title} onClose={onClose} />
			<ModalBody>
				<div style={{ display: "grid", gap: 16 }}>
					{presets("Commit history", [
						{ label: "1 day", options: { historyPeriod: "day" } },
						{ label: "1 week", options: { historyPeriod: "week" } },
						{ label: "1 month", options: { historyPeriod: "month" } },
					])}
					{presets("Commits", [10, 100, 1000].map((count) => ({ label: `${count} commits`, options: { maxCommits: count } })))}
					<label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: theme.fontSizes[1] }}>Custom commits
						<input ref={firstInput} aria-label="Timeline commits per extension" style={input} type="number"
							required={!options.historyPeriod && options.maxMinutes === undefined}
							min={1} max={CONSTRUCT_TIMELINE_MAX_COMMITS} step={1}
							value={options.maxCommits ?? (options.historyPeriod || options.maxMinutes !== undefined ? "" : CONSTRUCT_TIMELINE_DEFAULT_COMMITS)}
							placeholder="Custom count" disabled={disabled}
							onChange={(event) => onOptionsChange({ maxCommits: Number(event.target.value) })} />
					</label>
					{presets("Runtime", [
						{ label: "10 minutes", options: { maxMinutes: 10 } },
						{ label: "1 hour", options: { maxMinutes: 60 } },
					])}
					{options.maxMinutes === undefined && <div style={{ color: muted, fontSize: theme.fontSizes[0] }}>No time limit</div>}
				</div>
				<p style={{ color: muted, fontSize: theme.fontSizes[0], lineHeight: 1.5, marginBottom: 0 }}>
					Continues oldest-first from the cursor, without reanalyzing earlier commits. History presets use UTC commit dates.
				</p>
			</ModalBody>
			<ModalFooter>
				<ModalButton onClick={onClose}>Cancel</ModalButton>
				<button type="submit" disabled={disabled}
					style={{ height: 32, padding: "0 14px", borderRadius: 6, border: `1px solid ${theme.colors.primary}`,
						background: theme.colors.primary, color: theme.colors.background, font: "inherit", fontSize: theme.fontSizes[1],
						cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 }}>
					{hasTimeline ? "Extend timeline" : "Start timeline"}
				</button>
			</ModalFooter>
		</form>
	</Modal>;
}
