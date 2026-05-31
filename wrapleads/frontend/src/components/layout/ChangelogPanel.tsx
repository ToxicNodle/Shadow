import { useEffect } from 'react';

const CHANGELOG: Array<{
  date: string;
  tag: 'new' | 'improved' | 'fix';
  title: string;
  body: string;
}> = [
  {
    date: 'Jun 2026',
    tag: 'new',
    title: '✅ Completion Receipt — Client Sign-Off at Vehicle Pickup',
    body: 'Every job in the Jobs view now has a "Completion Receipt" button alongside the Work Order and Invoice. Click it to open a print-ready document designed to be signed by the client at vehicle pickup. The receipt includes: client name and contact info, service type and vehicle details, a 6-item QC confirmation checklist (wrap installed to spec, edges sealed, vehicle cleaned), pre-existing damage notes, warranty terms (2-year material and workmanship coverage), and a full care-and-maintenance guide (hand-wash only, no pressure washing, no harsh chemicals, park in shade). The payment summary shows total, amount paid, and balance due — with a green "PAID" stamp if the account is settled. Bottom of the document has three signature lines for the client: Signature, Printed Name, and Date — plus a Shop Representative signature block pre-filled with your name. The receipt number (CR-XXXXX) is unique per job. Protects you from post-delivery disputes and gives clients a professional, branded document at every handoff.',
  },
  {
    date: 'Jun 2026',
    tag: 'new',
    title: '🗂 Installer Work Order — Print-Ready Job Sheet for Your Install Crew',
    body: 'Every job in the Jobs view now has a "Work Order" button in the Invoice tab. Click it to open a print-ready HTML page designed to be printed and handed to your install crew before they show up to a job. The work order includes: client name and contact info, scheduled install date, vehicle type and count, crew size, material specification, job revenue and margin (internal, marked clearly), design notes and special instructions, a 9-item pre-install checklist (vehicle cleaned, temperature check, damage documentation, material confirmation, design file confirmation, etc.), and signature blocks for installer sign-off and owner QC. The work order number (WO-XXXXX) is unique per job. "Print / Save as PDF" button at the bottom uses the browser\'s native print. No email required — just hand the paper to your installer.',
  },
  {
    date: 'Jun 2026',
    tag: 'new',
    title: '🏆 Quote → Job Conversion — One Click from Accepted Quote to Booked Job',
    body: 'Accepted quotes now have a "Convert to Job" button. Click it and WrapOS automatically: creates a new job in the Wrap Lifecycle view pre-filled with the client\'s company, vehicle count (extracted from line items), wrap category, and revenue from the accepted quote total — marks the lead as Won — logs the conversion to the activity timeline ("Quote accepted → Job created · Lead marked Won"). No more manually navigating to Jobs, typing the company name again, and re-entering the revenue. The job opens in the Jobs view with all fields pre-populated. You can then set the install date, assign a subcontractor, and upload before/after photos. The button only appears on quotes with "Accepted" status — gray quotes (Draft), blue (Sent), and declined ones are unaffected.',
  },
  {
    date: 'Jun 2026',
    tag: 'new',
    title: '📦 Material Inventory — Track Your Vinyl Stock, Eliminate Run-Outs',
    body: 'WrapOS now includes a live material inventory system built for wrap shops. In Settings → Material Inventory, add every vinyl and film roll you stock — brand, product name, finish, current roll count, reorder threshold, and cost per roll. The "±" button lets you log rolls received or used with a quick delta adjustment. Set a reorder threshold (default: 2 rolls) and WrapOS will surface a "Low Material Stock" alert card on your Mission view the moment you drop to or below that level — with a "Receive" button to update stock without going back to Settings. The card shows a color-coded stock bar: green = healthy, amber = approaching reorder, red = out. Multiple materials at once are all shown together so nothing sneaks up on you mid-job. Integrates with the Material Catalog (reference guide for 3M, Avery, Arlon, DI-NOC, Rea Tec specs) already in the Jobs view.',
  },
  {
    date: 'Jun 2026',
    tag: 'new',
    title: '📄 Installation Contract Generator — Print-Ready Contracts in One Click',
    body: 'The Quotes tab now has a "Generate Contract" button that creates a professional, print-ready installation contract pre-filled with your shop info, the client\'s details, the scope of work from the most recent quote, and standard wrap shop terms. Contract includes: warranty (3 years), care instructions, design approval process, pre-existing condition disclosure, payment schedule (50% deposit + balance on delivery), cancellation policy, liability limitation, and signature blocks for both parties. Click "Print / Save PDF" inside the contract to save it as a PDF — no PDF software needed. No other wrap CRM generates contracts. Works immediately with no AI credits — runs from your settings + quote data.',
  },
  {
    date: 'Jun 2026',
    tag: 'new',
    title: '🚛 Fleet Growth Alerts — Know When a Prospect\'s Fleet Expands',
    body: 'WrapOS now monitors FMCSA fleet data weekly and alerts you when a prospect\'s fleet size grows by 15% or more. A fleet growing from 40 trucks to 50 is the clearest signal in the industry that they\'re expanding — and new vehicles need wrapping. The "Fleet Growth Alerts" card on Mission shows every prospect whose fleet grew in the last 30 days, with the exact unit count change and a one-click shortcut to the lead. Each growth event is logged to the lead\'s activity timeline with context: "Fleet grew from 40 → 50 units (+25%). Warm re-pitch signal." Requires FMCSA_SAFER_API_KEY — get a free key at mobile.fmcsa.dot.gov/developer. The monitor checks up to 100 FMCSA-sourced leads per week to stay within free-tier limits.',
  },
  {
    date: 'Jun 2026',
    tag: 'new',
    title: '📧 My Email Templates — Save & Reuse Your Best Outreach Emails',
    body: 'You can now save any AI-generated or hand-crafted email as a reusable template. In the Email tab, generate or write an email, then click "+ Save as Template" — give it a name and an optional tag (Fleet Intro, Objection, Follow-up, etc.) and it\'s saved to your personal library. Your saved templates appear at the top of the Templates tab (highlighted in blue to distinguish them from built-in system templates) and track how many times you\'ve used each one. Delete old templates directly from the list. Perfect for capturing high-performing subject lines and copy that consistently gets replies — no more rewriting from scratch.',
  },
  {
    date: 'Jun 2026',
    tag: 'new',
    title: '🔔 Mobile Push Notifications — Real-Time Alerts on Your Phone',
    body: 'WrapOS can now push real-time notifications to your phone or desktop even when the app is closed. New inbound quote requests, proposal approvals, email replies from leads, and hot prospect alerts fire as native OS notifications — no polling, no checking the app. Enable in Settings → Mobile Push Notifications. Requires VAPID keys configured on the server (generate instantly with `npx web-push generate-vapid-keys`). Works on iOS (Safari), Android (Chrome), and desktop. The push service worker (/sw.js) handles delivery and clicking a notification navigates directly to the relevant view.',
  },
  {
    date: 'Jun 2026',
    tag: 'new',
    title: '🔗 Webhook Integrations — Connect WrapOS to Zapier, Slack, and 5000+ Apps',
    body: 'Settings now has a "Webhooks & Integrations" section. Configure HTTP POST webhooks that fire automatically on key events: Lead Won, Lead Lost, Lead Stage Changed, Proposal Approved by Client, and New Inbound Quote Request. Each webhook delivery includes the full lead payload plus an HMAC-SHA256 signature header (X-WrapOS-Signature) for verification. Use a Zapier catch hook to auto-create rows in Google Sheets when you win deals, post to a Slack channel when a proposal is approved, or trigger any automation in Make, n8n, or your own system. Add an optional signing secret for security. Test any webhook with a one-click test delivery before going live.',
  },
  {
    date: 'Jun 2026',
    tag: 'new',
    title: '🔀 Omni Campaigns — Email + SMS Combined in One 4-Step Drip',
    body: 'The Email tab now has a "4-Step Omni Campaign" panel — the most powerful outreach feature in WrapOS. Launch one campaign and WrapOS automatically sends: Day 0 email (intro + portfolio), Day 3 SMS (quick check-in), Day 8 email (case study), Day 14 SMS (final touch). Email and SMS interleaved into one coordinated sequence — if the lead has no phone, SMS steps are skipped automatically; if no email, email steps are skipped. All messages are category-aware and variable-filled. The campaign worker runs every 5 minutes. Requires Twilio (for SMS steps) and Resend (for email steps). Gated at ShopFlow tier and above.',
  },
  {
    date: 'Jun 2026',
    tag: 'new',
    title: '📱 SMS Campaign Sequences — 3-Touch Text Campaigns on Autopilot',
    body: 'Every lead now has an SMS tab in the lead detail panel. Launch a 3-touch SMS campaign with one click — WrapOS sends category-aware, personalized texts on days 1, 4, and 10 automatically via Twilio. Templates are written specifically for each wrap category: fleet wraps emphasize impressions and brand visibility, construction fleets get a job-site angle, racing teams get a livery pitch. All variables (name, company, shop name, portfolio link) are auto-filled from the lead and your settings. The background worker runs every 5 minutes so messages go out on schedule even while you\'re on a job. Each sent text is logged in the activity timeline. The SMS tab also shows a "Quick Text" composer for one-off messages. Requires Twilio credentials in Settings.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '⚡ Speed-to-Lead Auto-Responder — Instant Reply to Every Inbound Quote Request',
    body: 'Every prospect who submits your public quote request form now gets an instant confirmation email — within seconds, before any competitor can respond. WrapOS sends a personalized HTML email with their request summary, your expected response time, and your portfolio link. If AI is configured, Claude generates 3 call-back talking points from the prospect\'s message and saves them as a note on the lead — so when you do call, you sound like you\'ve already done your homework. Enabled by default. Configure in Settings → Speed-to-Lead: toggle on/off, set expected response time, add a custom message. The shop owner notification now flags large fleets (10+ vehicles) with 🔥 for immediate prioritization.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '🗺️ National Lead Coverage — 18-State SOS + Automated Google Places Sweep',
    body: 'WrapOS\'s lead database now supports Secretary of State registry data from 18 US states — up from 6 Midwest states. New additions: Texas, California, Florida, Georgia, North Carolina, Pennsylvania, Washington, Colorado, Arizona, New York, Virginia, and Missouri. Each state\'s SOS bulk CSV format is supported with header aliasing (different portals use different column names). Use `npm run ingest:sos <state> <file>` to import any state\'s CSV. A new Google Places National Sweep script (`npm run ingest:sweep`) automatically sweeps 30 major metros across all US regions (south/west/east/midwest) with 10 fleet business categories — trucking, HVAC, plumbing, construction, landscaping, food trucks, and more. Run it by region or all at once. The new "Lead Database Coverage" card in Analytics shows total records by source and state, a color-coded US heatmap, source breakdown bars, and recent ingest run history.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '⭐ Client Satisfaction Ratings — Review Gating + Private Feedback',
    body: 'The review request system now collects a 1-5 star rating BEFORE sending clients to Google. Happy clients (4-5 stars) see a "Leave a Google Review" button — unhappy ones (1-3 stars) get a private "we\'ll make it right" message that only you see. Ratings are stored with optional text feedback and shown in a new Analytics card: avg rating, response rate, star distribution chart, and full feedback feed. The review page is redesigned with a proper interactive star rating UI and inline feedback text box. Send review requests from Jobs → ⭐ Reviews tab as before.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '👻 Proposals Gone Dark — AI Follow-Up Emails for Stale Proposals',
    body: 'The Mission view now shows a "Proposals Gone Dark" card listing every proposal sent 3+ days ago with no approval, decline, or recent view. Click any proposal to expand it, then hit "Generate Follow-Up Email" — WrapOS uses Claude to write a personalized 2-3 sentence nudge referencing the specific project, days since sent, and whether they opened it. Copy the email directly to clipboard for sending in Gmail, Outlook, or WrapOS\'s built-in email. Regenerate as many times as you want for a fresh angle. Proposals that get approved or declined disappear from the list automatically.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '💳 Batch Invoice Sender — Collect All Outstanding Balances at Once',
    body: 'The Jobs view has a new "Receivables" tab. It shows every job with an outstanding balance — company, install date, aging (color-coded green/amber/red), revenue, balance due, and payment status. Select any or all jobs with checkboxes, then click "Send Invoices" to email all of them at once. WrapOS resolves each client\'s email from the linked lead automatically. Jobs without a linked lead or email are skipped with a skip count. "Select All with Email" filters to only the jobs that can actually be invoiced. Marks each job as "Invoice Sent" and timestamps it. One click instead of opening each job one at a time.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '📊 Job Profitability P&L — True Margin After All Costs',
    body: 'Analytics now includes a Job Profitability table showing your true per-job P&L: revenue minus material cost minus subcontractor labor. Sort by Net Profit, Margin %, Revenue, or Most Recent. Color-coded margin badges: green ≥50%, blue ≥35%, amber ≥20%, red <20%. Totals strip at the top shows aggregate revenue, material, sub labor, net profit, and average margin across all logged jobs. A mini revenue bar on each row gives instant visual context. Overdue or unpaid jobs are flagged inline. The data feeds from your installed jobs — add Revenue and Material Cost to any job in the Jobs view to populate this table.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '📅 Install Schedule Calendar — See Your Crew\'s Month at a Glance',
    body: 'The Jobs view now has a "Schedule" tab with a full monthly calendar showing all your installs by date. Color-coded by service category (fleet = blue, DI-NOC = purple, racing = orange, etc.). Click any day to see the jobs scheduled for that date with vehicle type, count, and crew size. Set or change a scheduled install date from any job\'s Details tab — two fields: "Scheduled Install Date" and "Crew Count." The calendar automatically shows completed installs (by install date) and upcoming scheduled ones (by scheduled date). Navigate months to see your pipeline stretched across time.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '📋 Material PO Generator — Know Exactly What to Order',
    body: 'Every logged job now has a "Material PO" tab. Set the coverage level (full/partial/spot), waste factor (10–25%), material name, and cost per roll — and WrapOS instantly calculates the exact number of 25"×50\' rolls needed, with waste. Shows base sq ft, with-waste sq ft, and rolls to order. "Copy PO to Clipboard" copies a formatted purchase order ready to email your 3M or Avery distributor. "Print PO" opens a clean printable version. Each vehicle type has industry-standard sq footage built in — no looking up spec sheets.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '👷 Subcontractor Tracker — Know Your True Margin',
    body: 'Many shops farm out installs but never track sub labor as a cost — so their margin calculation is wrong. WrapOS now has full subcontractor management: add subs in Settings (name, specialty, hourly rate), then assign them to any job in the new "Subs" tab. Enter hours or a flat rate, and WrapOS shows your true cost (material + sub labor) and true margin — alongside the standard gross margin. See total subs paid and job counts in Settings. No more hidden labor costs eating into your profits.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '🚛 Fleet Survey Mode — Log Entire Fleets On-Site in Minutes',
    body: 'A new "Fleet Survey" button in the Jobs view opens a mobile-optimized multi-step wizard. Walk a client\'s lot, tap "+ Add Vehicle" for each vehicle type you see, set the quantity and condition (New / Good / Aging / Damaged), note whether it has an existing wrap to remove, and add field notes. The survey shows a live estimate ($Low–$High) as you add vehicles, calculated from industry-standard square footage per vehicle type. When done, "Export to Quote" copies a structured summary to your clipboard and takes you to your leads list — paste into a note or quote description and build from there. Designed for on-site use: big tap targets, emoji vehicle icons, no typing required.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '💵 Cash Flow Dashboard — Outstanding Receivables at a Glance',
    body: 'Analytics now includes a Cash Flow card showing every unpaid job with a balance due, organized into aging buckets: current (0–14 days), mid (15–29 days), and late (30+ days). Color-coded by age — green, amber, red. See total outstanding balance, collected month-to-date, and how much is overdue at 30+ days. "Mark Paid" directly from the table without navigating to the job. Perfect for weekly AR reviews: one screen shows exactly who owes what.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '🧾 Invoice Generator — Professional Invoices in One Click',
    body: 'Every logged job now has an "Invoice" tab. Click "View Invoice →" to open a clean, branded HTML invoice in a new tab — includes job summary, line items, balance due, payment status badge, and a direct payment link (if configured in Settings). Or email the invoice straight to the client with one click: fill in their email address and hit Send. WrapOS marks the job as "Invoice Sent" automatically and logs the timestamp. Print to PDF from the browser. No accounting software needed.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '💰 Deposit Collection — Clients Pay Directly from Their Portal',
    body: 'When a client approves a quote in their client portal, WrapOS now shows a "Pay Deposit Now" button if you\'ve configured a payment link in Settings → Deposit Collection. Paste your Stripe Payment Link URL once, and it appears automatically on every approval — showing the calculated 50% deposit amount. WrapOS tracks when clients click it and sends you a notification. The deposit button is powered by your own Stripe account, so funds go directly to you. Setup is 30 seconds: Settings → Deposit Collection → paste URL → save.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '🎙️ Voice Notes — Record Field Notes Hands-Free',
    body: 'Every lead\'s Notes tab now has a microphone button. Click it, talk, and WrapOS transcribes your voice in real-time using the browser\'s built-in speech recognition (no API key, no upload, instant). Perfect for on-site visits: walk around a fleet, narrate what you see, and hit "Use Note" to save a timestamped entry. Works in Chrome and Safari. Results appear immediately in the note field for review before saving.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '🌡️ Deal Heat Score — Know Which Deals Are About to Close',
    body: 'Every active lead now shows a "Deal Heat Score" (0–100) in the Info tab. The score is calculated from real engagement signals: email opens, reply recency, call history, portal views, and whether the client clicked the deposit payment link. A score of 70+ means "Scorching" — act now. The score decays over time when there\'s no engagement, so it rewards recency. Four signal labels explain why the score is high, so you know exactly what triggered it. No guessing — just data.',
  },
  {
    date: 'May 2026',
    tag: 'improved',
    title: '🔑 Per-User Hunter.io API Keys',
    body: 'Hunter.io API keys can now be configured per-user in Settings → Hunter.io Integration, instead of requiring a server environment variable. When configured, WrapOS uses Hunter first (25 free searches/month) before spending Apollo credits on email lookups. The email enrichment waterfall now works for every user with their own Hunter key — ideal for multi-user shops.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '⭐ Google Review Automation — One-Click Review Requests After Every Job',
    body: 'Every completed job in the Jobs view now has a "Reviews" tab. Fill in the client\'s email or phone number, optionally paste your Google Business review URL, and hit "Send Review Request." WrapOS sends a personalized branded email or SMS to the client with a single tap to leave a Google review. The landing page is clean, mobile-first, and tracks opens and clicks — so you know who saw it and who actually left a review. No other wrap CRM has this. More Google reviews = more inbound leads.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '🔍 VIN Decoder — Identify Any Vehicle Instantly',
    body: 'The Quote Builder now has a "VIN Lookup" widget powered by the NHTSA free API (no key required). Type any 17-character VIN and instantly get the make, model, year, body class, and GVWR — plus WrapOS maps it to the right vehicle type for your sq footage calculator. Hit "Use this vehicle" and the quote title auto-fills. Perfect for on-site sales calls where you\'re looking at a real truck and want to quote it accurately in 30 seconds.',
  },
  {
    date: 'May 2026',
    tag: 'improved',
    title: '📱 PWA — Install WrapOS on Your Phone Like a Native App',
    body: 'WrapOS now ships with a full PWA manifest. On iOS, tap Share → Add to Home Screen. On Android, Chrome prompts you to install automatically. The installed version runs full-screen with no browser chrome, respects your phone\'s safe areas, and uses WrapOS orange as the system theme color. Use it on-site without fumbling with browser tabs.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '🎯 Pre-Send Proposal Coach — AI Guidance Before You Click Send',
    body: 'The Quotes tab now has a "Pre-Send Proposal Coach" panel that fires before you build your proposal. Click it and Claude analyzes your won deals in the same category + this contact\'s email engagement history to give you: your historical winning price range (with deal count), a recommended subject line crafted for this specific lead, 3 specific strategy bullets (not generic advice — based on actual numbers), and 2 watch-out risk factors. The goal is to walk into every proposal with the advantage of hindsight from your most similar won deals.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '📬 Smart Send Timing — "Best Time to Reach This Contact"',
    body: 'The Email tab now shows a "Best time to send" chip above the compose area. For contacts you\'ve already emailed, it analyzes when they actually opened your emails (time of day, day of week) and shows their personal pattern — e.g., "Tue 9am (contact-specific)". For new contacts, it falls back to your overall best-performing send time across all leads. For brand-new users, it defaults to industry-standard B2B timing. The chip turns green when data is contact-specific, blue when it\'s from your history, gray for the default. Highly personalized send timing like this is something no other wrap CRM comes close to offering.',
  },
  {
    date: 'May 2026',
    tag: 'improved',
    title: '⚡ 69% Faster Initial Load — Code-Split Bundle',
    body: 'The app\'s initial download dropped from 1.2MB to 376KB (gzip: 298KB → 87KB) by lazy-loading all 8 view components and 17 modals separately. Mission, Analytics, Pipeline, Jobs, Content, Bids, Discover, and Gov views now load on demand — only the leads list and core shell are bundled upfront. First paint is dramatically faster, especially on mobile and slower connections. Views are cached after first visit so subsequent navigation is instant.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '🤖 AI Revenue Coach — Your Personal Sales Coach Knows Your Pipeline',
    body: 'A conversational AI coach now lives inside WrapOS, accessible from the 🤖 button in the bottom-right corner or via ⌘K → "AI Revenue Coach". Unlike generic AI tools, this coach has live access to your actual CRM data: pipeline stage breakdown, estimated revenue by stage, hot prospects who opened emails in the last 48 hours, overdue follow-ups, and recent activity across your leads. Ask it "What should I do today?", "Which leads are about to go cold?", "Why am I losing deals?", or anything else — and get specific, data-driven coaching referencing your real company names and numbers. Powered by Claude with full conversation history.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '🔍 Natural Language Lead Search — "Find 20-truck fleets in Ohio"',
    body: 'The Command Palette (⌘K) now understands natural language. Type "find construction fleets in Texas" or "search freight carriers midwest with 25+ trucks" and it queries the 600K-carrier FMCSA database in real time. Claude parses your intent into structured search params, explains what it searched for, and shows the top matching carriers with one-click Import buttons — all without leaving the keyboard. The fastest path from idea to lead ever built.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '⏱ Quote Follow-up Automation — Never Let a Sent Proposal Go Cold',
    body: 'Every sent quote now shows a "Schedule Follow-ups" button that queues three perfectly-timed follow-up emails: a gentle check-in at Day 3, a value-add touch at Day 7, and a concise final follow-up at Day 14. The emails are written in a real human voice — not templates, but short personal notes. Status indicator shows how many follow-ups are still pending and when the next one sends. The drip worker sends them automatically — nothing to remember.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '🔍 Discovery Call Guide — AI Qualification Worksheet',
    body: 'When a lead reaches "Replied" or "Meeting" stage, a new "Generate Discovery Call Guide" button appears in the Info tab. Click it and Claude generates a prospect-specific qualification guide: 6-8 targeted discovery questions (not generic), a vehicle measurement reference table (sq ft + material needed by vehicle type), specific upsell opportunities for this lead\'s category, and red flags to watch for. Checkable question list so you can mark off each one as you go through the call.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '🧠 AI Email Thread Summarizer — One-Click Conversation Digest',
    body: 'The Email tab now has a "Summarize Email Thread" button that reads every email you\'ve sent to a lead and distills the entire conversation into 3-5 bullet points plus a single recommended next action. The AI also reads engagement signals (open counts, last-opened dates) to assess whether the prospect has positive, neutral, or negative momentum. Perfect for getting up to speed before a call without re-reading old emails. Color-coded sentiment indicator (green/amber/red) at a glance.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '👥 Multi-Contact Manager — Track Every Decision Maker',
    body: 'Fleet deals are almost never one-person decisions. The "Contacts" section in a lead\'s Info tab now lets you add every stakeholder at an account — fleet manager, VP of Operations, CFO, procurement lead — each with their own name, title, email, phone, and role notes. Mark one as the primary contact for email outreach. Additional contacts are stored separately from the main lead record so nothing gets overwritten. An essential upgrade for any deal over $10K.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '⚡ Quick Quote — Instant Ballpark for On-the-Call Estimates',
    body: 'Hit ⌘K and type "Quick Quote" (or find it in Actions) to instantly pull up a ballpark price calculator. Select vehicle type, number of vehicles, and coverage — and see a price range with per-vehicle breakdown in under a second. Uses your real job history data when available; falls back to industry averages with fleet discounts applied automatically. Perfect for answering "how much would it cost?" on the spot without opening a full quote builder.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Market Signals — News-Based Leads Appear on Mission Dashboard',
    body: 'WrapOS now monitors Google News RSS feeds around the clock for press releases about fleet expansions, new distribution centers, fleet upgrades, and new vehicles — and auto-creates company leads from the results. The "📡 Market Signals" card on Mission surfaces the latest ones with the headline, source link, and a one-click "Import" button. No competitor watches the news for wrap opportunities. Every signal is a real, recent business event that creates a perfect personalization hook for outreach.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Deal Post-Mortem — AI Analysis of Every Lost Deal',
    body: 'Lost deals now show a "💀 Deal Post-Mortem" panel. Click it and Claude analyzes the full activity timeline, quote amount, loss reason, and competitor context to explain exactly what went wrong, what the missed pivot moment was, how recoverable the deal is (high/medium/low), and one concrete lesson for the next similar deal. Pairs with the Win Debrief to create a complete learning loop — learn from your wins AND your losses.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Win-Rate Advisor in Quote Builder — Live Pricing Sweet Spot',
    body: 'The quote builder now shows a live color-coded indicator (green/amber/red) that tells you whether your current quote total falls inside your historical sweet spot for that lead category. Based on real proposal win/loss outcomes from your own CRM — not generic benchmarks. As you type prices, the indicator updates in real time. If you\'re outside the sweet spot, it shows your best range. Gets smarter with every proposal you send and close.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'AI Cold Call Opener — Personalized Phone Scripts Per Lead',
    body: 'Any active lead now has a "📞 Call Opener" panel in the Info tab. Click it and Claude generates a natural, confident 2-3 sentence phone opening based on that company\'s specific data — fleet size, category, location, recent CRM activity. Not a generic script. An opener that sounds like you\'ve done your homework. Includes a one-line coaching tip. Copy to clipboard before you dial.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'DOT Number Quick-Import — Instant FMCSA Carrier Lookup',
    body: 'Type any 7–9 digit DOT number directly into the command palette (⌘K) and WrapOS instantly looks up that carrier in the FMCSA database — no searching required. See company name, location, fleet size, and wrap score in a preview card. One click imports the carrier straight into your CRM as a lead. Works with bare DOT numbers ("1234567") or with a prefix ("dot 1234567"). If the carrier is already in your CRM, the panel shows "IN CRM" instead of the import button.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Meeting Prep Brief — AI Call Preparation Guide',
    body: 'Any lead in "Meeting" status now has a 📋 "Meeting Prep Brief" panel in the Info tab. Click it and Claude generates a full call prep document in seconds: company snapshot, exact opening line, 4-step talk track, 3 likely objections with counters, questions to ask, pricing strategy recommendation, closing move, and a social proof note using your similar wins. One-click "Copy Full Brief" to paste into your notes app before the call.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Objection Counter Engine — AI Re-Engagement for "No" Replies',
    body: 'Mission now has an "Objection Inbox" card that surfaces every lead from the last 21 days who replied with a pricing question, a "not right now," or a skeptical no — and lets you generate a tailored AI counter-response with one click. The AI reads the full context of your relationship with that lead and writes a warm, specific re-engagement email (not a generic template). Includes a coach tip explaining why that angle works. Copy to clipboard or jump straight to the lead\'s email tab.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Smart Follow-up Composer — Context-Aware AI Emails',
    body: 'The Email tab now has a "✨ Smart Follow-up" button that reads your entire history with a lead — past emails, proposals, activities, time since last contact — and writes a follow-up that references specific things you\'ve actually discussed. Not a template. A real response to a real relationship. The AI also explains why it chose that particular angle in a one-sentence reasoning note.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Client Referral Engine — AI Referral Ask Generation',
    body: 'Mission now shows a "Referral Engine" card listing your top won clients who haven\'t been asked for a referral yet — scored by recency of win, deal value, and vehicles wrapped. Click "Request Referral" on any row and Claude Haiku writes a warm, personalized referral ask email referencing their specific job. Preview the email, copy to clipboard, or send directly via Resend. The lead is stamped with a referral_asked_at timestamp and logged to their activity timeline — no more manual tracking.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Daily Briefing — AI Morning Pipeline Snapshot',
    body: 'Mission now opens with a "Today\'s Briefing" card showing an AI-written 2-sentence summary of your pipeline every morning — how many active deals you have, what\'s overdue, what\'s close to closing, and what to prioritize. Cached for 4 hours so it loads instantly. Falls back to a plain data summary if Claude is not configured. Starts your day with a clear picture, not a wall of data.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Account Health Card for Won Clients',
    body: 'Every won lead now shows a "🤝 Account Health" panel showing the relationship vitals: days since last contact, jobs logged, vehicles wrapped, total revenue, whether you\'ve asked for a referral, and upcoming wrap expiry dates — with a 0-100 health score. Green = strong relationship. Orange = at risk. Red = dormant. One click jumps to the Jobs view to log an install or create a re-order.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Vehicle Sq Footage Calculator in Quote Builder',
    body: 'The quote builder now has a "📐 Sq Footage Helper" — select vehicle type (cargo van, box truck, semi trailer, 18 types total), coverage level (full/partial/spot), and fleet count. The exact industry-standard square footage calculates instantly and one click fills in your material line item. No more looking up spec sheets or guessing.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Win Debrief + Pattern Library',
    body: 'Won a deal? Click "🏆 Generate Win Debrief" in the lead info tab and Claude analyzes the full activity timeline — how many touches, how many days, what signal preceded the win, what tactic closed it — and writes a structured brief. Over time, these accumulate into a "Win Pattern Library" in Analytics showing your top winning patterns, avg days to close by category, and the playbook you\'re actually using (even if you didn\'t know it).',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Pricing Intelligence — Win Rate by Price Tier',
    body: 'Analytics now shows a "Pricing Intelligence" card that correlates your quote amounts with deal outcomes to identify your sweet spot pricing by category. See average won vs. lost price for Fleet, GC Referral, DI-NOC, and every other category — then drill into low/mid/high tiers with win rates for each. Star ★ marks your highest-win-rate tier. Stop guessing on price.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Deal Coach — AI Closing Tactics Per Deal',
    body: 'Every active lead (contacted/replied/meeting/proposal) now has a "🎯 Coach Me" button in the info tab. Click it and Claude analyzes all your activity with that specific company and returns 3 personalized closing tactics, a closing probability score, urgency level, and a single key insight. No generic advice — specific to THIS deal, THIS company, and what you\'ve already tried.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Stale Pipeline Recovery Card',
    body: 'Mission now shows a "Stale Pipeline" card listing every active deal with no activity in 14+ days — ranked by how long they\'ve been silent. Click any row to jump straight to the lead. Deals at 30+ days show in red. A single follow-up today can revive a deal you thought was dead.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Speed Dial — AI-Ranked Call Queue',
    body: 'Mission now shows a "Speed Dial" card with your top 5 leads to contact right now, ranked by urgency score (email opens, proposal views, days overdue, follow-up timing). Each lead shows an AI-generated pitch angle, signal badges, and one-click Call / Email / Open / Done / Skip actions so you can blast through your call list without touching the CRM.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Quote Pricing Benchmarks',
    body: 'The quote builder now shows a "Your Past Jobs" benchmark strip when creating a quote — average total, per-vehicle pricing, and min/max range pulled from your actual completed jobs in the same category. Gets smarter the more jobs you log. Lets you price with confidence instead of guessing.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Daily Task Queue with AI Generation',
    body: 'Mission now has a "Today\'s Tasks" card — an AI-powered daily to-do list built from your actual pipeline state. Click "AI Tasks" and Claude analyzes your hot leads, overdue follow-ups, sent proposals, and recent wins to generate 5-7 specific, prioritized action items. Add manual tasks, complete with one click, and see everything done today at a glance.',
  },
  {
    date: 'May 2026',
    tag: 'improved',
    title: 'AI Personalized Broadcast Email',
    body: 'Toggle "AI Personalize" when sending a broadcast email and Claude generates a unique opening sentence for each recipient — referencing their specific fleet size, city, and business context. Preview personalized versions for the first 3 leads before sending to the full list.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Project Milestone Tracker',
    body: 'Every lead now has a "📋 Project" tab that auto-generates a category-specific project checklist after you win the deal — from measurements and design approval through material ordering and final sign-off. Track completion with one click per step, add custom steps, and get a direct "Log Install →" button when everything is done.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Outreach Calendar — 12-Month Wrap Sales Planner',
    body: 'Analytics now shows a full-year outreach calendar with AI-curated selling themes, hottest wrap categories, and tailored pitch angles for every month. Click any month to see the exact messaging to use, which categories to push, and how many active pipeline leads you have that month. Current month is highlighted with a "NOW" indicator.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Quote Follow-Up Intelligence',
    body: 'Proposals now show a "Quote Follow-Up Intelligence" panel with the exact days since the quote was sent, your category\'s industry benchmark (fleet=7d, construction=10d, GC=14d), an urgency indicator, and an AI-generated follow-up email draft tailored to the elapsed time. On track, follow up now, or overdue — you always know exactly what action to take.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Intent Signals Dashboard',
    body: 'Mission now shows a real-time "buying intent" leaderboard across ALL signal types: email opens (3pts), proposal views (4pts), recent replies (10pts), and aging wrap lifecycle signals (6pts). Leads are scored and ranked so you always know exactly who to call first. Refreshes every 5 minutes.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Referral Mining — Automated 30-Day Win Follow-Up',
    body: 'A background worker runs daily and fires a notification exactly 30 days after you win a deal — while the client relationship is warmest. One click generates a personalized referral ask email and copies it to your clipboard. No manual tracking required.',
  },
  {
    date: 'May 2026',
    tag: 'improved',
    title: 'AI Call Intelligence — Objection + Key Info Extraction',
    body: 'After every AI outbound call, Claude now analyzes the full transcript to extract: objections raised, key information (fleet count, rebrand timeline, budget hints), prospect sentiment, and the single best next action. All extracted intel appears in the lead\'s activity timeline and auto-populates competitor/notes fields.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Pipeline Doctor — AI Bottleneck Diagnosis',
    body: 'Analytics now includes a Pipeline Doctor card that calculates your stage-by-stage conversion rates, pinpoints your single biggest chokepoint, grades your overall pipeline health A–F, and generates 3 specific AI recommendations to fix the leak. Powered by Claude Haiku, refreshed on demand.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Territory Intel — Untouched Opportunity by State',
    body: 'A new Analytics card ranks every U.S. state by untouched wrap opportunity — sweet-spot carriers (25–500 vehicles) you haven\'t contacted yet, weighted by avg fleet size. Click any state row to launch a pre-filtered Discover search. States where you\'ve already won deals are highlighted in green.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Warm Reference Engine',
    body: 'Every lead detail now shows a "Social Proof" panel listing up to 3 won customers in the same state or service category. Name-drop these during cold outreach — fleet managers always ask "have you done this before?" Now you have a ready answer with dollar amounts and cities.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Prospect News Intelligence',
    body: 'A background worker now monitors your active pipeline leads for recent company news. When a lead makes headlines — fleet expansion, rebrand, contract win — you get an instant notification and the article is logged to the lead\'s activity timeline. Each lead detail also has a "Company News Intel" panel to check on-demand. Uses Google News RSS, zero cost.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Truck Scan to Lead',
    body: 'Photograph any commercial truck in the wild. Claude Vision extracts the company name and DOT number, cross-references 600K FMCSA carriers, and imports the match to your CRM in one tap. Works from Discover (🚛 Scan Truck button), the Command Palette, or a direct camera shot on mobile.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Competitive Intel — Counter-Pitch from Wrap Photo',
    body: 'Upload a photo of a competitor\'s wrap to any lead record. AI analyzes design quality, identifies weaknesses, and generates a specific counter-pitch tailored to the fleet manager seeing that competitor\'s work. Rates competitor quality as budget/mid-range/premium and lists your winning selling points.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Re-Order Lead from Job Tracker',
    body: 'Any logged install in the Wrap Lifecycle Tracker now has a "Create Re-Order Lead" button — both in the job detail modal and inline on aging/expiring jobs. Creates a pre-filled CRM lead with expiry context, logs an activity, and navigates directly to the leads view.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: '3-Month Revenue Projection',
    body: 'Analytics now shows a confidence-range revenue forecast for the next three months, combining your current pipeline stages with actual historical win rates. Shows low/expected/high ranges, tracks progress against your monthly goal, and lists the specific deals driving each month\'s projection.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Email Send-Time Intelligence',
    body: 'Analytics now shows exactly when your prospects open emails — hour-of-day bars and day-of-week breakdown for the last 90 days. Surfaces the optimal outreach windows and lists leads who have opened emails recently so you can strike while they\'re engaged.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Seasonal Win Intelligence',
    body: 'A new Analytics card shows your month-by-month win history as a sparkline, identifies which service category is historically strongest in the current season, and surfaces the active pipeline leads you should push right now to ride that seasonal wave.',
  },
  {
    date: 'May 2026',
    tag: 'improved',
    title: 'Discover — Near My Shop + Signal Badges',
    body: 'A new "Near My Shop" quick preset searches your home state plus adjacent states with one click. Carrier rows now show Signal and GOV badges for leads sourced from live news events or SAM.gov federal contracts, and expand to show the original article headline and link.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Quote Expiry Alerts',
    body: 'A new background worker fires daily and notifies you when a sent quote is within 3 days of its validity window expiring — prompting a follow-up call before the client has to ask for a reprice.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Loss Intelligence + AI Win-Back Emails',
    body: 'When marking a deal lost, a structured modal now captures the loss reason (price, competitor, timing, etc.) and competitor name. Analytics view shows a "Loss Intelligence" card with why-we-lose breakdown, competitor rankings, and one-click AI win-back email generation for recoverable losses.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'Client Portal Design Sign-Off',
    body: 'The client portal now shows ALL design concepts you\'ve shared (not just the latest), with a proper "Approve Design" button that creates a formal sign-off record. Clients can also request revisions with notes. Both actions notify you instantly.',
  },
  {
    date: 'May 2026',
    tag: 'new',
    title: 'AI URL Import',
    body: 'Paste any company website, LinkedIn page, or directory listing — AI extracts company name, contact info, fleet size, city/state, category, and generates a pitch angle. Review and edit before adding to your pipeline.',
  },
  {
    date: 'May 2026',
    tag: 'improved',
    title: 'Email Signature Auto-Enrichment',
    body: 'When a prospect replies to your outreach email, WrapOS automatically scans the email signature and backfills missing contact name, phone number, and title on the lead record — no manual copy-paste.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'AR Preview: variations, brand colors & fleet batch',
    body: 'Generate 3 wrap variations at once, match the client\'s exact brand colors, preview an entire fleet in one pass, push concepts straight to a client approval link, and save concepts to the job gallery — all from the AR Wrap Preview.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Pipeline Health Score',
    body: 'Analytics now shows a 0-100 composite score benchmarking your shop against wrap industry standards — win rate, days to close, email open rate, and monthly outreach volume.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Lead Tags + Tag Filter',
    body: 'Tag any lead with custom labels ("Hot Q4", "Budget confirmed", "Decision maker"). Tags appear as color-coded pills on lead cards and a chip bar lets you filter instantly.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Market Penetration Analysis',
    body: 'Analytics cross-references your pipeline with the FMCSA carrier database — see exactly how many untapped fleets exist in each state you\'re already working and launch a Discover search in one click.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Action Calendar in Pipeline',
    body: 'A 5-week Mo–Su calendar in Pipeline view shows follow-up due dates and bid deadlines as colored dots. Click any day to see the event detail and jump to the lead.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Quote Builder Templates',
    body: 'Six pre-loaded quote templates (Box Truck, Passenger Van, Semi Trailer, Fleet Package, Color Change, DI-NOC/Rea-Tec) auto-populate line items with industry-accurate pricing.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Won Deal Drill-Down',
    body: 'Click any revenue bar in Analytics to see the exact deals that made up that month — company, category, value, and a direct link to the lead.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Import & Launch Sequences in One Click',
    body: 'Select carriers in Discover → "Import & Launch Sequences" → AI email campaigns start automatically. You land on Mission to watch them run.',
  },
  {
    date: 'May 2025',
    tag: 'improved',
    title: 'Revenue Trend Chart',
    body: 'The Analytics "Won" chart now shows estimated revenue per month (not just deal count), scaled by category — fleet $4.5K, GC referral $18K, motorsport $40K.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Wrap ROI Calculator',
    body: 'Fleet leads now show a CPM comparison tool: enter cost/vehicle and annual miles to see cost-per-thousand-impressions vs billboards, radio, and TV.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'GC Directory in Bid Tracker',
    body: 'New "GC Directory" tab aggregates all general contractors you\'ve bid with — win rate, total bid value, and last won date per GC.',
  },
  {
    date: 'May 2025',
    tag: 'improved',
    title: 'Upgrade Flow — ROI Context',
    body: 'Pricing page now shows per-plan ROI multipliers (WrapLeads 4.7×, ShopFlow 10×, WrapOS 13×) and an industry deal-size benchmark strip.',
  },
  {
    date: 'May 2025',
    tag: 'improved',
    title: 'Discover Sort & Phone Filter',
    body: 'Sort carrier results by fleet size, wrap score, name, or recency. Toggle "Has Phone" to show only contactable carriers.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Wrap Portfolio Value Strip',
    body: 'Jobs view now shows total estimated portfolio value, revenue by category, and re-order pipeline count at a glance.',
  },
  {
    date: 'May 2025',
    tag: 'new',
    title: 'Search Intelligence Strip',
    body: 'Discover search results now show a smart summary: avg fleet size, hot lead count, contactable %, and estimated territory opportunity.',
  },
  {
    date: 'Apr 2025',
    tag: 'new',
    title: 'Win Probability on Bids',
    body: 'Bid cards now show win probability badges (15% → 65%) with color-coded confidence, plus quick-advance buttons to move bids through stages.',
  },
];

const TAG_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  new:      { bg: 'rgba(99,102,241,0.15)',  color: '#818cf8', label: 'New'      },
  improved: { bg: 'rgba(16,185,129,0.12)',  color: '#34d399', label: 'Improved' },
  fix:      { bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24', label: 'Fix'      },
};

const CHANGELOG_SEEN_KEY = 'wl_changelog_seen';
const LATEST_DATE = CHANGELOG[0].date;

export function getChangelogBadge(): boolean {
  try {
    return localStorage.getItem(CHANGELOG_SEEN_KEY) !== LATEST_DATE;
  } catch {
    return false;
  }
}

export default function ChangelogPanel({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    try { localStorage.setItem(CHANGELOG_SEEN_KEY, LATEST_DATE); } catch { /* noop */ }
  }, []);

  return (
    <>
      <div className="notif-backdrop" onClick={onClose} />
      <div className="notif-panel" style={{ width: 340 }}>
        <div className="notif-header">
          <span className="notif-title">What's New</span>
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>WrapLeads changelog</span>
        </div>

        <div className="notif-list" style={{ maxHeight: 480 }}>
          {CHANGELOG.map((entry, i) => {
            const ts = TAG_STYLES[entry.tag];
            return (
              <div
                key={i}
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                    padding: '2px 6px', borderRadius: 4,
                    background: ts.bg, color: ts.color,
                    flexShrink: 0,
                  }}>
                    {ts.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
                    {entry.title}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>
                    {entry.date}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  {entry.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
