import {
	context,
	SpanKind,
	SpanStatusCode,
	trace,
	type Attributes,
	type Span,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
	BatchSpanProcessor,
	BasicTracerProvider,
} from "@opentelemetry/sdk-trace-base";

const DEFAULT_OTLP_TRACES_ENDPOINT = "http://localhost:4318/v1/traces";
let initialized = false;

interface TelemetryGlobals {
	process?: { env?: Record<string, string | undefined> };
	__PRINCIPAL_OTLP_TRACES_ENDPOINT__?: string;
	__PRINCIPAL_TELEMETRY_DISABLED__?: boolean;
}

function telemetryGlobals(): TelemetryGlobals {
	return globalThis as typeof globalThis & TelemetryGlobals;
}

function tracesEndpoint(): string {
	const globals = telemetryGlobals();
	const env = globals.process?.env ?? {};
	const tracesEndpoint = env["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"]?.trim();
	if (tracesEndpoint) return tracesEndpoint.replace(/\/+$/, "");

	const baseEndpoint =
		globals.__PRINCIPAL_OTLP_TRACES_ENDPOINT__?.trim() ||
		env["PRINCIPAL_TELEMETRY_ENDPOINT"]?.trim() ||
		env["OTEL_EXPORTER_OTLP_ENDPOINT"]?.trim() ||
		DEFAULT_OTLP_TRACES_ENDPOINT;
	const normalized = baseEndpoint.replace(/\/+$/, "");
	if (normalized.endsWith("/v1/traces")) return normalized;
	return `${normalized}/v1/traces`;
}

/** Initialize one bounded OTLP exporter in the host, renderer, or worker process. */
export function initializeStudioTelemetry(serviceName: string): void {
	if (initialized) return;
	const globals = telemetryGlobals();
	const env = globals.process?.env ?? {};
	if (
		globals.__PRINCIPAL_TELEMETRY_DISABLED__ === true ||
		env["OTEL_SDK_DISABLED"] === "true" ||
		env["DISABLE_TELEMETRY"] === "true" ||
		env["PRINCIPAL_TELEMETRY_ENABLED"] === "false"
	) {
		initialized = true;
		return;
	}

	try {
		const exporter = new OTLPTraceExporter({
			url: tracesEndpoint(),
			timeoutMillis: 1_500,
		});
		const provider = new BasicTracerProvider({
			resource: resourceFromAttributes({
				"service.name": serviceName,
				"service.namespace": "principal",
			}),
			spanProcessors: [
				new BatchSpanProcessor(exporter, {
					maxQueueSize: 100,
					maxExportBatchSize: 20,
					scheduledDelayMillis: 1_000,
					exportTimeoutMillis: 1_500,
				}),
			],
		});
		trace.setGlobalTracerProvider(provider);
	} catch {
		// Telemetry is best-effort; exporter setup must never block Studio startup.
	} finally {
		initialized = true;
	}
}

export function studioTracer() {
	return trace.getTracer("principal.subsystems-studio");
}

export async function withStudioSpan<T>(
	name: string,
	options: {
		kind?: SpanKind;
		attributes?: Attributes;
	},
	operation: (span: Span) => Promise<T> | T,
): Promise<T> {
	const span = studioTracer().startSpan(
		name,
		{ kind: options.kind, attributes: options.attributes },
		context.active(),
	);
	try {
		return await operation(span);
	} catch (error) {
		span.setAttribute(
			"error.type",
			error instanceof Error ? error.name : "Error",
		);
		span.setStatus({ code: SpanStatusCode.ERROR });
		throw error;
	} finally {
		span.end();
	}
}
