"""
Traced orders API — FastAPI entry + OpenTelemetry setup.

OTLP export is configured once at process start; handlers and services
create child spans that flow to the collector (Jaeger/Honeycomb/etc.).
"""
from fastapi import FastAPI
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from .routes.orders import router as orders_router
from .telemetry import setup_tracing


def create_app() -> FastAPI:
    setup_tracing(service_name="traced-api")
    app = FastAPI(title="Traced orders API")
    app.include_router(orders_router)
    FastAPIInstrumentor.instrument_app(app)
    return app


app = create_app()
