-- Staging: clean raw order rows from the warehouse source.
select
  id as order_id,
  customer_id,
  cast(amount_cents as integer) as amount_cents,
  status,
  cast(created_at as timestamp) as created_at
from {{ source('raw', 'orders') }}
where status is not null
