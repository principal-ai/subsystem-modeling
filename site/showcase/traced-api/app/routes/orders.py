"""HTTP boundary for orders — each handler opens a span and records events."""
from fastapi import APIRouter, HTTPException
from opentelemetry import trace

from ..services.order_service import get_order, create_order

router = APIRouter()
tracer = trace.get_tracer("traced-api.routes")


@router.get("/orders/{order_id}")
async def read_order(order_id: str):
    with tracer.start_as_current_span("orders.read") as span:
        span.set_attribute("order.id", order_id)
        span.add_event("orders.read.started")
        order = await get_order(order_id)
        if order is None:
            span.add_event("orders.read.miss")
            raise HTTPException(status_code=404, detail="not found")
        span.add_event("orders.read.hit")
        return order


@router.post("/orders")
async def post_order(body: dict):
    with tracer.start_as_current_span("orders.create") as span:
        span.set_attribute("order.items", len(body.get("items", [])))
        span.add_event("orders.create.started")
        order = await create_order(body)
        span.add_event("orders.create.completed", {"order.id": order["id"]})
        return order
