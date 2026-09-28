# API

Copy `.env.example` to `.env` in this folder for local development. The Prisma config loads this file when commands run from the API workspace.

The initial route is `GET /api/health`; it returns 200 when the API can query MySQL and 503 when the database is unavailable.
