"""Persistence — query spans under the active request context."""
from opentelemetry import trace

tracer = trace.get_tracer("traced-api.db")

# Showcase stand-in; a real app would use asyncpg/SQLAlchemy + instrumentor.
_ORDERS: dict[str, dict] = {}


class orders_repo:
    @staticmethod
    async def find_by_id(order_id: str) -> dict | None:
        with tracer.start_as_current_span("db.orders.find") as span:
            span.set_attribute("db.system", "postgres")
            span.set_attribute("db.operation", "SELECT")
            span.add_event("db.query.execute")
            row = _ORDERS.get(order_id)
            span.add_event("db.query.done", {"row_count": 0 if row is None else 1})
            return row

    @staticmethod
    async def insert(row: dict) -> dict:
        with tracer.start_as_current_span("db.orders.insert") as span:
            span.set_attribute("db.system", "postgres")
            span.set_attribute("db.operation", "INSERT")
            span.add_event("db.query.execute")
            order_id = f"ord_{len(_ORDERS) + 1}"
            saved = {"id": order_id, **row}
            _ORDERS[order_id] = saved
            span.add_event("db.query.done", {"order.id": order_id})
            return saved
