// Sales figures for the dashboard. Cancelled orders are never counted as sales.
// Days and hours are counted in the shop's time zone (TZ, default Asia/Karachi).
const { query } = require('../db/pool');
const config = require('../config');

const ts = n => `to_timestamp($${n} / 1000.0)`;

async function summary(from, to) {
  const { rows: [r] } = await query(`
    SELECT COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'), 0)::int AS revenue,
           COUNT(*) FILTER (WHERE status <> 'cancelled')::int               AS orders,
           COUNT(*) FILTER (WHERE status = 'cancelled')::int                AS cancelled
    FROM orders WHERE created_at >= ${ts(1)} AND created_at < ${ts(2)}`, [from, to]);
  return { ...r, avg: r.orders ? Math.round(r.revenue / r.orders) : 0 };
}

const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** month: 'YYYY-MM' (defaults to the current month) */
async function forDashboard(month) {
  const now = new Date();
  const nowMs = now.getTime();
  const tz = config.timeZone;

  // Today so far, compared with yesterday up to the same time of day
  const todayStart = startOfDay(now);
  const yStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

  // Selected month, compared with the previous month over the same number of days
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  const year = m ? Number(m[1]) : now.getFullYear();
  const mon = m ? Number(m[2]) - 1 : now.getMonth();
  const monthStart = new Date(year, mon, 1).getTime();
  const monthEnd = new Date(year, mon + 1, 1).getTime();
  const isCurrentMonth = monthStart <= nowMs && nowMs < monthEnd;
  const periodEnd = isCurrentMonth ? nowMs + 1 : monthEnd;
  const prevStart = new Date(year, mon - 1, 1).getTime();
  const prevEnd = Math.min(prevStart + (periodEnd - monthStart), monthStart);

  const [today, yesterdaySameTime, monthSummary, previous, daily, split, topItems, hours, active] = await Promise.all([
    summary(todayStart, nowMs + 1),
    summary(yStart, yStart + (nowMs - todayStart)),
    summary(monthStart, monthEnd),
    summary(prevStart, prevEnd),
    query(`
      SELECT EXTRACT(DAY FROM created_at AT TIME ZONE $3)::int AS day,
             SUM(total)::int AS revenue, COUNT(*)::int AS orders
      FROM orders
      WHERE created_at >= ${ts(1)} AND created_at < ${ts(2)} AND status <> 'cancelled'
      GROUP BY 1`, [monthStart, monthEnd, tz]),
    query(`
      SELECT COUNT(*) FILTER (WHERE type = 'pickup')::int   AS pickup,
             COUNT(*) FILTER (WHERE type = 'delivery')::int AS delivery,
             COUNT(*) FILTER (WHERE source = 'web')::int    AS web,
             COUNT(*) FILTER (WHERE source = 'phone')::int  AS phone
      FROM orders
      WHERE created_at >= ${ts(1)} AND created_at < ${ts(2)} AND status <> 'cancelled'`, [monthStart, monthEnd]),
    query(`
      SELECT i.name, SUM(i.qty)::int AS qty, SUM(i.line_total)::int AS revenue
      FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.created_at >= ${ts(1)} AND o.created_at < ${ts(2)} AND o.status <> 'cancelled'
      GROUP BY i.name ORDER BY revenue DESC LIMIT 6`, [monthStart, monthEnd]),
    query(`
      SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE $2)::int AS hour, COUNT(*)::int AS orders
      FROM orders
      WHERE created_at >= ${ts(1)} AND status <> 'cancelled'
      GROUP BY 1`, [nowMs - 30 * 86400e3, tz]),
    query(`SELECT COUNT(*)::int AS n FROM orders WHERE status IN ('new', 'preparing', 'ready')`),
  ]);

  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const byDay = new Map(daily.rows.map(r => [r.day, r]));
  const hourly = Array(24).fill(0);
  hours.rows.forEach(r => { hourly[r.hour] = r.orders; });

  return {
    generated_at: nowMs,
    today,
    yesterdaySameTime,
    month: {
      year, month: mon + 1, isCurrentMonth, ...monthSummary, previous,
      daily: Array.from({ length: daysInMonth }, (_, i) => {
        const d = byDay.get(i + 1);
        return { day: i + 1, revenue: d ? d.revenue : 0, orders: d ? d.orders : 0 };
      }),
      split: split.rows[0],
      topItems: topItems.rows,
    },
    hours: hourly,
    active: active.rows[0].n,
  };
}

module.exports = { forDashboard };
