-- Mart: daily order facts for analytics consumers.
select
  date_trunc('day', created_at) as order_day,
  count(*) as order_count,
  sum(amount_cents) as revenue_cents
from {{ ref('stg_orders') }}
where status = 'confirmed'
group by 1
