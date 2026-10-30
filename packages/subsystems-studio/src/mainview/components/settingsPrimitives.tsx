/**
 * Small building blocks shared by the Settings panes: the bordered card, the
 * label/hint text pair, inputs, buttons, and the status dot. Keeps the pane
 * files about behaviour rather than inline style repetition.
 */

import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "@principal-ade/industry-theme";

type Theme = ReturnType<typeof useTheme>["theme"];

export function mutedColor(theme: Theme): string {
	return theme.colors.textMuted ?? theme.colors.textSecondary;
}

export function Card({
	children,
	dimmed,
	style,
}: {
	children: ReactNode;
	dimmed?: boolean;
	style?: CSSProperties;
}) {
	const { theme } = useTheme();
	return (
		<div
			style={{
				padding: "10px 12px",
				marginBottom: 8,
				borderRadius: 8,
				background: theme.colors.background,
				border: `1px solid ${theme.colors.border}`,
				opacity: dimmed ? 0.55 : 1,
				...style,
			}}
		>
			{children}
		</div>
	);
}

export function CardTitle({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
	const { theme } = useTheme();
	const style: CSSProperties = {
		display: "block",
		fontSize: theme.fontSizes[1],
		fontWeight: 600,
		lineHeight: 1.3,
		marginBottom: 6,
	};
	return htmlFor
		? <label htmlFor={htmlFor} style={style}>{children}</label>
		: <span style={style}>{children}</span>;
}

export function Hint({ children, style }: { children: ReactNode; style?: CSSProperties }) {
	const { theme } = useTheme();
	return (
		<span
			style={{
				display: "block",
				fontSize: theme.fontSizes[0],
				color: mutedColor(theme),
				lineHeight: 1.45,
				marginTop: 4,
				...style,
			}}
		>
			{children}
		</span>
	);
}

export function fieldStyle(theme: Theme, extra?: CSSProperties): CSSProperties {
	return {
		width: "100%",
		minWidth: 0,
		padding: "6px 8px",
		borderRadius: 6,
		border: `1px solid ${theme.colors.border}`,
		background: theme.colors.surface,
		color: theme.colors.text,
		fontFamily: theme.fonts.body,
		fontSize: theme.fontSizes[1],
		...extra,
	};
}

export function ActionButton({
	children,
	onClick,
	disabled,
	primary,
	title,
}: {
	children: ReactNode;
	onClick: () => void;
	disabled?: boolean;
	primary?: boolean;
	title?: string;
}) {
	const { theme } = useTheme();
	const live = !disabled;
	const filled = primary && live;
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={title}
			style={{
				flexShrink: 0,
				padding: "0 14px",
				height: 32,
				borderRadius: 6,
				fontSize: theme.fontSizes[1],
				fontWeight: 500,
				fontFamily: theme.fonts.body,
				background: filled ? theme.colors.primary : theme.colors.surface,
				color: filled ? theme.colors.background : live ? theme.colors.text : mutedColor(theme),
				border: `1px solid ${filled ? theme.colors.primary : theme.colors.border}`,
				cursor: live ? "pointer" : "default",
				opacity: live ? 1 : 0.7,
			}}
		>
			{children}
		</button>
	);
}

export type DotTone = "ok" | "warn" | "error" | "idle";

export function StatusDot({ tone }: { tone: DotTone }) {
	const { theme } = useTheme();
	const color =
		tone === "ok" ? theme.colors.success
		: tone === "warn" ? theme.colors.warning
		: tone === "error" ? theme.colors.error
		: mutedColor(theme);
	return (
		<span
			aria-hidden
			style={{
				display: "inline-block",
				width: 8,
				height: 8,
				borderRadius: "50%",
				background: color,
				flexShrink: 0,
			}}
		/>
	);
}

/** One line of status: dot + text, used under inputs and in card headers. */
export function StatusLine({ tone, children }: { tone: DotTone; children: ReactNode }) {
	const { theme } = useTheme();
	return (
		<span
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				fontSize: theme.fontSizes[0],
				color: mutedColor(theme),
				lineHeight: 1.45,
				marginTop: 6,
			}}
		>
			<StatusDot tone={tone} />
			<span style={{ minWidth: 0 }}>{children}</span>
		</span>
	);
}

/** Two-to-three way toggle, e.g. "Jev | Ollama". */
export function Segmented<T extends string>({
	value,
	options,
	onChange,
	disabled,
}: {
	value: T;
	options: Array<{ value: T; label: string }>;
	onChange: (value: T) => void;
	disabled?: boolean;
}) {
	const { theme } = useTheme();
	return (
		<div
			role="radiogroup"
			style={{
				display: "inline-flex",
				padding: 3,
				gap: 2,
				borderRadius: 8,
				background: theme.colors.background,
				border: `1px solid ${theme.colors.border}`,
			}}
		>
			{options.map((opt) => {
				const active = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						role="radio"
						aria-checked={active}
						disabled={disabled}
						onClick={() => onChange(opt.value)}
						style={{
							padding: "5px 12px",
							borderRadius: 6,
							border: "none",
							background: active ? theme.colors.surface : "transparent",
							color: active ? theme.colors.text : mutedColor(theme),
							boxShadow: active ? "0 1px 2px rgba(0,0,0,0.15)" : "none",
							fontFamily: theme.fonts.body,
							fontSize: theme.fontSizes[1],
							fontWeight: active ? 600 : 500,
							cursor: disabled ? "default" : "pointer",
						}}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}

/** Checkbox row with title + description, matching the Default-tabs toggles. */
export function CheckRow({
	checked,
	disabled,
	onChange,
	title,
	description,
	accent,
}: {
	checked: boolean;
	disabled?: boolean;
	onChange: () => void;
	title: ReactNode;
	description: ReactNode;
	accent?: string;
}) {
	const { theme } = useTheme();
	return (
		<label
			style={{
				display: "flex",
				alignItems: "center",
				gap: 12,
				padding: "10px 12px",
				marginBottom: 8,
				borderRadius: 8,
				background: theme.colors.background,
				border: `1px solid ${theme.colors.border}`,
				cursor: disabled ? "default" : "pointer",
				opacity: disabled ? 0.6 : 1,
			}}
		>
			<input
				type="checkbox"
				checked={checked}
				disabled={disabled}
				onChange={onChange}
				style={{
					width: 16,
					height: 16,
					accentColor: accent ?? theme.colors.primary,
					cursor: disabled ? "default" : "pointer",
					flexShrink: 0,
				}}
			/>
			<span style={{ minWidth: 0, flex: 1 }}>
				<span style={{ display: "block", fontSize: theme.fontSizes[1], fontWeight: 600, lineHeight: 1.3 }}>
					{title}
				</span>
				<span style={{ display: "block", fontSize: theme.fontSizes[0], color: mutedColor(theme), lineHeight: 1.4, marginTop: 2 }}>
					{description}
				</span>
			</span>
		</label>
	);
}
