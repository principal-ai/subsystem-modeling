"""Business rules — child spans + events for DB and payment capture."""
from opentelemetry import trace

from ..db import orders_repo
from ..clients.payments import capture_payment

tracer = trace.get_tracer("traced-api.service")


async def get_order(order_id: str) -> dict | None:
    with tracer.start_as_current_span("OrderService.get") as span:
        span.add_event("service.get.begin")
        order = await orders_repo.find_by_id(order_id)
        span.add_event("service.get.done", {"found": order is not None})
        return order


async def create_order(body: dict) -> dict:
    with tracer.start_as_current_span("OrderService.create") as span:
        span.add_event("service.create.begin")
        payment = await capture_payment(body["amount_cents"])
        span.set_attribute("payment.id", payment["id"])
        span.add_event("service.payment_captured", {"payment.id": payment["id"]})
        order = await orders_repo.insert(
            {
                "items": body["items"],
                "amount_cents": body["amount_cents"],
                "payment_id": payment["id"],
            }
        )
        span.add_event("service.create.persisted", {"order.id": order["id"]})
        return order
