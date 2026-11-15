# Butts Kitchen

The ordering website and kitchen dashboard for Butts Kitchen. Customers order online and follow their order live; the owner sees orders arrive in real time, moves them through the kitchen, and tracks sales.

**Stack:** Node.js 22 · Express 5 · PostgreSQL · plain HTML/CSS/JavaScript (no build step) · live updates with Server-Sent Events

## Features

**Customers** (`/`)
- The menu with portion choices (Single, Double or Family karahi, for example), sold-out labels, and live prices
- A cart that's remembered on the device, plus a two-step checkout: dishes, then details
- Pickup or delivery, paid in cash on delivery
- A live tracking page (`/track/:code`): Received → Preparing → Out for delivery or Ready → Delivered or Picked up

**Kitchen** (`/admin`, PIN protected)
- **Live orders:** new orders appear instantly with a chime. Orders move between New, Preparing and Ready columns, and every step can be undone. Timers flag orders that are waiting too long. Phone orders can be added by hand.
- **History:** search, filter by date and status, and export to CSV
- **Sales:** today against yesterday at the same time, and the month against last month; sales by day, best-selling dishes, busiest hours, and delivery/pickup and online/phone splits
- **Menu:** sold-out switches, price editing, the delivery fee, and pausing online orders

## Project structure

```
src/
  server.js            entry point: runs migrations, starts the server
  app.js               Express app: middleware, routes, error handling
  config.js            reads environment variables
  db/
    pool.js            PostgreSQL connection pool + transaction helper
    schema.sql         tables, constraints, indexes
    migrate.js         applies schema.sql and seeds the menu
    menu-seed.js       the starting menu (from the printed menu)
  models/              all SQL lives here: orders, menu, settings, stats
  routes/              public.js (customers), admin.js (kitchen)
  middleware/          auth (PIN + signed cookie), rate limiting
  services/live.js     Server-Sent Events for real-time updates
  lib/                 validation, error types
public/                pages, styles, browser scripts
scripts/               sample data, clear orders
```

## Run locally

You need **Node.js 22.9+** and a **PostgreSQL** database. That can be a local install, or a free Neon database (see below), which also works for local development.

```bash
npm install
cp .env.example .env      # then set DATABASE_URL
npm start
```

- Customer site: http://localhost:3000
- Kitchen dashboard: http://localhost:3000/admin (PIN from `ADMIN_PIN`, default `1234`)

The tables and the menu are created automatically on first start.

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-restart on file changes |
| `npm run db:migrate` | Create or update the tables without starting the server |
| `npm run db:seed-demo` | Add about 7 weeks of sample orders (for demos) |
| `npm run db:clear-orders` | Delete all orders but keep the menu and settings |

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `ADMIN_PIN` | yes, in production | Kitchen PIN (defaults to `1234`) |
| `SESSION_SECRET` | recommended | Signs kitchen sessions |
| `TZ` | no | Time zone for sales days (default `Asia/Karachi`) |
| `PORT` | no | Defaults to `3000` (hosts set this for you) |

## Deploy for free: Render + Neon

**1. Database (Neon, free PostgreSQL).** Sign up at neon.tech and create a project, choosing the region closest to your customers. Copy the **connection string** (`postgresql://…?sslmode=require`).

**2. Code (GitHub).** Push this project to a GitHub repository. `.env` and `node_modules` are already excluded.

**3. Web server (Render).** Sign up at render.com with GitHub. Choose **New → Blueprint** and select the repository; `render.yaml` sets everything up. When asked, enter `DATABASE_URL` (from Neon) and `ADMIN_PIN`, then deploy. The site will be at `https://<name>.onrender.com`.

**Free-tier behaviour.** Render's free server sleeps after 15 minutes without traffic, and the first request after that takes up to about a minute. Orders are safe in Postgres either way. To avoid the wait, point a free uptime monitor such as UptimeRobot at `/health` every 10 minutes; Render's 750 free hours a month cover one always-on service. Render's paid Starter plan (about US$7 a month) removes sleeping entirely, with no code changes.

**Netlify.** The app also runs on [Netlify Server](https://docs.netlify.com/build/server/) (Early Access, needs Node.js 24): `netlify.toml` and `netlify/server/index.mjs` are set up, and the build (`npm run build:server`) bundles the server and its dependencies into one file. In Netlify, add `DATABASE_URL`, `ADMIN_PIN` and `SESSION_SECRET` under Site configuration → Environment variables (scope must include Functions), then redeploy. The free plan runs one instance that stops after 5 minutes without visitors, so the first visit after that is slower.

**Other hosts.** Any Node.js host with a PostgreSQL database works: Railway, Fly.io, a VPS, and so on.

## Notes

- Prices are always calculated on the server from the database, never taken from the browser.
- Order lines store the dish name and price at the time of ordering, so editing the menu never changes past orders.
- Sales figures exclude cancelled orders.
