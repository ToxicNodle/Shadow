# Shadow Graphix — Dev Notes

## Tomorrow (pick up here)

### Import remaining motorsports contact info
- 49 racing leads still missing email and/or phone
- Already ran them through Apollo → paste results back to Claude to batch-import to DB
- Priority order: Brownsburg NHRA teams first (JFR, DSR, TSR, Ron Capps), then Indy IndyCar teams
- Leads are in DB as `client_id LIKE 'race-%'`
- Import command once contacts are ready: update leads SET email=..., phone=... WHERE client_id=...

---

## In Progress

### Phone Call Automation (AI outbound calling)
- Goal: auto-call "Call Ready" leads from Mission view after drip sequence completes
- Researching: Vapi.ai / Bland.ai / Twilio + Claude Realtime API
- See session for architecture discussion
