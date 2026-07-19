# Editor CRM

A simple client management dashboard for freelance video editing work.

- **Dashboard** → list of clients
- **Client page** → a Finder/Frame.io-style file browser: nested folders you create and organize however you want, with video cards (footage link, reference links, instructions, final export link, status, price, paid) inside them
- **Client Portal link** → one public URL per client showing their whole folder tree; clients can create/rename/move/delete folders and move videos between them, but can't edit or delete a video itself
- **Single video share link** → each video also has its own public URL for sharing just one deliverable
- **AI Assistant** → a persistent chat panel on every page. It can create/edit clients, folders, and videos, summarize a pasted client message into instructions, and answer questions about your data — it cannot delete anything

Every change — whether made in the UI or by the AI assistant — refreshes the page live via a `crm:data-changed` browser event, so the AI editing a client you're currently viewing shows up immediately.

Everything else (the dashboard itself) is behind a single shared passphrase, since it holds all your client links in one place.

## Stack

- Frontend: React + Vite + Tailwind
- Backend: a single Cloudflare Worker (`worker/index.ts`) handling `/api/*`, serving the built frontend as static assets for everything else
- Database: Cloudflare D1 (SQLite)
- Hosting: Cloudflare Workers (free tier covers this comfortably)

## Local setup

```bash
npm install

# create your local secrets file
cp .dev.vars.example .dev.vars
# edit .dev.vars and set your own ADMIN_PASSPHRASE and AUTH_SECRET

# create the local D1 database and load the schema
npx wrangler d1 create video-editing-crm
# copy the database_id it prints into wrangler.toml

npm run db:init:local

# build the frontend once, then run the Worker dev server (serves frontend + API together)
npm run worker:dev
```

Visit http://127.0.0.1:8788 and log in with the passphrase from `.dev.vars`.

While actively editing the frontend, you can instead run `npm run dev` (Vite hot reload on :5173) in one terminal and `npm run worker:dev` in another — Vite is configured to proxy `/api` requests to the Worker dev server.

## Deploying to Cloudflare

This repo is already connected to a Cloudflare Worker via Git integration (Workers Builds). On every push to `main`, Cloudflare will run the build command and deploy automatically.

1. In the Worker's dashboard page → **Settings → Build**, make sure:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
2. Create the production D1 database (if you haven't already) and bind it:
   ```bash
   npx wrangler d1 create video-editing-crm
   npm run db:init
   ```
   Then in the Worker's dashboard page → **Bindings**, add a D1 database binding named `DB` pointing at that database. (Also update `database_id` in `wrangler.toml` and commit it.)
3. In the Worker's dashboard page → **Settings → Variables and Secrets**, add:
   - `ADMIN_PASSPHRASE` — the passphrase you'll use to log into your dashboard
   - `AUTH_SECRET` — any long random string
4. Push to `main` (or trigger a redeploy from the dashboard).

You can also deploy manually with `npm run deploy` if you're authenticated locally via `wrangler login`.

## Notes / things to know

- The admin dashboard (client list, editing videos) is protected by one shared passphrase cookie — good for a single freelancer, not built for multiple team logins.
- Client share links (`/portal/:slug`, `/share/:slug`) are unguessable but not password protected. Anyone with a link has full read + folder-organize access for that client (portal) or read access to one video (share). Don't reuse a link across clients.
- Deleting a folder never deletes what's inside it — its videos and subfolders just move up one level. Only deleting a client cascades to everything of theirs.
- A client's billing type (per-video vs. retainer) can be switched at any time — any unpaid balance stays tracked and visible even after switching to retainer.
