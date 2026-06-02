#!/usr/bin/env node
/**
 * WrapOS MCP Server
 *
 * Exposes the WrapOS CRM API as MCP tools so LLM agents can:
 *   - Search and manage leads (vehicle wrap prospects)
 *   - Discover fleet carriers from the FMCSA 2M-carrier database
 *   - Generate and send AI-powered outreach emails
 *   - Create and track proposals
 *   - Query pipeline analytics
 *   - Log jobs and lifecycle events
 *   - Manage bids
 *
 * Configuration (environment variables):
 *   WRAPOS_BASE_URL   WrapOS server URL  (default: http://localhost:3001)
 *   WRAPOS_TOKEN      JWT auth token from localStorage key "wl_token"
 *
 * Usage:
 *   WRAPOS_TOKEN=eyJ... node dist/index.js
 */
export {};
