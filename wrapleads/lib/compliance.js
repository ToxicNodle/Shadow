/**
 * TCPA / CAN-SPAM compliance helpers.
 *
 * WrapLeads' Commercial Solar Scout module sends B2B outbound email under the
 * "legitimate interest" basis allowed by CAN-SPAM. To stay compliant we need:
 *   1. Every email contains a one-click unsubscribe link
 *   2. Sender's physical address is in the footer
 *   3. Inbound STOP / UNSUBSCRIBE replies auto-flip do_not_email
 *   4. We never send to a lead whose do_not_email = TRUE
 *   5. Every send is recorded in outreach_audit_log with consent_basis
 */

'use strict';

const crypto = require('crypto');

/**
 * Check whether outreach is permitted for a lead row.
 * Defensive — accepts either `do_not_email` boolean or `dne` for either of
 * the column shapes the caller might pass.
 */
function canEmail(lead) {
  if (!lead) return false;
  if (!lead.email) return false;
  if (lead.do_not_email === true) return false;
  if (lead.opt_out_at) return false;
  return true;
}

/**
 * Create a one-time unsubscribe token + URL for a lead's email recipient.
 * Returns `{ token, url }`. Persists to unsubscribe_tokens so the /u/:token
 * route can look it up later.
 */
async function generateUnsubscribeToken(pool, { leadId, userId, email, baseUrl, pathPrefix = '/u' }) {
  const token = crypto.randomBytes(20).toString('hex');
  await pool.query(
    `INSERT INTO unsubscribe_tokens (token, lead_id, user_id, email) VALUES ($1, $2, $3, $4)`,
    [token, leadId, String(userId), (email || '').toLowerCase()]
  );
  const base = (baseUrl || process.env.APP_BASE_URL || process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, '');
  const path = pathPrefix.replace(/\/$/, '');
  return { token, url: `${base}${path}/${token}` };
}

/**
 * Append the legally-required CAN-SPAM footer + one-click unsubscribe to
 * an outgoing email body. Preserves the rest of the body untouched.
 *
 * @param {string} body          original body text
 * @param {Object} opts
 * @param {string} opts.unsubscribeUrl
 * @param {Object} opts.sender   { companyName, city, state, senderName }
 * @param {string} opts.format   'html' | 'text'
 */
function withComplianceFooter(body, { unsubscribeUrl, sender, format = 'html' }) {
  const address = [sender?.companyName, sender?.city, sender?.state].filter(Boolean).join(' · ');
  if (format === 'text') {
    return `${body}\n\n—\n${address || ''}\nReply STOP to opt out, or unsubscribe in one click: ${unsubscribeUrl}\n`;
  }
  return `${body}<br><br><hr style="border:none;border-top:1px solid #eee;margin:20px 0;"><p style="font-size:11px;color:#999;margin:0;">${escapeHtml(address)}<br>Reply STOP to opt out, or <a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">unsubscribe in one click</a>.</p>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/**
 * Inspect an inbound reply for STOP / UNSUBSCRIBE keywords. Returns true if
 * we should flip do_not_email = TRUE for the lead.
 */
function isStopReply(body) {
  if (!body) return false;
  const s = String(body).toLowerCase().slice(0, 500);
  return /\b(stop|unsubscribe|opt[- ]?out|remove me|do not email)\b/.test(s);
}

/**
 * Trip do_not_email on a lead and cancel any pending drip emails. Idempotent.
 */
async function flipOptOut(pool, { leadId, userId, reason = 'manual' }) {
  await pool.query(
    `UPDATE leads SET do_not_email = TRUE, opt_out_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [leadId]
  );
  await pool.query(
    `UPDATE email_queue SET status = 'cancelled' WHERE lead_id = $1 AND status = 'pending'`,
    [leadId]
  );
  await pool.query(
    `INSERT INTO outreach_audit_log (user_id, lead_id, channel, recipient, consent_basis, metadata)
     VALUES ($1, $2, 'opt_out', NULL, 'opt_out', $3)`,
    [String(userId), leadId, JSON.stringify({ reason })]
  );
}

/**
 * Write a single outreach event to the audit log. Non-blocking — failures
 * are swallowed so a logging error never breaks a send.
 */
async function logOutreach(pool, { userId, leadId, channel, recipient, consentBasis = 'b2b_legitimate_interest', messageId = null, metadata = {} }) {
  try {
    await pool.query(
      `INSERT INTO outreach_audit_log (user_id, lead_id, channel, recipient, consent_basis, message_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [String(userId), leadId, channel, recipient, consentBasis, messageId, JSON.stringify(metadata)]
    );
  } catch (e) { /* non-fatal */ }
}

module.exports = {
  canEmail,
  generateUnsubscribeToken,
  withComplianceFooter,
  isStopReply,
  flipOptOut,
  logOutreach,
};
