# SN Web Design — Site & client portal

Marketing pages (static HTML), blog, project intake flow, and an Express API behind Clerk for admin tools and client contracts.

## Local development

```bash
npm install
cp .env.example .env
# Fill in Clerk, SMTP, and OWNER_CLERK_USER_ID
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Contracts and uploads are stored under `data/` and `uploads/` on disk.

## Deploy on Vercel

1. Push this repo to GitHub (see below).
2. In [Vercel](https://vercel.com) → **Add New** → **Project** → import the repository.
3. **Framework preset:** Other (default). No build command required; `vercel.json` routes traffic to the Node serverless entry.
4. **Environment variables:** copy from `.env.example` and set every value you use in production, including:
   - **Clerk:** `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `OWNER_CLERK_USER_ID`
   - **Email:** `SMTP_*` fields if you use the contact / brief forms
   - **Redis:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — in Vercel **Storage** add **Upstash Redis** (marketplace) and connect it to the project. This persists contract metadata and who signed.
   - **Blob:** `BLOB_READ_WRITE_TOKEN` — add **Storage → Blob**, connect to the project (stores contract PDFs). Without Redis + Blob, admin contract upload will not work on Vercel.
5. Deploy. Then in the **Clerk** dashboard add your production URL under **Allowed origins** and **Redirect URLs**.

### Why Redis and Blob?

Vercel functions have an ephemeral filesystem. Local development uses files on disk; production uses **Upstash Redis** (via Vercel) for contract assignment metadata and sign dates, and **Vercel Blob** for uploaded PDFs (public URLs work in the client contract viewer iframe).

## Push to a new GitHub repo

From this folder:

```bash
git init
git add .
git commit -m "Initial commit: SN Web Design site"
```

Create an empty repository on GitHub (no README/license if you already committed locally), then:

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Replace `YOUR_USER/YOUR_REPO` with your account and repository name.

## Project layout

- HTML pages at the repo root (`index.html`, `blog.html`, etc.)
- **`public/`** — CSS, images, and other static files served at `/` (required so Vercel includes them with the serverless bundle via `includeFiles`)
- `server.js` — Express app (API + static: `public/` first, then repo root)
- `api/index.js` — Vercel serverless entry; re-exports the Express app
- `lib/store.js` — file or KV persistence for contracts / signatures
