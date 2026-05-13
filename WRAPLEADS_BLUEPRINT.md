# WrapLeads.io — Platform Blueprint
### The Operating System for the Vehicle Wrap Industry

**Company:** Shadow Graphix · WrapLeads.io  
**Location:** Speedway, Indiana — steps from Indianapolis Motor Speedway  
**Date:** May 2026  
**Status:** Live in production · Deployed on Railway · Actively used daily

---

## Executive Summary

WrapLeads is the first purpose-built operating system for the vehicle wrap and graphics industry. No purpose-built software has ever existed for this vertical. Shops run on spreadsheets, text threads, and memory — and lose hundreds of thousands of dollars a year in missed re-orders, slow follow-ups, and quotes that require a tape measure.

Shadow Graphix — a 3M and Avery certified installer in Speedway, Indiana — built WrapLeads to run its own business first. Every feature was validated on real jobs, real leads, and real installs before shipping. The platform now covers the full business stack: lead discovery from 600K+ FMCSA fleet operators, full AI-powered CRM, automated email and phone sales sequences, photo-based vehicle quoting, wrap lifecycle tracking with automated re-order detection, and a complete programmable surface management layer for E Ink and next-generation wrap technologies.

Twelve production sprints have produced ~6,400 lines of Node.js/Express server code, a React 19 TypeScript frontend, 16 PostgreSQL tables, and 6 background workers running 24/7. The platform is deployed, live, and the hardware infrastructure layer for programmable vehicle surfaces is already architected and waiting for the hardware to arrive.

---

## 1. The Origin

Shadow Graphix is not a startup that studied the wrap industry from the outside. It is the wrap industry.

Based in Speedway, Indiana — a block from Indianapolis Motor Speedway — Shadow Graphix holds certifications from 3M, Avery Dennison, 3M DI-NOC, and Rea Tec. The shop serves IndyCar, IMSA, and NHRA teams with race liveries, hauler wraps, pit equipment graphics, and garage branding. It wraps commercial fleets across Indiana and the Midwest. It does color-change builds, architectural film installations on commercial interiors, and everything in between.

The problem was not theoretical. Leads lived in a spreadsheet. Re-orders were forgotten. Quotes required driving to the prospect's lot with a tape measure. Follow-up emails were written one at a time. The biggest customers — fleet operators with 50 trucks that needed fresh wraps every 5 years — sent no signal when their wraps were aging out. The re-order revenue was invisible.

WrapLeads was built to fix every one of those problems. The racing proximity is not a marketing angle — it is a permanent competitive advantage. The motorsports vertical (race liveries, sponsor contingency management, hauler graphics, paddock branding) has logistics, timelines, and client relationships that no generic CRM will ever model. Shadow Graphix already has the relationships and the credibility.

---

## 2. The Problem

Five problems, each measurable in lost revenue:

**1. No vertical CRM exists.**
Salesforce and HubSpot serve horizontal markets. They have no concept of DI-NOC architectural film, fleet wrap cycles, material lifespan, race livery sponsor changes, or the difference between a partial wrap and a color-change full wrap. Shops that adopt them spend more time building custom fields than selling. Most give up and go back to spreadsheets.

**2. Re-order revenue is invisible.**
A shop that installed 200 fleet wraps five years ago has $500K–$1M of re-order potential sitting in those vehicles right now — but only if someone remembers which trucks were wrapped, when, and with what material. Nobody does. The re-orders go to whoever calls first, which is usually a competitor.

**3. Lead discovery is manual.**
Finding fleet operators means cold-calling from Google Maps memory or buying outdated lead lists. The FMCSA publicly publishes a database of 600,000+ registered interstate motor carriers — fleet size, equipment type, state, DOT number. No wrap shop in the country is querying it. WrapLeads does.

**4. Quotes require a tape measure.**
Estimating square footage for a vehicle you've never seen requires either a site visit or an educated guess. A salesperson standing in a parking lot mid-conversation has no tool. A wrong guess in either direction loses the job — too high kills the deal, too low kills the margin.

**5. Sales automation is zero.**
Follow-up emails are written by hand, one at a time, when the salesperson remembers. AI can write and send a complete 3-step drip campaign personalized to the lead's category and company in 10 seconds. No wrap shop is doing this. The ones using WrapLeads are.

---

## 3. The Market

| Segment | Size | WrapLeads Angle |
|---------|------|----------------|
| US vehicle wrap & graphics industry | ~$10B revenue, 5–7% YoY growth | Core addressable market (IBIS World / Grand View Research) |
| US wrap and vinyl graphics shops | 15,000–20,000 shops | Primary SaaS customer (PDAA / SGIA) |
| FMCSA-registered fleet operators | 600,000+ carriers | Top 20% (120K+) run 25+ vehicles = core prospect universe |
| Professional & semi-pro race teams | ~5,000 US teams (IndyCar, IMSA, NHRA, NASCAR, regional) | Racing vertical, highest avg ticket |
| Architectural film (DI-NOC / Rea Tec) | Commercial renovation market | One hospital/hotel = $50K–$500K job |
| Programmable surface management | E Ink commercial fleet 3–5 years out | $500/vehicle/year content management SaaS |
| Dynamic fleet advertising (autonomous MaaS) | Robotaxi market projected $174B by 2045 (IDTechEx) | Software-managed livery API for fleets with no human face |
| Wrap-as-a-Service (circular economy) | Regulatory tailwind; McKinsey / E-Arc circular film models emerging | Closed-loop material leasing + re-ingestion platform |

The core addressable market today is 15,000–20,000 wrap shops. At 5% penetration and $149/month Professional tier, that is $13.4M–$17.9M ARR. The programmable surface layer is a separate and larger market that WrapLeads is uniquely positioned to serve because the infrastructure is already built. The autonomous MaaS layer ($174B robotaxi market by 2045) is the long-horizon prize — and requires the same software infrastructure WrapLeads is building now.

---

## 4. Revenue Model

**SaaS Subscriptions (primary)**
| Tier | Price | Includes |
|------|-------|---------|
| Starter | $49/mo | CRM, lead discovery, bid tracker |
| Professional | $149/mo | All AI features, lifecycle tracker, vision quote, proposals, analytics |
| Agency | $299/mo | White-label, multi-user, API access, fleet integrations |

**Usage-Based Upsells**
- AI phone call minutes via Vapi.ai
- Bulk Apollo contact enrichment credits (beyond included allowance)
- DALL-E design generation (beyond included allowance)

**Marketplace (Wave 3)**
- Wrap designers list templates; shops buy and schedule in one click
- 20–30% platform take rate on each transaction

**Hardware SaaS (Wave 2)**
- Per-device monthly fee for E Ink content management
- $10–15/device/month at commercial scale
- A fleet of 100 E Ink vehicles = $12K–$18K ARR from a single customer

**Current infrastructure:** Stripe subscription system is live, 14-day free trial, trial expiry cron, subscription status check on every protected route.

---

## 5. What Is Built — Full Feature Inventory

### Domain A — Lead Intelligence

**Carrier Discovery**
Queries the FMCSA Motor Carrier Census database of 600,000+ registered fleet operators. Scored by wrap-readiness: fleet size in the 25–500 vehicle range scores highest; very small (under-resourced) and very large (contracted) fleets score lower. Staleness of last-reported data also factors in. One-click import creates a lead record in the CRM.

**Apollo Contact Enrichment**
Per-lead and bulk enrichment via the Apollo.io API. Given a company name and domain, Apollo returns the decision maker's full name, job title, direct email address, and LinkedIn profile URL. Bulk enrichment runs against every lead in the database simultaneously. Saves 20+ minutes of manual research per lead.

**Business Card Scanner**
Photograph a business card → Claude Vision (Anthropic API, vision content blocks) reads the card image and extracts name, title, company, phone, email, and address as structured JSON → pre-fills the lead creation form. A card scanned at a trade show becomes a CRM record in 10 seconds.

**Blueprint Scanner**
Upload any PDF RFP, bid specification, or project document → Claude reads the full document text → identifies every wrap and graphics opportunity within it → automatically creates multiple lead records. A 40-page construction project document becomes six separate actionable leads without a human reading a single page.

**Inbound Quote Widget**
An embeddable HTML form shops place on their own website. A prospect fills in vehicle type, description, and contact info → a lead record and a quote request are created in the database → the shop owner receives a notification immediately.

---

### Domain B — CRM & Pipeline

**Full CRM**
Eight pipeline statuses: New → Cold → Contacted → Replied → Meeting → Proposal → Won → Lost. Kanban board view and list view. Filters by category, status, city, state, fleet size, and date added. Bulk status updates (move 50 leads to "Contacted" in one click). Multi-select checkboxes throughout.

**Today's Mission Dashboard**
Every morning, a single screen shows exactly who to call today, what bids are due this week, which wraps are aging toward their refresh window, which sequences need attention, and which signals fired since yesterday. No digging through tabs. The system runs the day.

**Live Signals Feed**
A real-time event stream of meaningful pipeline activity: won deals, new inbound leads, proposals opened, bids awarded, sequences completed. Each signal is timestamped and links directly to the relevant lead. Refreshes every 90 seconds.

**Bid Tracker**
Full bid lifecycle management: submitted date, bid amount, deadline, status (pending / awarded / lost). Background expiry worker fires a notification 24 hours before any bid deadline. Win/loss logging with reason codes.

**Broadcast Email**
Select any subset of leads from the list → compose one message using `{{company}}` and `{{name}}` merge tags → send a personalized email to every selected lead in one operation. Full result report: sent count, skipped (no email), errors.

**Notification System + Deep-Link Navigation**
Every significant event — sequence sent, proposal opened, bid deadline approaching, new inbound lead, call completed — creates an in-app notification with an unread badge count. Clicking any notification navigates directly to the relevant lead record via a Zustand store queue that resolves after leads load. Cross-component deep-linking without prop drilling.

---

### Domain C — AI Sales Engine

**AI Email Sequences**
Describe what you want the sequence to accomplish → Claude (Haiku model) writes a full 3-step drip campaign: initial outreach, follow-up, and close attempt — each personalized to the lead's category and company name. The background drip worker (runs every 60 seconds) sends each email on schedule via Resend. Zero emails written by hand.

**Vapi AI Phone Calls**
An AI voice rep named "Shadow" calls prospects via Vapi.ai. The system prompt encodes Shadow Graphix's full service offering, pricing ranges, objection-handling scripts, qualifying questions, and value hooks by category (fleet, racing, DI-NOC, color-change, construction). When a prospect says "I'm definitely interested," Shadow warm-transfers the call directly to the owner's phone. Runs while the installer is in the shop doing installs.

**AI Coach**
For any lead in the pipeline, one click generates a next-step recommendation. Claude reads the lead's full history — current status, last contact date, all activities logged, category, company size — and recommends the single best action to take right now, with specific language to use.

**AI Pipeline Narrative**
One button on the Analytics page triggers a full pipeline analysis. Claude reads all active leads, activity data, win/loss history, and category distribution → writes a 300–600 word plain-English forecast: where the money is most likely to close in the next 30 days, what the biggest risks are, and the single highest-leverage action available this week.

**Proposal Generator**
Claude generates a complete, professional HTML wrap proposal based on the lead's category, estimated scope, and any notes attached to the record. The proposal includes scope of work, recommended materials, pricing range, timeline, and a call-to-action. A unique shareable URL is generated. A 1×1 tracking pixel fires when the prospect opens the proposal — the view timestamp is logged and a notification is created for the shop owner.

**Cold Nurture Worker**
Daily background cron (8 AM). Identifies leads that have had no contact in 21+ days and are not in a terminal status (won/lost). Automatically queues a re-engagement sequence. Leads never go permanently cold without a human making that decision.

**Anniversary Worker**
Daily background cron (11 AM). On the one-year anniversary of any completed install job, sends the client a personal-feeling "how is your wrap holding up?" email. Runs indefinitely with zero maintenance. The best re-order touch possible — timed precisely to when the wrap is one year into its lifespan.

---

### Domain D — Quoting & Design

**Vision Quote**
Photograph any vehicle → Claude Vision identifies the vehicle type (cargo van, box truck, semi, pickup, SUV, bus, etc.) and body style → cross-references a hardcoded dimension table with sq footage ranges by vehicle type → returns a tiered quote: full wrap, partial wrap, and spot graphics — each with a low and high dollar range. Usable standing in a parking lot mid-sales-call. No tape measure, no site visit.

**AR Preview / Wrap Mockup**
Upload a photograph of the prospect's actual vehicle → OpenAI gpt-image-1 image edit endpoint applies the wrap description to that specific truck → returns a side-by-side comparison: original photo on the left, AI-rendered wrap concept on the right. Shows the client the finished product before a single inch of vinyl is cut.

**AI Design Studio**
Describe the desired wrap: vehicle type, primary and secondary colors, style preset (bold, clean, luxury, aggressive, minimalist), and any free-form description → Claude generates a structured design brief with a DALL-E-optimized rendering prompt → DALL-E 3 generates a photorealistic 1792×1024 concept image → the image is attached to the lead record as a design activity. Show prospects what their fleet could look like in under 2 minutes.

**Material Catalog**
Eleven professional wrap materials with full specifications:

| Material | Brand | Type | Lifespan | Price/sqft |
|----------|-------|------|---------|------------|
| 3M 1080 | 3M | Cast | 7yr | $10–$16 |
| 3M IJ180Cv3 | 3M | Cast | 9yr | $9–$14 |
| 3M IJ40C | 3M | Calendered | 5yr | $6–$10 |
| 3M IJ200 Reflective | 3M | Specialty | 10yr | $16–$26 |
| Avery SW900 | Avery | Cast | 7yr | $10–$16 |
| Avery SW900 Chrome | Avery | Specialty | 5yr | $18–$28 |
| Arlon 3000XL | Arlon | Cast | 7yr | $9–$14 |
| Arlon SLX | Arlon | Cast | 9yr | $11–$17 |
| 3M DI-NOC | 3M | Architectural | 10yr | $20–$35 |
| Rea Tec | Rea Tec | Architectural | 10yr | $18–$32 |

Searchable by name, brand, and finish. Detail panel shows full specs, available finishes, best-use notes, and installer tips. Selecting a material pre-fills the job log form.

**Fleet Quote Builder**
Inside any lead record, enter multiple vehicle types and counts → get a complete fleet quote range instantly. No spreadsheet, no calculator.

---

### Domain E — Wrap Lifecycle

**Install Job Tracker**
Log every completed install: company name, vehicle type, vehicle count, wrap category, material used, install date, and expected lifespan (3, 4, 5, or 7 years). The first CRM in the industry to make re-order revenue visible — a shop with 5 years of installs logged has a complete map of every upcoming re-order opportunity.

**Aging Alerts Dashboard**
Color-coded urgency for every logged install approaching end-of-life:
- 🔴 Red: wrap already past expected lifespan
- 🟠 Orange: expiring within 30 days
- 🟡 Yellow: expiring within 30–90 days

One-click "Re-engage Lead" button: creates a follow-up activity on the linked lead record and sets `followup_due_at = today`. The lead appears in Today's Mission immediately.

**Re-Order Background Worker**
Daily cron (9 AM). Queries all installed jobs where the expiry date falls within 90 days. Surfaces each one as a mission task. Passive revenue detection — it runs every day without any human action. A shop that logs its installs correctly will never miss a re-order opportunity again.

**Won → Job Loop**
When a salesperson marks a deal Won, a single modal offers the option to simultaneously log the completed install — vehicle type, count, material, install date. No separate workflow, no double-entry. The win and the install record are created in one action.

---

### Domain F — Content & Device Management

This is the infrastructure layer that bridges today's static wrap business to tomorrow's programmable surface market.

**Dynamic Content Library**
Upload wrap designs and promotional graphics, tag by campaign type (seasonal, brand, holiday, promo), and organize by vehicle group. Grid view with thumbnails. The library is shared across the scheduling engine and the device push layer.

**Content Scheduling Engine**
Schedule any content for any combination of:
- Vehicle group (all fleet / racing / custom label)
- Date range (start date + optional end date)
- Time of day (all day or specific hours)
- Geographic trigger (city/state/radius — for future GPS integration)
- Priority level (higher priority wins when schedules conflict)

The active content resolver (`GET /content/active`) returns what should be displaying right now for each vehicle group. This is the same endpoint hardware devices poll.

**E Ink Device Registry**
Register physical E Ink Prism 3 controllers by serial number. Each device record links to:
- The vehicle it is installed on
- The lead record associated with that vehicle's owner
- The completed install job record
- Current status (online / offline / updating / error)
- Last seen timestamp, last GPS location, firmware version, battery percentage

**Device Lifecycle**
```
Device powers on
  → POST /devices/register (provisioning secret gates first-time enrollment)
  → GET /devices/:id/content every N minutes (polls for current scheduled content)
  → Server resolves active schedule for device's vehicle_group
  → Returns { image_url, display_params, push_log_id }
  → Device renders new content
  → POST /devices/:id/ack (confirms delivery — push_log updated to 'delivered')
  → POST /devices/:id/heartbeat (updates last_seen_at, location, battery)
```

**Dashboard**
Real-time device fleet view: online/offline badges, current content thumbnails, last-seen timestamps, battery levels. Manual push: select any device → pick content from library → push immediately. Full delivery log per device (last 20 push events with status).

**QR Provisioning**
Register a new device by scanning a QR code displayed in the UI. The physical controller scans the QR, receives its authentication token, and begins polling immediately. Zero manual configuration.

---

### Domain G — Analytics & Intelligence

**Pipeline by Stage** — lead counts and percentages at each of the 8 pipeline statuses, with color-coded bars.

**Won Trend** — 6-month bar chart of closed deals by month.

**Category Performance** — leads and wins broken down by wrap category (fleet, racing, construction, DI-NOC, Rea Tec, color-change, wall graphics, GC referral).

**Activity Last 30 Days** — total emails sent, calls made, meetings set, and sequences completed.

**Revenue Forecast** — probability-weighted pipeline value: each stage's lead count × estimated close rate × average deal size. Close rates hardcoded by stage (proposal: 60%, meeting: 35%, replied: 20%, contacted: 10%). Updated live.

**Win/Loss Factors** — tracks the stated reason for each won or lost deal: price, timeline, relationship, quality, competition, no budget, not ready. Bar chart sorted by frequency.

**Competitor Leaderboard** — tracks which competitors deals are being lost to, ranked by number of losses. Identifies who to study and who to undercut.

**Customer Lifetime Value** — top customers ranked by estimated CLV: won deals + completed installs + vehicles wrapped + repeat business signals.

**AI Pipeline Narrative** — on-demand 30-day forecast written by Claude. One button, one paragraph, tells you what to do this week.

**Top Leads to Work** — the 5–10 highest-priority active leads in the pipeline, each clickable to navigate directly to the lead record.

---

### Domain H — Platform & Infrastructure

**Deployment**
Railway (RAILPACK builder). Push to `main` → Railway builds frontend (`tsc -b + vite build`) → starts `node wrapleads-server.js` → `migrateDb()` applies any new tables/columns → 6 workers start → server ready. Zero-downtime for most deploys (new tables are additive; old code runs fine while new code deploys).

**Background Workers — 6 Active**
| Worker | Schedule | Function |
|--------|----------|---------|
| Drip Worker | Every 60s | Sends scheduled email sequence messages |
| Digest Worker | 7 AM daily | Morning briefing email to each user |
| Cold Nurture Worker | 8 AM daily | Re-engages leads silent for 21+ days |
| Re-Order Worker | 9 AM daily | Surfaces aging wrap jobs as mission tasks |
| Bid Expiry Worker | 10 AM daily | Fires alerts for bids due in <24 hours |
| Anniversary Worker | 11 AM daily | 1-year install anniversary re-engagement |

No Redis. No Bull. No SQS. Postgres is the queue. Workers read a status column, process rows, update status. Simple, auditable, zero infrastructure cost.

**Email Tracking**
Every outbound email — from drip sequences, from manual sends, from proposals — contains a 1×1 transparent GIF tracking pixel. When the prospect opens the email, their client fetches `GET /track/email/:token` → the open is logged with a timestamp → a notification is created for the shop owner. The owner knows within seconds that a prospect opened a proposal.

**Public Portfolio**
Every shop automatically gets a public-facing portfolio page at `/portfolio/:shopToken`. The page showcases completed installs from the job tracker — company name, vehicle type, category, install date. Shareable link for use in proposals, email signatures, and social media. Populated automatically as jobs are logged; no manual maintenance.

**Social Post Generator**
From any completed install job → one click → Claude writes a ready-to-post Instagram or LinkedIn caption in the shop's voice, describing the job, the materials, and the outcome. Copy and paste.

**Multi-Tenancy**
Every database table that stores user data has a `user_id TEXT NOT NULL` column. Every query includes `WHERE user_id = $1` with `String(req.user.id)`. Zero cross-tenant data access by design. Verified in every route.

**Stripe Subscription System**
Full trial infrastructure: 14-day free trial on registration, trial expiry cron emails, Stripe checkout and customer portal routes, `subMiddleware` checks subscription status on every protected route (`trialing`, `active`, `past_due`, or non-expired `trial_ends_at` all pass). Bypassed with `STRIPE_DISABLED=true` in local development.

---

## 6. Technical Architecture (Engineering Deep Dive)

### Backend

A single Express.js monolith. ~6,400 lines. CommonJS. Node 18+.

**Why a monolith:** At this stage of development, a monolith ships features faster, is easier to reason about, has zero distributed systems overhead, and is trivially deployable to a single Railway service. The architecture does not need to be microservices until traffic and team size demand it — which is not now. Extract services when the data shows you need to, not before.

**Route pattern** — consistent throughout the entire file:
```js
app.METHOD('/path', authMiddleware, subMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT ... WHERE user_id = $1 AND ...', [String(req.user.id), ...]);
    res.json({ ok: true, data: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});
```

**Database access** — `pg.Pool`, inline parameterized SQL, no ORM. Every query uses `$1`, `$2` positional parameters. String interpolation into SQL is never done anywhere in the codebase.

**Migration system** — `migrateDb()` runs on every server boot. Contains `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements for every table not in the original `schema.sql`. Idempotent. No migration runner required. New tables and columns are added here, not in `schema.sql`.

**Critical ordering** — the Stripe webhook handler is mounted *before* `express.json()` because it requires the raw request body for signature verification. The SPA fallback `app.get('*')` and `express.static('dist/')` are always last so API routes win.

### Background Worker Architecture

```
app.listen(PORT, () => {
  startDripWorker();        // setInterval 60s: scans email_queue for due messages
  startDigestWorker();      // schedules next 7AM: sends morning briefing emails
  startColdNurtureWorker(); // schedules next 8AM: re-engages silent leads
  startReOrderWorker();     // schedules next 9AM: surfaces aging wrap jobs
  startBidExpiryWorker();   // schedules next 10AM: bid deadline alerts
  startAnniversaryWorker(); // schedules next 11AM: 1-year install anniversaries
});
```

Each worker is a self-scheduling function using `setTimeout` to land at the correct wall-clock time each day. No external scheduler, no cron daemon, no message queue. Postgres rows with status columns are the job queue. This eliminates an entire category of infrastructure dependencies.

### Frontend

React 19 + TypeScript + Vite. Output lands in `wrapleads/dist/`, served as static files by Express in production.

**API layer** — `src/api/client.ts` exports a single `api` object. Every server call goes through `authFetch<T>(url, opts?)` which attaches the JWT from `localStorage` (`wl_token`) and triggers logout on 401. No component ever calls `fetch` directly. File uploads (multipart/form-data) are the single exception, following the `scanBlueprint` / `quoteVehicle` pattern.

**UI state** — Zustand store (`useAppStore`) with `persist` middleware. Holds the current app mode, active lead ID, filter state, all modal open/close flags, command palette state, notification deep-link queue, and bulk selection set. Persists across page refreshes.

**Server data** — TanStack React Query. All server data fetching goes through `useQuery` and `useMutation`. Refetch intervals configured per endpoint. No `useEffect` for data fetching.

**View routing** — `AppMode` union type drives the entire view layer from `pages/CRMPage.tsx`:
```ts
type AppMode = 'leads' | 'discover' | 'pipeline' | 'bids' | 'mission' | 'jobs' | 'content' | 'analytics';
```
Changing the mode in the Topbar is the equivalent of a route change. No React Router needed for the main app — it is a single-page workspace.

### AI Integration

```js
// Core AI helper — raw fetch to Anthropic API
async function claudeHaiku(apiKey, messages, maxTokens = 400) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages,
    }),
  });
  return response.json();
}

// Vision calls (business card scanner, vehicle quoting) use content blocks:
messages: [{
  role: 'user',
  content: [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Data } },
    { type: 'text', text: 'Extract the following fields as JSON: ...' },
  ]
}]

// Image generation: raw fetch to OpenAI
// DALL-E 3: POST https://api.openai.com/v1/images/generations
// AR Preview: POST https://api.openai.com/v1/images/edits (multipart/form-data)

// Voice: Vapi.ai REST API for assistant creation and call dispatch
```

Haiku is used for all background tasks (sequences, cold nurture, coach recommendations) — cheapest model, fast, sufficient for structured output. Sonnet-class models are used for pipeline narrative and proposal generation where output quality is the product.

### Zero-Dependency Philosophy

No Prisma. No TypeORM. No Axios. No Lodash. No Redux. No moment.js. No query builders.

Every external API — Anthropic, OpenAI, Apollo.io, Vapi.ai, Samsara, Stripe — is called via native Node 18+ `fetch`. The production dependency tree is intentionally shallow: `express`, `pg`, `bcryptjs`, `jsonwebtoken`, `multer`, `pdf-parse`, `csv-parse`, `resend`, `stripe`, `dotenv`. That is the entire list.

Fewer dependencies means fewer attack surfaces, faster cold starts, no version conflict hell, and a codebase any engineer can audit end-to-end in a day.

### Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Auth credentials, `settings_json` (API keys, preferences), subscription status |
| `leads` | Per-user CRM records, unique by `(user_id, client_id)` |
| `companies` | Public dataset: FMCSA fleet operators, SOS business registrations, Google Places |
| `lead_activities` | Full activity log — emails, calls, notes, AI events, design generations |
| `email_queue` | Drip sequence outbox, polled every 60s by drip worker |
| `email_tracking` | Open tracking tokens and timestamps |
| `bids` | Bid tracker with deadlines, amounts, and outcomes |
| `installed_jobs` | Completed wrap installs with lifespan tracking |
| `proposals` | AI-generated proposals with shareable tokens and view tracking |
| `notifications` | In-app notification inbox with read/unread state |
| `wrap_content` | Design library for content scheduling |
| `content_schedules` | Vehicle group × date × time × geo trigger × priority |
| `eink_devices` | E Ink hardware controller registry |
| `eink_push_log` | Content delivery confirmation log per device |
| `portal_links` | Customer-facing portal access tokens |
| `quote_requests` | Inbound quote form submissions |

### Security Model

- JWT signed with `JWT_SECRET`, 30-day expiry, stored in `localStorage` (`wl_token`)
- Every user-scoped query: `WHERE user_id = $1` with `String(req.user.id)` — multi-tenant isolation enforced at the query level, not the application level
- Parameterized SQL throughout — no SQL injection surface exists
- File uploads via `multer` with memory storage, 10–20MB limits, MIME type checked
- E Ink device API uses separate per-device tokens — hardware compromise does not expose user JWTs
- `EINK_PROVISION_SECRET` environment variable gates first-time device registration
- Optional integrations fail gracefully: if `ANTHROPIC_API_KEY` is not set, AI routes return a config error rather than crashing the server

### API Endpoints — Full Surface

```
/auth/*              register, login, /me, password reset
/leads/*             CRUD, sync (localStorage→Postgres), bulk-update, broadcast email
/leads/:id/*         activities, sequences, vision quote attachment, proposals
/carriers/*          FMCSA search with wrap-score, import as lead
/apollo/*            per-lead search, per-lead enrich, bulk enrich, prospect, test connection
/bids/*              CRUD, stats (total/won/lost/pending)
/jobs/*              CRUD, aging alerts (expiry < 90 days)
/mission/*           daily brief, live signals feed
/analytics           full dashboard aggregation query
/ai/*                design-brief, generate-mockup, social-post, pipeline-narrative
/vision/*            quote-vehicle, ar-preview, scan-card
/content/*           library CRUD, schedules CRUD, active content resolver, JSON export
/admin/devices/*     E Ink device management (JWT auth)
/devices/*           E Ink device API (device-token auth — hardware endpoints)
/proposals/:token    public shareable proposal HTML (no auth required)
/portfolio/:token    public shop portfolio page (no auth required)
/track/email/:token  tracking pixel handler (no auth — fires on email open)
/webhooks/*          email inbound processing
/stripe/*            checkout session, customer portal, Stripe webhook
/integrations/*      Samsara fleet vehicles, Motive fleet vehicles (import as leads)
```

### Build & Deployment Pipeline

```
Developer pushes to main
  ↓
Railway detects push (RAILPACK builder)
  ↓
cd frontend && npm install && npm run build
  → tsc -b (TypeScript type check — zero errors required)
  → vite build (bundles React app to wrapleads/dist/)
  ↓
npm start → node wrapleads-server.js
  → migrateDb() runs (CREATE TABLE IF NOT EXISTS for all tables)
  → express.static('dist/') serves the SPA
  → 6 background workers start
  → Server ready on Railway-assigned PORT
```

---

## 7. Development Velocity

Twelve production sprints from zero to a full-featured platform:

| Sprint | Name | Major Deliverables |
|--------|------|--------------------|
| 1–3 | Foundation | Auth, full CRM, FMCSA carrier discovery, Apollo enrichment, kanban pipeline |
| 4 | The Closer | AI proposal generator, shareable proposal links, email view tracking |
| 5 | The Strategist | Bid tracker, AI Coach, AI Design Studio, AR Wrap Preview |
| 6 | The Automation Engine | AI email sequences, drip background worker, cold nurture, re-order detection |
| 7 | The Showcase | Email tracking pixels, public portfolio, social post generator, fleet quote builder |
| 8 | The Living CRM | Enhanced AI Coach, re-order engine, proposal view intel |
| 9 | The Oracle I | Referral tracking, email open notifications, portfolio enhancements |
| 10 | The Conversion Engine | Bid expiry worker, broadcast email, notification deep-links, Live Signals, won→job loop |
| 11 | The Oracle II | Business card scanner, anniversary worker, AI pipeline narrative, material catalog |
| 12 | E Ink Infrastructure | Device registry, heartbeat/status, content push, delivery log, QR provisioning |
| Current | Architecture | CLAUDE.md, RAILPACK deployment, dev tooling |

Result: ~6,400 lines of production server code, a complete React TypeScript frontend, 16 database tables, 40+ API endpoints, 6 background workers, and a full E Ink device control plane. Built and deployed with zero external engineers.

---

## 8. The Future Software Layer

### Wave 1 — Now to 12 Months: Product Depth

**Samsara & Motive Fleet Integrations**
Connect a fleet management account → pull the full vehicle roster → import each vehicle group as a lead. WrapLeads monitors for new vehicles added to the fleet and surfaces them as buying signals. Samsara and Motive are the two dominant platforms for mid-market and enterprise fleets — the companies that need wrap management the most.

**Supplier API Integrations**
Live pricing and availability from 3M, Avery Dennison, and Arlon directly in WrapLeads. When a material cost changes, every open quote automatically reflects the new price. Eliminates phone calls to distributors.

**Robotic Job File Export**
Direct-to-vehicle robotic printers (precision inkjet arms that print onto vehicle surfaces without vinyl) are entering early commercial use. They need structured job files: design image, vehicle dimensions, color specs, material parameters. The Vision Quote AI already captures vehicle dimensions. The Design Studio already captures the design brief. The export format is a routing step away.

**Mobile PWA**
Camera-first mobile web app: scan a business card, run a Vision Quote, preview a wrap on a prospect's vehicle — all from a phone camera, no app store required. The camera-based features already exist on the web; the PWA is packaging and UX.

**QuickBooks / Invoicing Bridge**
Won deal → invoice generated in QuickBooks in one click. Payment status reflected back in the lead record. The first accounting integration most shops have ever had connected to their CRM.

**Multi-Shop / Agency Accounts**
One WrapLeads login manages multiple shop locations under a single billing relationship. For franchise wrap operations and agencies managing wrap programs for multiple clients.

### Wave 2 — 12 to 36 Months: Platform Expansion

**Full E Ink Prism 3 Commercial Rollout (2028–2030 target)**
Building on BMW's "Flow" concept prototype, E Ink Prism 3 technology is on track for mainstream commercial adoption by 2035 (Epaperia / ArtInvidis research). WrapLeads's device control plane — already live in production — is the server these devices call home. Fleets will switch from summer branding to holiday campaigns in 30 seconds from a single dashboard. OTA content updates (Antolin) eliminate physical wrap replacement entirely for campaigns. New entrants starting this infrastructure work in 2028 will be years behind.

**Fleet Operator Self-Service Portal**
Fleet clients log into their own WrapLeads portal, see the full history of every wrap ever installed on their vehicles, view aging alerts for their own fleet, request refresh jobs, and approve design concepts. The shop owns the data; the client gets visibility.

**Solar "Energy Wrap" Tracking**
Thin-Film Perovskite Solar Modules are approaching commercial viability for vehicle exteriors (DBusiness / PV Magazine USA). These "peel-and-stick" power layers are projected to provide meaningful range extensions for urban EVs by 2040. The Wrap Lifecycle Tracker already logs material, install date, and surface area. Adding `watts_generated`, `panel_efficiency`, and `degradation_rate` is a schema migration and a dashboard card — not a new product. A wrapped fleet becomes a distributed energy asset with measurable yield per vehicle.

**Smart Skin Compatibility**
Nanostructured surfaces that create color through light manipulation (not pigments, similar to biological structural color — Yeswrap research) and self-healing clearcoats with Lotus-Effect self-cleaning properties (Wrapsforless) require diagnostic tracking. Material type → nanocoating specs → environmental response curves → self-repair cycles → maintenance schedules. The job record is the natural home for this data. WrapLeads becomes the diagnostic layer for smart material surfaces.

**White-Label SaaS**
Wrap shops run WrapLeads under their own brand for their own clients. A shop in Chicago running their fleet clients on a white-labeled "ChicagoFleetOS" is a new ARR line without a new codebase.

**Content Marketplace**
Wrap designers list templates — race livery themes, fleet branding systems, seasonal promotional sets. Shops browse, purchase, and schedule in one click. 20–30% platform take rate. The scheduling engine and content library are already built.

**Wrap-as-a-Service (WaaS) Platform**
The emerging circular economy model (McKinsey / E-Arc research) positions film materials as leased assets, not purchased ones. Fleet operators pay a monthly fee; at the end of each branding cycle, the film is peeled and returned for 100% recycling into new wrap production — a closed-loop system. WrapLeads manages the install record, the return schedule, the material chain-of-custody, and the recycling audit trail. This is not speculative — it is the regulatory direction EU procurement is moving, and large fleet operators in North America will follow.

### Wave 3 — 36+ Months: Infrastructure Layer

**Autonomous Fleet Branding API**
The robotaxi market is projected to reach $174 billion by 2045 (IDTechEx). These fleets — from Waymo to autonomous freight operators to transit authorities — have no human face. Branding is how they build public trust and advertise. Dynamic wraps will enable location-based, targeted advertising that changes as the vehicle travels through different neighborhoods. V2P (vehicle-to-pedestrian) communication graphics will display intent-based safety messages directly on the vehicle's exterior ("Safe to cross," "Yielding") to improve pedestrian safety at intersections (Transfers Magazine / US DOT research). WrapLeads is the software layer that manages all of it — content, scheduling, device status, and compliance logging.

**Robotic Direct-to-Vehicle Printing Integration**
High-precision robotic inkjet systems — Dürr's "EcoNextJet," Automotive Manufacturing Solutions' "PixelPaint," and Xaar-based architectures — are entering early commercial deployment in OEM and specialty wrap shops. These systems print complex designs directly onto vehicle bodies with zero overspray, eliminating the weight and material waste of traditional vinyl films (Assembly Magazine / Automotive Manufacturing Solutions). AI-designed liveries print in minutes. WrapLeads's Design Studio already generates the design brief and dimensions; the robotic job file export (Wave 1 roadmap) becomes the bridge between the AI quote and the production floor.

**Bio-Material Sustainability Ledger**
By 2040, the industry is projected to transition from PVC-based films to fully biodegradable polymers and bio-based resins (NIH / Wrapsforless). EU Extended Producer Responsibility regulation for synthetic films is advancing. The material catalog → job record → sustainability ledger pipeline is three steps. Shops that can produce a carbon-per-sqft sustainability report for each wrap job win enterprise fleet contracts that shops without documentation cannot bid for.

**Real-Time WebAR**
8th Wall or Three.js + a device camera feed → real-time vehicle detection → 3D mesh overlay with wrap texture. Not a photo upload — live, in the prospect's camera, standing in the parking lot. The photo-based AR Preview is the proof of concept. Real-time AR is the product.

**Predictive Material Science Engine**
Aggregate degradation data from all logged installs across all WrapLeads shops — material × climate × vehicle type × install quality × actual vs. stated lifespan. The model predicts actual lifespan more accurately than manufacturer specifications. Insurers pay for aggregate degradation data. Material manufacturers pay for real-world performance benchmarks. Fleet operators pay for accurate replacement forecasting. This data network effect is only possible because WrapLeads is where installs are logged.

---

## 9. The Convergence Thesis — The Vehicle Wrap Industry Through 2046

The vehicle wrap industry is transitioning from a cosmetic aftermarket service into a fundamental component of automotive smart skins, dynamic mobile environments, and autonomous fleet infrastructure. This is not speculative — the materials exist, the hardware is in early commercial deployment, the regulatory pressure is accelerating, and the market projections are measured in hundreds of billions of dollars. The missing piece has always been software.

WrapLeads is that software. What follows is a structured view of the five technology frontiers converging over the next 20 years — and where WrapLeads sits at each inflection point.

---

### Frontier 1 — Programmable Surfaces (2026–2035)
**From passive film to active electronic skin**

Building on BMW's "Flow" concept — the first demonstration of full-vehicle E Ink at scale — programmable surfaces are moving from luxury prototype to commercial reality. By 2035, e-paper layers integrated into wrap films will enable instantaneous color changes and pattern updates via over-the-air software commands (Epaperia / ArtInvidis research). A fleet of 50 delivery vans switches from summer branding to holiday campaign without a shop visit, a roll of vinyl, or an installer — from a dashboard, in 30 seconds.

WrapLeads is already that dashboard. The E Ink device control plane — device registry, heartbeat monitoring, content scheduling engine, OTA push, delivery confirmation log — is live in production today. When the hardware arrives at commercial scale, the software is waiting.

**The location-based advertising layer:** Dynamic wraps on autonomous and commercial vehicles will allow content to change as vehicles travel through neighborhoods — targeted, location-aware advertising updated in real time. The content scheduling engine (vehicle group × date × time × geographic trigger × priority) is already built for exactly this use case.

---

### Frontier 2 — Energy Generation (2030–2040)
**Wraps as distributed power stations**

Thin-Film Perovskite Solar Modules are approaching commercial viability for flexible vehicle exteriors (DBusiness / PV Magazine USA). These "peel-and-stick" power layers are projected to provide meaningful EV range extensions for urban commercial fleets by 2040. A fleet wrap becomes a distributed energy asset — every square foot generating measurable watt-hours per day while in service.

WrapLeads's Wrap Lifecycle Tracker already logs: material type, surface area, install date, and expected lifespan for every vehicle in a shop's client fleet. Adding solar yield tracking (`watts_generated`, `panel_efficiency`, `degradation_rate`) requires a schema migration and a dashboard module — not a new product. The data model is already correct. The business model extension is straightforward: energy yield reporting becomes a premium feature that fleet operators pay for directly, independent of the wrap shop.

---

### Frontier 3 — Nanotechnology & Smart Skins (2030–2045)
**Surfaces that adapt, heal, and clean themselves**

Material science is producing surfaces that manipulate light at the molecular level — creating color through nanostructural geometry rather than pigments, analogous to biological structural coloration (Yeswrap research). These surfaces offer theoretically unlimited color palette without dye degradation. Smart Skin surfaces add real-time self-healing properties (autonomous repair of surface scratches) and Lotus-Effect self-cleaning coatings that maintain surface quality without maintenance (Wrapsforless).

For WrapLeads, smart material surfaces require diagnostic infrastructure: coating layer specifications, environmental response parameters, self-repair cycle logging, surface health assessments. The job record — already capturing material type, install date, and expected lifespan — is the natural home for this data. WrapLeads becomes the diagnostic and compliance layer for smart material surfaces as they enter the commercial fleet market.

---

### Frontier 4 — Robotic Direct-to-Vehicle Production (2028–2038)
**From hand-applied vinyl to precision-printed surfaces**

High-precision robotic inkjet systems are entering early commercial deployment at OEM facilities and specialized wrap shops. Systems like Dürr's EcoNextJet and PixelPaint architectures print complex designs directly onto vehicle bodies with zero overspray, eliminating the weight penalty and material waste of traditional adhesive films. Generative AI-designed liveries apply in minutes rather than days (Assembly Magazine / Automotive Manufacturing Solutions / Xaar Group).

WrapLeads's AI Design Studio already generates the structured design brief — vehicle type, dimensions, color specs, style parameters, DALL-E rendering prompt. The Vision Quote AI already captures vehicle dimensions from a photograph. Robotic job file export (structured output connecting the AI design brief to robotic printer parameters) is one routing step away from being a live product. The connection from AI quote to production floor closes automatically.

---

### Frontier 5 — Autonomous Fleet Branding (2035–2046)
**The $174 billion market that needs a software layer**

The global robotaxi market is projected to reach $174 billion by 2045 (IDTechEx). Autonomous freight operators, robotaxi services, and transit authorities are deploying fleets of vehicles with no human face. Branding is how these companies build public trust, generate advertising revenue, and communicate with pedestrians.

V2P (vehicle-to-pedestrian) communication graphics will display real-time intent signals directly on the vehicle exterior — "Safe to cross," "Yielding," "Emergency vehicle approaching" — resolving traffic standoffs and improving pedestrian safety (Transfers Magazine / US DOT). These are dynamic, software-managed signals that update in real time.

Every one of these fleets is software-managed. Their wrap vendors — and their programmable surface content — will be software-managed too. WrapLeads is already integrated with Samsara and Motive, the two dominant fleet telematics platforms those operators run on. The API layer for autonomous fleet branding is not a pivot — it is a natural extension of the infrastructure already deployed.

---

### The Full Stack — Where WrapLeads Sits at Each Layer

| Layer | Industry Timeline | WrapLeads Status |
|-------|------------------|--------------------|
| Lead acquisition + CRM | **Now** | **Live** — discovery, AI calling, pipeline |
| Sales automation | **Now** | **Live** — sequences, proposals, AR preview |
| Install tracking + re-order | **Now** | **Live** — lifecycle tracker, aging alerts |
| E Ink content management | 2028–2035 | **Built** — device registry, OTA push, scheduling engine |
| Location-based ad scheduling | 2028–2035 | **Built** — geo-trigger scheduling already in content engine |
| Robotic print job export | 2028–2032 | **Roadmap Wave 1** — design brief + dimensions already captured |
| Solar energy yield tracking | 2030–2040 | **Roadmap Wave 2** — schema extension of existing lifecycle tracker |
| Smart skin diagnostics | 2030–2045 | **Roadmap Wave 2** — job record already has the data model |
| WaaS material circulation | 2030–2040 | **Roadmap Wave 2** — chain-of-custody + recycling audit layer |
| Bio-material sustainability ledger | 2028–2035 | **Roadmap Wave 2** — material catalog → carbon reporting |
| Autonomous fleet branding API | 2035–2046 | **Roadmap Wave 3** — natural extension of E Ink control plane |
| V2P communication graphics | 2035–2046 | **Roadmap Wave 3** — real-time content scheduling at vehicle scale |
| Predictive material science | 2030+ | **Roadmap Wave 3** — data flywheel from all logged installs |

No other platform is present at more than two of these layers. WrapLeads is architected — and already partially deployed — across the full stack.

---

## 10. Competitive Moat

**Why no one has built this — and why they won't catch up easily:**

Generic CRMs serve horizontal markets. They will never hardcode FMCSA fleet scoring, DI-NOC architectural film specs, race livery sponsor workflows, or re-order windows calculated from vinyl lifespan curves. This vertical knowledge is not configurable via custom fields — it is baked into the product at the query, algorithm, and UI level. It took 11 sprints of domain-specific engineering to build. It takes understanding the industry to know what to build.

**The six structural advantages:**

**1. First Mover, Zero Competition**
No purpose-built wrap shop CRM exists. The shops that adopt WrapLeads accumulate history — activities, installs, client records, sequences — that creates switching cost that compounds every month.

**2. Domain Knowledge in Code**
The FMCSA wrap-score algorithm, the material catalog with lifespan degradation curves, the Apollo title mapping per wrap category, the race livery workflow, the DI-NOC architectural renovation module — none of this is configurable. It is encoded industry expertise.

**3. The Data Flywheel**
Every install logged by every shop adds a data point to the lifespan model. More shops → more installs logged → better predictions → more accurate re-order timing → higher shop revenue → more shops join. This is a data network effect that generic CRMs cannot build because they are not collecting wrap-specific install data.

**4. Hardware Head-Start**
The E Ink device control plane is live in production. When programmable surface hardware reaches commercial scale in 3–5 years, WrapLeads will have years of device management software running. New entrants start from zero.

**5. Built by an Operator**
Every feature was validated on real jobs at Shadow Graphix before it shipped. This is not a product built by engineers guessing at industry workflows — it is a product built by the industry itself.

**6. Racing Proximity**
Speedway, Indiana. A block from Indianapolis Motor Speedway. The relationships, credibility, and physical proximity to IndyCar, IMSA, and NHRA are permanent advantages. The racing community is small, networked, and high-value. One IndyCar team referral reaches the entire paddock.

---

## 11. Go-To-Market

**Phase 1 — Indiana (Now)**
Shadow Graphix is the proof of concept. Every wrap job is a demo. Every fleet client is a case study. Own the Speedway/Indiana market with depth before expanding.

**Phase 2 — Racing Corridor (12 Months)**
Indianapolis, Charlotte, Daytona, Columbus, Bristol. The motorsports community is dense in these markets. One strong IndyCar team relationship reaches every team in the paddock. Racing wrap shops have the highest ticket sizes and the most complex workflows — the customers most likely to pay for sophisticated tooling.

**Phase 3 — National SaaS (18 Months)**
PDAA (Professional Decal Application Alliance) and SGIA (Specialty Graphics Imaging Association) — the two major industry associations — are the distribution channels. Conference presence, association-member pricing, and direct outreach to the top 500 shops by revenue. This is a channel that does not require a large sales team.

**Phase 4 — Fleet Operators Direct (24+ Months)**
Large fleets — 100+ vehicles — buy WrapLeads directly to manage their wrap vendors, track programmable surface content, and produce sustainability reports. The software is sold to the buyer (fleet operator) rather than only the seller (wrap shop). Two-sided market.

---

## 12. Unit Economics

| Metric | Estimate | Basis |
|--------|----------|-------|
| ARPU (Professional) | $149/mo | Pricing model |
| Annual contract value | $1,788 | 12 × $149 |
| Estimated LTV (3yr retention) | $5,364 | Industry avg for vertical SaaS |
| CAC target | <$500 | Association channel + word of mouth |
| LTV:CAC ratio | >10x | Target for healthy SaaS |
| Shops for $1M ARR | ~560 | $1M ÷ $1,788 |
| US addressable shops | 15,000–20,000 | PDAA/SGIA estimates |
| 5% penetration → ARR | $1.34M–$1.79M | At Professional tier |
| Wave 2: 1,000 E Ink devices | +$120K–$180K/yr | $10–15/device/mo |
| Wave 2: 50 fleet direct clients | +$750K–$1M/yr | $1,500–$2,000/mo enterprise |
| Wave 3: autonomous fleet branding API | TAM $174B by 2045 (IDTechEx) | Per-vehicle content management + V2P compliance layer |
| Wave 3: WaaS material circulation platform | Regulatory tailwind (EU EPR, McKinsey circular model) | Take rate on film leasing + recycling audit trail |

$1M ARR requires 560 shops — 3–4% of the US market at Professional pricing. That is an achievable target for a vertical SaaS with zero competition and a founder who already has industry relationships. The Wave 3 autonomous fleet layer represents a total addressable market that dwarfs the wrap shop SaaS — the software infrastructure required to manage programmable surfaces on $174B worth of robotaxi fleets is orders of magnitude larger than CRM software for 20,000 wrap shops.

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Shops are not tech-forward | Demo-driven sales; onboarding is 15 minutes; Shadow Graphix is the living proof; the product makes money visible immediately (re-orders) |
| AI API cost creep | Usage-based pricing above base tier; Haiku (cheapest model) for all background processing; OpenAI usage is optional (design/AR features) |
| E Ink hardware deployment delayed | Device infrastructure has zero carrying cost — it is code already written; a 2-year hardware delay costs nothing |
| Generic CRM enters the vertical | Domain knowledge compounds; 11 sprints of vertical engineering cannot be replicated by adding custom fields to Salesforce |
| Single-founder technical risk | CLAUDE.md documents every pattern, convention, and architectural decision; codebase is fully transferable and onboardable |
| Apollo/Vapi API dependency | Both are optional features; the CRM functions fully without either; API keys are per-user, never a shared credential |

---

## 14. The Ask

**For wrap shops** ready to leave spreadsheets: The complete OS for your business — lead discovery, AI sales engine, wrap lifecycle tracking, proposals, analytics. 14-day free trial, live in 15 minutes. Every re-order you've been missing will appear in your dashboard within a week of logging your install history.

**For fleet operators** running 25+ vehicles: WrapLeads tracks every wrap on every vehicle, tells you when each one is due for refresh before it becomes a problem, and manages your branding content — on static vinyl today, on programmable surfaces tomorrow.

**For investors** who see the surface-as-infrastructure thesis: A first-mover vertical SaaS in a $10B industry with zero existing competition. Built by an operator. Live in production. Hardware infrastructure already architected for the programmable surface transition. $1M ARR achievable at 3–4% market penetration. Data flywheel that no horizontal CRM can replicate.

The infrastructure is built. The roadmap is clear. The industry is moving in exactly one direction.

---

**Shadow Graphix / WrapLeads.io**  
Speedway, Indiana  
Steps from Indianapolis Motor Speedway  
3M Certified · Avery Certified · DI-NOC Certified · Rea Tec Certified

---

*Document generated May 2026. All feature descriptions reflect production-deployed code.*
