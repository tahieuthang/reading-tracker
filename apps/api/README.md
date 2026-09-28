# API

Copy `.env.example` to `.env` in this folder for local development. The Prisma config loads this file when commands run from the API workspace.

The initial route is `GET /api/health`; it returns 200 when the API can query MySQL and 503 when the database is unavailable.

## Open Library routes

- `GET /api/books?q=<keyword>&page=<number>` searches the Open Library Search API. The API normalizes each record, always requests 20 items per page, and adds `inShelf` and `hasArchivedProgress` from MySQL.
- `GET /api/books/:workId` returns work metadata, authors, subjects, and up to 50 editions with available page counts.
- `GET /api/covers/:coverId` proxies a medium cover image. Browser caching is set to one day.

Open Library calls use a 5-second timeout. Successful search results are cached for 60 seconds; work, edition, and author responses are cached for 5 minutes. Search is limited to 30 requests per minute per API process. The rate limiter is in memory and is not shared across multiple API workers.

Set `OPEN_LIBRARY_USER_AGENT` in this file to an application name and contact address before deployment. The backend is the only code that calls `openlibrary.org` or `covers.openlibrary.org`; the frontend uses the `/api` routes.

## Shelf routes

- `GET /api/shelf?status=WANT_TO_READ|READING|READ` lists active shelf entries. Omit `status` to list every active entry.
- `GET /api/shelf/stats` returns `totalBooks`, `readingBooks`, and `readBooks`.
- `POST /api/shelf` accepts `workId`, optional initial `status`, and optional `editionId` or manual `totalPages`. It returns 201 for a new entry, 200 when restoring a soft-deleted entry, and 409 for an active duplicate.
- `PATCH /api/shelf/:id` accepts a partial update of `status`, `totalPages`, `currentPage`, `rating`, and `note`.
- `DELETE /api/shelf/:id` soft-deletes an entry and returns 204. Adding that work again restores the previous progress.

Shelf routes validate request data, services implement business rules, and `shelf-repository.ts` owns Prisma access. Book search uses the same repository for shelf flags. Reading progress may jump to any valid page; reaching the total page count marks the book read.

Run the business-rule tests with `npm test`.
