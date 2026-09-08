"""
Process-wide OpenTelemetry setup — TracerProvider + OTLP export.

At runtime, start_as_current_span / add_event record into this provider;
BatchSpanProcessor ships finished spans to the collector.
"""
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# Module-level provider — the in-process sink every tracer writes into.
provider: TracerProvider | None = None


def setup_tracing(service_name: str) -> TracerProvider:
    global provider
    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter()  # OTEL_EXPORTER_OTLP_ENDPOINT in real deploys
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    return provider
