# Reading Tracker

A small personal library for discovering books through [Open Library](https://openlibrary.org/), saving them to a reading shelf, and tracking reading progress. The browser talks only to this project's API; the API retrieves and normalizes Open Library data, while the personal shelf is stored in MySQL.

**Live demo:** [https://reading.viettech.click/](https://reading.viettech.click/)

### Screenshots

![Reading Tracker search page showing results for Sapiens](./screenshots/reading-tracker-search.png)

![Reading Tracker personal bookshelf with reading statistics and progress controls](./screenshots/reading-tracker-shelf.png)

> The application UI in the screenshot is currently in Vietnamese.

## Features

- Search Open Library by title or author, browse paginated results, and view book details, editions, covers, publication year, subjects, and page counts when available.
- Add a work to the personal shelf with an initial status: **Want to read**, **Reading**, or **Read**.
- Track the current page, progress percentage, rating, and a short note; filter the shelf by status and view reading statistics.
- Move reading status according to progress rules, including marking a book as read when the current page reaches its total page count.
- Keep shelf metadata as a snapshot so the shelf remains usable without fetching every book field again. Removing a book is a soft delete; adding it again restores its saved progress.
- Proxy book covers through the backend so the frontend does not call Open Library directly.

## Tech stack

| Area             | Technology                                                              |
| ---------------- | ----------------------------------------------------------------------- |
| Frontend         | Vue 3, TypeScript, Vue Router, TanStack Vue Query, Tailwind CSS 4, Vite |
| Backend          | Node.js 22, TypeScript, Express 5, Zod, Pino, `express-rate-limit`      |
| Database         | MySQL 8.4, Prisma 7, Prisma MariaDB adapter                             |
| Tests            | Vitest, Vue Test Utils, jsdom, Node.js test runner, Playwright          |
| Deployment       | Docker Compose, Nginx, PM2 Runtime, Certbot / Let's Encrypt             |
| External catalog | Open Library Search, Works, Editions, Authors, and Covers APIs          |

## Run locally

### Prerequisites

- Node.js 22.12 or newer
- npm 10 or newer
- Docker Engine/Desktop with Docker Compose

### Setup

From the repository root:

```powershell
Copy-Item .env.example .env
Copy-Item apps/api/.env.example apps/api/.env
npm install
npm run db:up
npm run db:generate
npm run db:migrate:deploy
npm run dev
```

The Vue development server runs at `http://localhost:5173`; the Express API listens on port `3000`. Vite proxies `/api` to `http://127.0.0.1:3000`, so the browser uses same-origin `/api` requests. Set `VITE_API_PROXY_TARGET` in the frontend environment when the local API runs at another address.

The root `.env.example` contains local-only MySQL credentials and the API connection URL. The API also loads `apps/api/.env`; check both example files if you change local ports or credentials. Do not expose these development defaults to the internet.

To stop the development database:

```powershell
npm run db:down
```

Use `npm run db:migrate -- --name <migration-name>` when creating a schema migration locally. Prisma Migrate Dev requires a database account that can create its shadow database.

## Architecture

This is a TypeScript monorepo with two workspaces. The API uses a modular-monolith structure: each feature owns its routes, controllers, schemas, and business logic; shelf persistence is isolated in a repository. Shared Express middleware handles request logging, validation, not-found responses, and errors.

```text
Browser (Vue SPA)
      │ same-origin /api requests
      ▼
Vite proxy (development) / Nginx (production)
      │
      ▼
Express API
  ├── books module ── Open Library client ── Open Library APIs
  ├── shelf module ── service ── repository ── Prisma ── MySQL
  └── health module
```

The frontend never contacts Open Library directly. The backend proxies covers and calls Open Library for search, work, edition, and author data. It maps provider responses into application DTOs and adds shelf flags to search/detail responses.

### Database

There is no account or user table: this demo has one shared personal shelf. A work can have at most one shelf row because `work_id` has a unique constraint. The row stores a metadata snapshot and reading state. `deleted_at` implements soft deletion and allows a later re-add to restore progress.

```mermaid
erDiagram
    SHELF_BOOKS {
        char id PK
        varchar work_id UK
        varchar edition_id
        varchar title
        json authors
        int cover_id
        int first_publish_year
        text description
        json subjects
        int total_pages "nullable"
        enum page_count_source "EDITION, MANUAL, nullable"
        int current_page
        enum status "WANT_TO_READ, READING, READ"
        int rating "nullable, 1-5"
        varchar note "nullable"
        datetime started_at "nullable"
        datetime finished_at "nullable"
        datetime deleted_at "nullable"
        datetime created_at
        datetime updated_at
    }
```

`total_pages` is nullable when no page count is available. A positive page count supplied by Open Library for the selected edition is marked `EDITION`; a manually supplied count is marked `MANUAL`. Edition-provided page counts cannot be edited. Progress is calculated from `current_page / total_pages` when a valid total is known.

### API conventions

- JSON success responses use `{ "data": ... }`; `DELETE` returns `204 No Content`, and cover requests return image bytes.
- Errors use `{ "error": { "code", "message", "details", "requestId" } }`.
- Validation errors return `400`; duplicate active shelf items return `409`; missing items return `404`; unexpected server or upstream failures return `5xx`.
- Open Library search is rate-limited to 30 requests per minute per client. Search results contain 20 items per page.

## REST API

All routes are prefixed with `/api`.

| Method   | Path                          | Purpose                                                                        | Typical response                             |
| -------- | ----------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| `GET`    | `/health`                     | Health check, including database connectivity                                  | `200`                                        |
| `GET`    | `/books?q={keyword}&page={n}` | Search Open Library; page starts at 1                                          | `200`, `400`, `429`, `502`                   |
| `GET`    | `/books/{workId}`             | Get work details and available editions                                        | `200`, `400`, `404`, `502`                   |
| `GET`    | `/covers/{coverId}`           | Fetch and proxy a cover image                                                  | `200` with image, `400`, `404`, `502`        |
| `GET`    | `/shelf`                      | List active shelf items; optional `?status=WANT_TO_READ\|READING\|READ`        | `200`                                        |
| `GET`    | `/shelf/stats`                | Return total, currently reading, and finished counts                           | `200`                                        |
| `POST`   | `/shelf`                      | Add a work; accepts `workId`, optional `editionId`, `status`, and `totalPages` | `201` added, `200` restored, `409` duplicate |
| `PATCH`  | `/shelf/{id}`                 | Update status, page count where allowed, current page, rating, or note         | `200`, `400`, `404`, `422`                   |
| `DELETE` | `/shelf/{id}`                 | Soft-delete a shelf item                                                       | `204`, `404`                                 |

Shelf status values are `WANT_TO_READ`, `READING`, and `READ`. Page counts and page updates are validated by the API; ratings are integers from 1 to 5 or `null`. The API applies the reading-state rules and timestamps when a book starts or finishes.

## Automated checks

Run API unit/contract tests and frontend component tests:

```powershell
npm test
```

Run the browser flow (search, add, finish, remove, and verify that cover requests stay behind `/api`):

```powershell
npx playwright install chromium
npm run test:e2e
```

Run API + MySQL integration tests only against the isolated database in `compose.test.yaml`:

```powershell
docker compose -f compose.test.yaml up -d --wait
$env:TEST_DATABASE_URL = "mysql://reader_test:reader_test_only@127.0.0.1:33316/reading_tracker_test"
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm run db:migrate:deploy
npm run test:integration
Remove-Item Env:TEST_DATABASE_URL
Remove-Item Env:DATABASE_URL
docker compose -f compose.test.yaml down
```

The integration suite refuses any database name other than `reading_tracker_test` and is skipped when `TEST_DATABASE_URL` is unset. The test Compose file uses separate local-only credentials and a separate named volume.

Run the delivery checks:

```powershell
npm run typecheck
npm run lint
npm run build
npm run format:check
```

## Production deployment

The production setup targets a Linux VPS and is deployed manually with Docker Compose. The VPS provider is not tied to the application. The production stack builds the Vue assets into an Nginx image, runs the Express API under PM2 Runtime, runs MySQL on the private Compose network, and uses a one-shot Prisma migration service before the API starts. Nginx serves the frontend and reverse-proxies `/api` to the API container. Certbot issues Let's Encrypt certificates.

### Initial deployment outline

1. Install Docker Engine and the Docker Compose plugin on the VPS. Point the application's DNS A record to the VPS and allow inbound TCP ports 80 and 443. Reserve AAAA records for a correctly configured IPv6 VPS.
2. Clone the repository and create the production environment file:

   ```sh
   cp deploy/production.env.example .env.production
   chmod 600 .env.production
   ```

3. Set `DOMAIN`, `LETSENCRYPT_EMAIL`, unique MySQL passwords, `DATABASE_URL`, and `OPEN_LIBRARY_USER_AGENT`. The database URL must use `db:3306` as its host and port; percent-encode reserved characters in its username or password. Keep MySQL off public ports.
4. Start MySQL, issue the initial certificate while port 80 is available, then build and start the application:

   ```sh
   docker compose --env-file .env.production -f compose.prod.yaml up -d db
   docker compose --env-file .env.production -f compose.prod.yaml run --rm --service-ports certbot
   docker compose --env-file .env.production -f compose.prod.yaml up -d --build
   ```

5. Check `https://<your-domain>/api/health` for HTTP 200 and open the site over HTTPS.

For later releases, pull the intended Git revision, build the `migrate`, `api`, and `web` images, then recreate services with Compose. The API waits for the migration job to finish successfully. Certificate renewal and MySQL backups need scheduled VPS jobs; the repository does not currently install those schedules automatically.

## Assumptions and limitations

- The application has no authentication. Anyone who can reach the deployed domain can view and change the same shelf. Restrict access at the firewall or reverse proxy if it is intended for personal use only.
- This app tracks books; it does not provide full book text or an e-reader. Open Library metadata, cover availability, edition page counts, and service availability can vary by record.
- If an edition has no known page count, progress percentage cannot be calculated until a manual positive page count is provided. A page count supplied by Open Library for an edition is locked against manual changes.
- A shelf row represents an Open Library work, not each physical or digital copy. Re-adding a soft-deleted work restores its previous progress, rating, and note.
- Deployment is manual. There is no CI/CD pipeline, scheduled certificate-renewal job, or automated off-site backup job in the repository.

## Possible next steps

- Add authentication and per-user shelves before opening the app to multiple users.
- Add CI to run typecheck, lint, builds, automated tests, and a staging deployment on each change.
- Schedule certificate renewal and encrypted off-site database backups, with tested restore procedures.
- Add monitoring and alerting for API errors, database health, and Open Library failures; consider caching catalog responses to reduce dependence on upstream availability.
- Add a staging smoke test and broader browser coverage for detail, validation, and shelf editing flows.
