"""
Downstream payments capture — separate process from orders-api.
Continues the inbound W3C trace.
"""

from opentelemetry import trace

tracer = trace.get_tracer(__name__)


def handle_capture(amount: int, traceparent: str | None = None) -> str:
    with tracer.start_as_current_span("payments.handle") as span:
        span.set_attribute("payment.amount", amount)
        # Showcase stand-in — real code would authorize with a processor.
        return f"pay_{amount}"
