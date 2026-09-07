/**
 * ChangeTypeVisual — a hand-drawn SVG visual for each concept change type,
 * styled like an engineering blueprint.
 *
 * Each visual is a drafting "sheet": a navy grid backdrop, cyan linework,
 * dimension/leader lines with measurement ticks, right-angle and center
 * registration marks, and uppercase technical labels. It grounds the viewer
 * in the category (execution / derive / integration / ui) before
 * the concept's specific mermaid diagram is revealed.
 */

import type { Theme } from "@principal-ade/industry-theme";
import type { ChangeType } from "../concepts";

interface Props {
	changeType: ChangeType;
	theme: Theme;
	/** CSS height the SVG should render at. Width follows from the viewBox. */
	height?: number;
}

const W = 220;
const H = 140;

interface Bp {
	sheet: string; // blueprint navy background
	grid: string; // faint crosshatch
	line: string; // primary cyan linework
	bright: string; // labels / highlights
	dim: string; // faded helper lines
}

function blueprint(theme: Theme): Bp {
	const c = theme.colors;
	const line = c.info ?? "#3b82f6";
	return {
		sheet: "#0a1d3a",
		grid: "rgba(125, 211, 252, 0.10)",
		line,
		bright: c.textSecondary ?? "#e0f2fe",
		dim: "rgba(142, 203, 255, 0.5)",
	};
}

function ArrowHead({ id, color }: { id: string; color: string }) {
	return (
		<marker
			id={id}
			viewBox="0 0 10 10"
			refX="8.5"
			refY="5"
			markerWidth="6"
			markerHeight="6"
			orient="auto-start-reverse"
		>
			<path d="M0 0 L10 5 L0 10 z" fill={color} />
		</marker>
	);
}

/** A drafting registration mark — a crosshair used at sheet corners. */
function Reg({ x, y, color }: { x: number; y: number; color: string }) {
	return (
		<g stroke={color} strokeWidth="1">
			<line x1={x - 4} y1={y} x2={x + 4} y2={y} />
			<line x1={x} y1={y - 4} x2={x} y2={y + 4} />
		</g>
	);
}

/** A center crosshair used to mark a circle's origin (like a drafter). */
function Center({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
	return (
		<g stroke={color} strokeWidth="0.8">
			<line x1={cx - r} y1={cy} x2={cx + r} y2={cy} />
			<line x1={cx} y1={cy - r} x2={cx} y2={cy + r} />
		</g>
	);
}

/** A right-angle marker (the little ∟ square) at a corner. */
/** A dimension line with end ticks + a centered label. */
function Dim({
	x1,
	y1,
	x2,
	y2,
	label,
	color,
}: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	label?: string;
	color: string;
}) {
	const len = Math.hypot(x2 - x1, y2 - y1) || 1;
	const nx = -(y2 - y1) / len;
	const ny = (x2 - x1) / len;
	const t = 4;
	return (
		<g>
			<line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.8" />
			<line x1={x1 - nx * t} y1={y1 - ny * t} x2={x1 + nx * t} y2={y1 + ny * t} stroke={color} strokeWidth="1.1" />
			<line x1={x2 - nx * t} y1={y2 - ny * t} x2={x2 + nx * t} y2={y2 + ny * t} stroke={color} strokeWidth="1.1" />
			{label && (
				<text
					x={(x1 + x2) / 2}
					y={(y1 + y2) / 2 - ny * 9}
					textAnchor="middle"
					fill={color}
					fontSize="8"
					fontFamily="ui-monospace, monospace"
					letterSpacing="0.5"
				>
					{label}
				</text>
			)}
		</g>
	);
}

/** A leader line from a dot to a label. */
/** The blueprint sheet: navy grid, hairline border, corner registration marks. */
function Sheet({
	id,
	bp,
	title,
	children,
}: {
	id: string;
	bp: Bp;
	/** Short blueprint-style title block rendered in the top-left corner. */
	title?: string;
	children: React.ReactNode;
}) {
	return (
		<svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} fill="none">
			<defs>
				<pattern id={`${id}-grid`} width="10" height="10" patternUnits="userSpaceOnUse">
					<rect x="0" y="0" width="10" height="10" fill="none" stroke={bp.grid} strokeWidth="0.5" />
				</pattern>
				<ArrowHead id={`${id}-arrow`} color={bp.line} />
			</defs>
			<rect width={W} height={H} fill={bp.sheet} />
			<rect width={W} height={H} fill={`url(#${id}-grid)`} />
			<rect
				x="1"
				y="1"
				width={W - 2}
				height={H - 2}
				fill="none"
				stroke={bp.line}
				strokeOpacity="0.6"
				strokeWidth="1"
				shapeRendering="crispEdges"
			/>
			<Reg x={10} y={10} color={bp.line} />
			<Reg x={W - 10} y={10} color={bp.line} />
			<Reg x={10} y={H - 10} color={bp.line} />
			<Reg x={W - 10} y={H - 10} color={bp.line} />
			{title && (
				<g>
					{(() => {
						const label = title.toUpperCase();
						const w = label.length * 7 + 14;
						const cx = W / 2;
						return (
							<>
								<rect
									x={cx - w / 2}
									y="5"
									width={w}
									height="20"
									fill="none"
									stroke={bp.line}
									strokeWidth="1"
								/>
								<text
									x={cx}
									y="18"
									textAnchor="middle"
									fill={bp.bright}
									fontSize="9"
									fontFamily="ui-monospace, monospace"
									letterSpacing="1"
								>
									{label}
								</text>
							</>
						);
					})()}
				</g>
			)}
			{children}
		</svg>
	);
}

function DeriveVisual({ t }: { t: Theme }) {
	const bp = blueprint(t);
	return (
		<Sheet id="bp-derive" bp={bp} title="Data Flow">
			{/* one solid source, three identical empty receptors — same value everywhere */}
			<rect x="30" y="50" width="40" height="40" fill={bp.line} opacity="0.9" />
			<rect x="160" y="30" width="20" height="20" fill="none" stroke={bp.line} strokeWidth="1.2" />
			<rect x="170" y="60" width="20" height="20" fill="none" stroke={bp.line} strokeWidth="1.2" />
			<rect x="160" y="90" width="20" height="20" fill="none" stroke={bp.line} strokeWidth="1.2" />
			{/* projection guides */}
			<path d="M72 62 L156 40" fill="none" stroke={bp.dim} strokeWidth="0.9" strokeDasharray="3 4" markerEnd="url(#bp-derive-arrow)" />
			<path d="M72 70 L166 70" fill="none" stroke={bp.dim} strokeWidth="0.9" strokeDasharray="3 4" markerEnd="url(#bp-derive-arrow)" />
			<path d="M72 78 L156 100" fill="none" stroke={bp.dim} strokeWidth="0.9" strokeDasharray="3 4" markerEnd="url(#bp-derive-arrow)" />
			{/* centre crosshairs: every receptor carries the same origin */}
			<Center cx={170} cy={40} r={8} color={bp.line} />
			<Center cx={180} cy={70} r={8} color={bp.line} />
			<Center cx={170} cy={100} r={8} color={bp.line} />
			{/* dimension */}
			<Dim x1={30} y1={120} x2={190} y2={120} label="" color={bp.bright} />
		</Sheet>
	);
}

function SequenceVisual({ t }: { t: Theme }) {
	const bp = blueprint(t);
	const rows = [
		{ y: 40, x: 110, label: "A" },
		{ y: 70, x: 60, label: "B" },
		{ y: 100, x: 150, label: "C" },
	];
	return (
		<Sheet id="bp-execution" bp={bp} title="Execution">
			{/* three horizontal lines, one per row */}
			{rows.map((r) => (
				<g key={r.label}>
					<line x1="24" y1={r.y} x2="196" y2={r.y} stroke={bp.line} strokeWidth="1" />
					<rect x={r.x - 10} y={r.y - 10} width="20" height="20" fill={bp.sheet} stroke={bp.line} strokeWidth="1.4" />
					<text
						x={r.x}
						y={r.y + 4}
						textAnchor="middle"
						fill={bp.bright}
						fontSize="10"
						fontFamily="ui-monospace, monospace"
					>
						{r.label}
					</text>
				</g>
			))}
			{/* dimension */}
			<Dim x1={20} y1={120} x2={200} y2={120} label="" color={bp.bright} />
		</Sheet>
	);
}

	function IntegrationVisual({ t }: { t: Theme }) {
	const bp = blueprint(t);
	const cy = 70;
	const r = 20;
	// male solid hexagon (left) seating into a female hexagon frame (right)
	// whose left face is cut away so the male enters it.
	const male = { cx: 104, cy };
	const female = { cx: 116, cy };
	const hex = (cx: number, cy: number, rr: number) =>
		`M${cx - rr} ${cy} L${cx - rr / 2} ${cy - rr * 0.866} L${cx + rr / 2} ${cy - rr * 0.866} L${cx + rr} ${cy} L${cx + rr / 2} ${cy + rr * 0.866} L${cx - rr / 2} ${cy + rr * 0.866} Z`;
	// female outline: right vertex → top-right → top-left, then open; and
	// right vertex → bottom-right → bottom-left, then open (left face cut).
	const femaleOpen = (cx: number, cy: number, rr: number) =>
		`M${cx + rr} ${cy} L${cx + rr / 2} ${cy - rr * 0.866} L${cx - rr / 2} ${cy - rr * 0.866} M${cx + rr} ${cy} L${cx + rr / 2} ${cy + rr * 0.866} L${cx - rr / 2} ${cy + rr * 0.866}`;
	return (
		<Sheet id="bp-integration" bp={bp} title="Integration">
			{/* female — hexagon outline frame, left face open */}
			<path d={femaleOpen(female.cx, female.cy, r)} fill="none" stroke={bp.bright} strokeWidth="1.4" />
			{/* male — solid hexagon, overlapping into the open frame */}
			<path d={hex(male.cx, male.cy, r * 0.72)} fill={bp.line} />
			{/* dimension */}
			<Dim x1={male.cx - r} y1={120} x2={female.cx + r} y2={120} label="" color={bp.bright} />
		</Sheet>
	);
}

function UiVisual({ t }: { t: Theme }) {
	const bp = blueprint(t);
	return (
		<Sheet id="bp-ui" bp={bp} title="UI">
			{/* a viewport frame: the surface being built */}
			<rect x="40" y="34" width="140" height="72" fill="none" stroke={bp.line} strokeWidth="1.4" />
			{/* title bar strip */}
			<line x1="40" y1="50" x2="180" y2="50" stroke={bp.line} strokeWidth="1" />
			{/* content blocks inside the frame */}
			<rect x="50" y="58" width="40" height="40" fill="none" stroke={bp.line} strokeWidth="1.2" />
			<line x1="100" y1="66" x2="170" y2="66" stroke={bp.dim} strokeWidth="1" />
			<line x1="100" y1="76" x2="170" y2="76" stroke={bp.dim} strokeWidth="1" />
			<line x1="100" y1="86" x2="150" y2="86" stroke={bp.dim} strokeWidth="1" />
			{/* dimension */}
			<Dim x1={40} y1={120} x2={180} y2={120} label="" color={bp.bright} />
		</Sheet>
	);
}

export function ChangeTypeVisual({ changeType, theme, height = 240 }: Props) {
	const visual = {
		execution: <SequenceVisual t={theme} />,
		derive: <DeriveVisual t={theme} />,
		integration: <IntegrationVisual t={theme} />,
		ui: <UiVisual t={theme} />,
	}[changeType];
	const width = Math.round((height * W) / H);
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
			<div style={{ width, height }}>{visual}</div>
		</div>
	);
}
