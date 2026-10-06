/**
 * Modal — the shared dialog shell. One overlay + surface + header/body/footer
 * so every dialog in the app reads the same instead of hand-rolling padding,
 * widths, and dividers.
 *
 * Presentational: renders inline (no portal). Callers wrap in `createPortal`
 * when the dialog must escape a stacking/clipping context.
 *
 *   <Modal ariaLabel="Run maintenance">
 *     <ModalHeader icon={Wrench} title="Run maintenance?" />
 *     <ModalBody>…</ModalBody>
 *     <ModalFooter>…buttons…</ModalFooter>
 *   </Modal>
 */

import { useState, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { Loader2, type LucideIcon } from "lucide-react";

/** Shared dialog title-row padding. */
const HEADER_PAD = "14px 20px";
const FOOTER_PAD = "12px 20px";

/** `#rrggbb` + alpha → `rgba(...)`, for hover washes that read on any surface. */
function tint(hex: string, alpha: number): string {
	const raw = hex.replace("#", "");
	const full =
		raw.length === 3 ? [...raw].map((c) => c + c).join("") : raw;
	if (!/^[0-9a-fA-F]{6}$/.test(full)) return hex;
	const r = parseInt(full.slice(0, 2), 16);
	const g = parseInt(full.slice(2, 4), 16);
	const b = parseInt(full.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function Modal({
	children,
	onClose,
	width = 480,
	ariaLabel,
}: {
	children: ReactNode;
	/** Backdrop click handler. Omit to make the dialog modal-only (no dismiss). */
	onClose?: () => void;
	/** Max content width in px. */
	width?: number;
	ariaLabel: string;
}) {
	const { theme } = useTheme();
	return (
		<div
			role="dialog"
			aria-modal
			aria-label={ariaLabel}
			onClick={onClose}
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 2147483000,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "rgba(0,0,0,0.55)",
				fontFamily: theme.fonts.body,
			}}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					width: `min(${width}px, calc(100vw - 48px))`,
					maxHeight: "min(85vh, 760px)",
					display: "flex",
					flexDirection: "column",
					background: theme.colors.surface,
					border: `1px solid ${theme.colors.border}`,
					borderRadius: 12,
					overflow: "hidden",
					boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
					color: theme.colors.text,
				}}
			>
				{children}
			</div>
		</div>
	);
}

export function ModalHeader({
	icon: Icon,
	iconColor,
	title,
	tone = "default",
	onClose,
}: {
	icon?: LucideIcon;
	/** Overrides the icon colour (e.g. error red for destructive dialogs). */
	iconColor?: string;
	title: ReactNode;
	/** `danger` tints the icon red when no explicit `iconColor` is given. */
	tone?: "default" | "danger";
	/** Close handler for the × button. Omit to hide the button (e.g. when the
	 *  footer owns dismissal, like a bare confirm). */
	onClose?: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textSecondary;
	const resolvedIconColor =
		iconColor ??
		(tone === "danger" ? (theme.colors.error ?? "#e5534b") : theme.colors.primary);
	// Default header shape: title left, × right, no icon. An icon switches to
	// the taller stacked header.
	const stacked = Icon != null;
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 12,
				padding: HEADER_PAD,
				borderBottom: `1px solid ${theme.colors.border}`,
				background: theme.colors.background,
			}}
		>
			<div style={{ minWidth: 0, flex: 1 }}>
				{stacked ? (
					<>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								fontSize: theme.fontSizes[3],
								fontWeight: 600,
							}}
						>
							{Icon && (
								<Icon
									size={theme.fontSizes[3]}
									style={{ color: resolvedIconColor, flexShrink: 0 }}
								/>
							)}
							<span style={{ minWidth: 0 }}>{title}</span>
						</div>
					</>
				) : (
					<span style={{ fontSize: theme.fontSizes[3], fontWeight: 600 }}>
						{title}
					</span>
				)}
			</div>
			{onClose && (
				<button
					type="button"
					onClick={onClose}
					title="Close"
					style={{
						width: 28,
						height: 28,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						borderRadius: 6,
						border: `1px solid ${theme.colors.border}`,
						background: theme.colors.background,
						color: muted,
						fontSize: theme.fontSizes[2],
						cursor: "pointer",
						lineHeight: 1,
						flexShrink: 0,
					}}
				>
					×
				</button>
			)}
		</div>
	);
}

export function ModalBody({
	children,
	scroll = true,
	pad = "16px 20px",
}: {
	children: ReactNode;
	/** Scroll long content inside the body; off for fixed-height layouts. */
	scroll?: boolean;
	pad?: string;
}) {
	const { theme } = useTheme();
	return (
		<div
			style={{
				flex: scroll ? 1 : undefined,
				minHeight: scroll ? 0 : undefined,
				overflowY: scroll ? "auto" : undefined,
				padding: pad,
				fontSize: theme.fontSizes[2],
				lineHeight: 1.5,
			}}
		>
			{children}
		</div>
	);
}

export function ModalFooter({ children }: { children: ReactNode }) {
	const { theme } = useTheme();
	return (
		<div
			style={{
				display: "flex",
				justifyContent: "flex-end",
				alignItems: "center",
				gap: 10,
				padding: FOOTER_PAD,
				borderTop: `1px solid ${theme.colors.border}`,
				background: theme.colors.background,
			}}
		>
			{children}
		</div>
	);
}

/**
 * Dialog action button with hover / press feedback. Inline styles can't express
 * pseudo-classes and Storybook doesn't load the app stylesheet, so the states
 * are driven by local `hover`/`pressed` state instead of CSS.
 */
export function ModalButton({
	variant = "ghost",
	icon: Icon,
	busy = false,
	disabled,
	onClick,
	style,
	children,
}: {
	variant?: "primary" | "ghost" | "danger";
	icon?: LucideIcon;
	/** Swaps the icon for a spinner and ignores clicks. */
	busy?: boolean;
	disabled?: boolean;
	onClick: () => void;
	style?: CSSProperties;
	children: ReactNode;
}) {
	const { theme } = useTheme();
	const [hover, setHover] = useState(false);
	const [pressed, setPressed] = useState(false);
	const blocked = disabled || busy;
	const fills: Record<typeof variant, { bg: string; fg: string; border: string }> = {
		primary: {
			bg: theme.colors.primary,
			fg: theme.colors.background,
			border: theme.colors.primary,
		},
		danger: {
			bg: theme.colors.error ?? "#e5534b",
			fg: theme.colors.background,
			border: theme.colors.error ?? "#e5534b",
		},
		ghost: {
			bg: "transparent",
			fg: theme.colors.text,
			border: theme.colors.border,
		},
	};
	const f = fills[variant];
	const interactive = !blocked;
	// Ghost has no fill to brighten, so it takes a visible hover wash. The
	// theme's own `backgroundHover` is nearly the dialog surface colour, so a
	// translucent tint of the button's own text/border colour reads better.
	const hoverBg =
		variant === "ghost"
			? tint(theme.colors.text ?? "#d0d6e0", 0.08)
			: f.bg;
	return (
		<button
			type="button"
			disabled={blocked}
			onClick={onClick}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => {
				setHover(false);
				setPressed(false);
			}}
			onMouseDown={() => setPressed(true)}
			onMouseUp={() => setPressed(false)}
			style={{
				padding: variant === "ghost" ? "0 12px" : "0 14px",
				height: 32,
				borderRadius: 6,
				fontSize: theme.fontSizes[1],
				fontWeight: variant === "ghost" ? 400 : 500,
				fontFamily: theme.fonts.body,
				background: hover && interactive ? hoverBg : f.bg,
				color: f.fg,
				border: `1px solid ${f.border}`,
				cursor: blocked ? "default" : "pointer",
				opacity: blocked ? 0.6 : 1,
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				filter:
					interactive && pressed
						? "brightness(0.96)"
						: interactive && hover
							? variant === "ghost"
								? undefined
								: "brightness(1.07)"
							: undefined,
				// Pressed reads as "pushed in": drop the hover halo and recess
				// the face with a subtle inset top shadow instead of translating.
				boxShadow: interactive && pressed
					? "inset 0 1px 2px rgba(0,0,0,0.25)"
					: hover && interactive && variant !== "ghost"
						? `0 0 0 2px ${tint(f.border, 0.2)}`
						: undefined,
				transition:
					"background-color 120ms ease, filter 120ms ease, box-shadow 80ms ease",
				...style,
			}}
		>
			{busy ? (
				<Loader2 size={13} className="principal-studio-spin" />
			) : (
				Icon && <Icon size={13} />
			)}
			{children}
		</button>
	);
}
