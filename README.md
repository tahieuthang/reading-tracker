# Reading Tracker

Single-shelf reading tracker. Implementation is delivered in reviewed stages; see [PLAN.md](./PLAN.md), [the Phase 0 review](./docs/PHASE-0-REVIEW.md), [the Phase 1 review](./docs/PHASE-1-REVIEW.md), [the Phase 2 review](./docs/PHASE-2-REVIEW.md), [the Phase 3 review](./docs/PHASE-3-REVIEW.md), and [the Phase 4 review](./docs/PHASE-4-REVIEW.md).

## Prerequisites

- Node.js 22.12 or newer
- npm 10 or newer
- Docker Compose

## Local setup

1. Copy `.env.example` to `.env` at the repository root.
2. Copy `apps/api/.env.example` to `apps/api/.env`.
3. Run `npm install`.
4. Start MySQL with `npm run db:up`.
5. Generate Prisma Client and apply the committed migrations:

   ```powershell
   npm run db:generate
   npm run db:migrate:deploy
   ```

Use `npm run db:migrate -- --name <migration-name>` only when authoring a schema change locally; Prisma Migrate Dev needs a database account that can create its shadow database.

6. Start the API and Vue dev server with `npm run dev`.

Run the backend shelf-rule tests with `npm test`.

The Vite server proxies `/api` to the API on port 3000. Set `VITE_API_PROXY_TARGET` in the frontend environment to use another local API address. The initial API route is `GET /api/health`.

Production Docker, Nginx, HTTPS, migration, and database backup/restore instructions are in [deploy/README.md](./deploy/README.md).

## Local database defaults

The committed `.env.example` uses local-only development credentials. Replace them before exposing any service outside your machine.
