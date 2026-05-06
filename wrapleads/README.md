# WrapLeads.io

B2B lead-generation platform for vehicle wrap and graphics shops. Combines a personal CRM, AI-powered cold-email generation, and a search engine over the FMCSA's public Motor Carrier Census database (~600,000 verified trucking fleets with confirmed vehicle counts).

```
wrapleads/
├── wrapleads-crm.html       Frontend (CRM + Discover view)
├── wrapleads-server.js      Backend API (Apollo proxy + carrier search)
├── ingest-fmcsa.js          One-shot script to load FMCSA data into Postgres
├── schema.sql               Database schema
├── docker-compose.yml       Postgres in one command
├── package.json             Node dependencies
├── .env.example             Configuration template
└── README.md                You are here
```

---

## Quick start (15 minutes, one-time)

### 1. Install prerequisites

You need three things:

| Tool       | Why                          | Get it from                              |
|------------|------------------------------|------------------------------------------|
| Node.js 18+| Runs the server and ingest   | https://nodejs.org (pick LTS)            |
| Docker     | Runs Postgres locally        | https://docker.com/products/docker-desktop |
| FMCSA CSV  | The carrier database         | https://ai.fmcsa.dot.gov/SMS/Tools/Downloads.aspx |

> **Skipping Docker:** if you don't want to install Docker, you can use [Supabase](https://supabase.com) (free tier) for a managed Postgres. Sign up, create a project, copy the connection string into `.env`, and run `psql $DATABASE_URL -f schema.sql` to apply the schema. The rest of the steps work the same way.

### 2. Set up the project

```bash
cd /path/to/wrapleads
cp .env.example .env
npm install
```

### 3. Boot the database

```bash
docker compose up -d
```

This starts Postgres on `localhost:5432` and runs `schema.sql` automatically. To verify:

```bash
docker compose exec db psql -U wrapleads -d wrapleads -c "SELECT COUNT(*) FROM companies;"
```

You should see `count: 0` — empty database, ready for ingest.

### 4. Get the FMCSA Census file

1. Go to **https://ai.fmcsa.dot.gov/SMS/Tools/Downloads.aspx**
2. Download the most recent **"Motor Carrier Census"** monthly snapshot (look for a file like `FMCSA_CENSUS_YYYYMM.csv` or similar — file is ~600 MB unzipped)
3. Unzip if it's a `.zip`
4. Save the CSV somewhere — for example: `~/Downloads/fmcsa-census.csv`

> **Alternative source:** [Data.gov's Motor Carrier Census dataset](https://catalog.data.gov/dataset?q=motor+carrier+census) sometimes hosts the same file with a permanent URL.

### 5. Ingest the data

```bash
npm run ingest:fmcsa -- ~/Downloads/fmcsa-census.csv
```

This streams the CSV (no need to load it all into memory) and bulk-inserts into Postgres. Expect 5–10 minutes on a decent laptop. You'll see a progress bar and then a summary like:

```
✓ Done in 312.4s

   621,540 rows read
   621,432 new carriers inserted
   0 existing carriers updated
   108 rows skipped (missing DOT or name)

📊 Database now contains:
   621,432 total carriers across 56 states/territories
   84,217 in the 25-500 truck "wrap sweet spot"
```

### 6. Start the server

```bash
npm start
```

You'll see:

```
╔═══════════════════════════════════════════════════╗
║   WrapLeads.io — Local Server                     ║
║   http://localhost:3001                           ║
╚═══════════════════════════════════════════════════╝
· Postgres connected. 621,432 FMCSA carriers loaded.
· Apollo API key: per-request (set in CRM Settings)
· Open http://localhost:3001 in your browser.
```

### 7. Open the CRM

Visit **http://localhost:3001** in your browser. The server hosts the HTML directly, so everything works from one URL.

Click **Settings** (top right):
- Fill in your **Company Name** and contact info (powers the AI email signature)
- Optionally paste your **Apollo API key** (enables "Find Contact via Apollo" — see below)
- Save

Click **Discover** at the top. You should see ~620,000 carriers indexed and ready to search.

---

## Day-to-day use

### Discover mode — finding new fleet leads

Click **Discover** in the topbar. Default filters are tuned for wrap shops:

- **States** — comma-separated list of state codes (`IN, OH, IL, KY, MI` is preset)
- **Min Fleet / Max Fleet** — only show fleets with X–Y trucks. The 25–500 default is the sweet spot: big enough that wrap budgets exist, small enough that you can reach a decision-maker
- **Search** — fuzzy match on carrier name, DBA, or city (e.g. `plumbing` finds plumbing-named fleets)

Hit **Search**. Click **+ Add to Leads** on any carrier — they're now in your pipeline with their fleet size, address, phone, and a pre-filled pitch angle.

Then click **My Leads**, open the carrier you just added, and click **Find Contact via Apollo** to get the marketing director's name and email.

### My Leads — your personal pipeline

Same as before. All your leads are stored in your browser (localStorage), so they persist across sessions but stay private to your machine.

To move them off your machine eventually (when WrapLeads becomes a real SaaS), we'll migrate them into the Postgres `leads` table with a user_id. For now, browser storage is fine.

---

## Re-ingesting fresh FMCSA data

The FMCSA Census is updated monthly. To refresh:

1. Download the new CSV
2. Run `npm run ingest:fmcsa -- /path/to/new-census.csv`
3. Existing carriers are updated in place (the `(source, source_id)` key prevents duplicates)
4. New carriers are added

The ingest script is idempotent — running it twice on the same file does no harm.

---

## Common operations

| Task | Command |
|------|---------|
| Start everything | `docker compose up -d && npm start` |
| Stop server | Ctrl+C |
| Stop database | `npm run db:down` |
| Wipe all data | `npm run db:reset` (destroys all carriers + imports!) |
| Open psql shell | `npm run db:psql` |
| Tail server logs | `npm start` (logs to stdout) |
| Reload schema | `docker compose exec db psql -U wrapleads -d wrapleads -f /docker-entrypoint-initdb.d/01-schema.sql` |

---

## Troubleshooting

**"Postgres NOT connected" on server boot**
Docker isn't running, or the container is unhealthy. Run `docker compose ps` to check status. If unhealthy: `docker compose down && docker compose up -d`.

**"npm install" fails on Windows**
Make sure you have Node 18+ (`node --version`). Some older Node versions don't have built-in `fetch`.

**Ingest script crashes on large file**
The script streams the file, so memory shouldn't be an issue. If you hit a parse error mid-file, the script logs the row number — you can usually keep going by manually editing the CSV. Otherwise, check that the file is UTF-8 and not corrupted.

**Search returns 0 results even though carriers are loaded**
Likely your filter is too narrow. Clear the search box, set min fleet to 1, max to 99999, and hit Search. If THAT returns results, your previous filter was the problem.

**Apollo "Find Contact" button isn't working**
The Apollo proxy is now part of the main server (no separate `apollo-proxy.js` to run). Make sure you've added your API key in Settings, and that the proxy URL points to `http://localhost:3001` (the same as the WrapLeads server).

**The Discover badge in the topbar says "offline"**
The server isn't running. Run `npm start` in the wrapleads directory.

---

## What's next (roadmap)

This is **v0.2**. The next things on the list:

- **More data sources** — state SOS registries (Indiana, Ohio public APIs are free), Google Places for local services, BBB rosters
- **Saved searches** — "alert me when new carriers in Ohio with 50+ trucks appear"
- **Bulk operations** — search → check 10 carriers → "Add all to leads" in one click
- **Multi-tenant SaaS mode** — leads move from browser to Postgres with a user_id, deploy to a server, charge wrap shops $49/mo
- **Wrap-cycle intelligence** — match carriers against vehicle registration data to estimate when their fleet was last refreshed

---

## License & attribution

The FMCSA Motor Carrier Census is public domain data from the U.S. Department of Transportation. Use it freely.

The WrapLeads software is yours — built by Jake on his own time. See the `LICENSE` file (TODO: pick a license once you're ready to share or open-source pieces).
