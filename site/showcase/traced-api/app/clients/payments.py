"""
Outbound payment call — span + event, then inject W3C trace context
so the downstream service continues the same trace.
"""
from opentelemetry import trace
from opentelemetry.propagate import inject

tracer = trace.get_tracer("traced-api.payments")


async def capture_payment(amount_cents: int) -> dict:
    with tracer.start_as_current_span("payments.capture") as span:
        span.set_attribute("payment.amount_cents", amount_cents)
        span.add_event("payments.capture.requested")
        headers: dict[str, str] = {}
        inject(headers)  # propagate trace context to the downstream API
        # await httpx.post(PAYMENTS_URL, json={...}, headers=headers)
        _ = headers
        span.add_event("payments.capture.succeeded", {"payment.id": "pay_1"})
        return {"id": "pay_1", "status": "succeeded", "amount_cents": amount_cents}
