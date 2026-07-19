# Editor CRM

A simple client management dashboard for freelance video editing work.

- **Dashboard** → list of clients
- **Client page** → their Drive folder link + all their projects
- **Project card** → footage link, editing instructions, final export link, status
- **Share link** → every project has a unique public URL you can send to the client, showing a read-only view (instructions, footage, final export) — no login required for them

Everything else (the dashboard itself) is behind a single shared passphrase, since it holds all your client links in one place.

## Stack

- Frontend: React + Vite + Tailwind
- Backend: Cloudflare Pages Functions (serverless API routes)
- Database: Cloudflare D1 (SQLite)
- Hosting: Cloudflare Pages (free tier covers this comfortably)

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

# build the frontend once, then run Pages dev (serves frontend + API together)
npm run build
npm run pages:dev
```

Visit http://127.0.0.1:8788 and log in with the passphrase from `.dev.vars`.

While actively editing the frontend, you can instead run `npm run dev` (Vite hot reload on :5173) in one terminal and `npm run pages:dev` in another — Vite is configured to proxy `/api` requests to the Pages dev server.

## Deploying to Cloudflare

1. Push this repo to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, select the repo.
   - Build command: `npm run build`
   - Build output directory: `dist`
3. Create the production D1 database (if you haven't already) and bind it:
   ```bash
   npx wrangler d1 create video-editing-crm
   npm run db:init
   ```
   Then in the Pages project settings → **Functions → D1 database bindings**, add a binding named `DB` pointing at that database. (Also update `database_id` in `wrangler.toml`.)
4. In Pages project settings → **Environment variables**, add:
   - `ADMIN_PASSPHRASE` — the passphrase you'll use to log into your dashboard
   - `AUTH_SECRET` — any long random string
5. Deploy. Cloudflare will rebuild automatically on every push to your main branch.

You can also deploy manually with `npm run deploy`.

## Notes / things to know

- The admin dashboard (client list, editing project details) is protected by one shared passphrase cookie — good for a single freelancer, not built for multiple team logins.
- Client share links (`/share/:slug`) are unguessable but not password protected — anyone with the link can view that one project's instructions/footage/export links. Don't reuse a link across clients.
- Deleting a client deletes all of their projects (cascade).
