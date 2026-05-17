'use strict';
/**
 * Transactional email via Resend.
 * Gracefully no-ops if RESEND_API_KEY is not set (dev / test environments).
 */

const FROM = process.env.RESEND_FROM || 'WrapLeads <noreply@wrapleads.io>';
const APP_URL = process.env.APP_URL || 'http://localhost:3001';

let resend = null;
if (process.env.RESEND_API_KEY) {
  const { Resend } = require('resend');
  resend = new Resend(process.env.RESEND_API_KEY);
}

async function send({ to, subject, html }) {
  if (!resend) {
    console.log(`[email] (no-op — RESEND_API_KEY not set) To: ${to} | ${subject}`);
    return;
  }
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) console.error('[email] Resend error:', error);
    else console.log(`[email] Sent "${subject}" → ${to}`);
  } catch (e) {
    console.error('[email] Failed to send email:', e.message);
  }
}

// ── Templates ────────────────────────────────────────────────────────────────

function base(content) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0b0d;font-family:-apple-system,BlinkMacSystemFont,'DM Sans',sans-serif;color:#f4f5f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:40px auto;padding:0 20px;">
    <tr><td>
      <div style="margin-bottom:24px;">
        <span style="display:inline-block;background:#ff6b35;border-radius:8px;padding:8px 14px;font-weight:900;font-size:18px;color:#fff;letter-spacing:-0.02em;">W</span>
        <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;margin-left:8px;">WrapLeads<span style="color:#ff6b35;">.io</span></span>
      </div>
      <div style="background:#14161a;border:1px solid #2a2e36;border-radius:12px;padding:32px;">
        ${content}
      </div>
      <p style="font-size:12px;color:#5e6470;margin-top:20px;text-align:center;">
        WrapLeads.io — Lead discovery for wrap shops<br>
        <a href="${APP_URL}" style="color:#ff6b35;text-decoration:none;">${APP_URL}</a>
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(text, url) {
  return `<a href="${url}" style="display:inline-block;background:#ff6b35;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:15px;margin:20px 0;">${text}</a>`;
}

// ── Email senders ─────────────────────────────────────────────────────────────

async function sendWelcome({ to, name, trialEndsAt }) {
  const days = Math.ceil((new Date(trialEndsAt) - Date.now()) / 86400000);
  await send({
    to,
    subject: `Welcome to WrapLeads — your ${days}-day trial has started`,
    html: base(`
      <h1 style="font-size:24px;font-weight:800;margin:0 0 8px;letter-spacing:-0.02em;">
        Welcome${name ? ', ' + name.split(' ')[0] : ''}! 👋
      </h1>
      <p style="color:#9aa0aa;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Your WrapLeads trial is active. You have <strong style="color:#f4f5f7;">${days} days</strong> to
        explore the full platform — carrier discovery, AI email generation, and your lead pipeline.
      </p>
      <p style="color:#9aa0aa;font-size:14px;line-height:1.7;margin:0 0 20px;">
        <strong style="color:#f4f5f7;">To get started:</strong><br>
        1. Switch to <strong>Discover</strong> and search for carriers in your state<br>
        2. Import prospects into <strong>My Leads</strong><br>
        3. Open a lead → Email tab → generate a personalized outreach email in seconds
      </p>
      ${btn('Open WrapLeads', APP_URL)}
      <p style="color:#5e6470;font-size:12px;margin-top:20px;">
        Questions? Reply to this email and we'll help you out.
      </p>
    `),
  });
}

async function sendTrialExpiringSoon({ to, name, daysLeft }) {
  const isUrgent = daysLeft <= 1;
  await send({
    to,
    subject: isUrgent
      ? '⚠️ Your WrapLeads trial ends tomorrow'
      : `Your WrapLeads trial ends in ${daysLeft} days`,
    html: base(`
      <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;letter-spacing:-0.02em;">
        ${isUrgent ? 'Last day of your trial' : `${daysLeft} days left in your trial`}
      </h1>
      <p style="color:#9aa0aa;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hi${name ? ' ' + name.split(' ')[0] : ''},
        your WrapLeads trial ${isUrgent ? 'ends tomorrow' : `ends in ${daysLeft} days`}.
        After that, you'll need an active subscription to keep accessing your leads, saved searches, and carrier data.
      </p>
      <p style="color:#9aa0aa;font-size:14px;line-height:1.6;margin:0 0 20px;">
        Subscribe now to keep everything — plans start at <strong style="color:#f4f5f7;">$79/month</strong>, cancel any time.
      </p>
      ${btn('Subscribe Now', `${APP_URL}/`)}
      <p style="color:#5e6470;font-size:12px;margin-top:20px;">
        Your leads, saved searches, and settings are preserved when you subscribe.
      </p>
    `),
  });
}

async function sendPaymentFailed({ to, name }) {
  await send({
    to,
    subject: 'Action required — WrapLeads payment failed',
    html: base(`
      <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;letter-spacing:-0.02em;color:#f87171;">
        Payment failed
      </h1>
      <p style="color:#9aa0aa;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hi${name ? ' ' + name.split(' ')[0] : ''},
        we were unable to charge the card on file for your WrapLeads subscription.
        Please update your billing information to keep access.
      </p>
      ${btn('Update Billing', `${APP_URL}/`)}
      <p style="color:#5e6470;font-size:12px;margin-top:20px;">
        If you have questions, reply to this email and we'll sort it out right away.
      </p>
    `),
  });
}

async function sendSubscriptionActivated({ to, name }) {
  await send({
    to,
    subject: '✅ WrapLeads subscription activated',
    html: base(`
      <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;letter-spacing:-0.02em;">
        You're all set!
      </h1>
      <p style="color:#9aa0aa;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hi${name ? ' ' + name.split(' ')[0] : ''},
        your WrapLeads subscription is now active. Full access to the carrier database,
        AI email generation, and your lead pipeline — all yours.
      </p>
      ${btn('Open WrapLeads', APP_URL)}
    `),
  });
}

async function sendPasswordReset({ to, name, resetUrl }) {
  await send({
    to,
    subject: 'Reset your WrapLeads password',
    html: base(`
      <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;letter-spacing:-0.02em;">
        Password reset
      </h1>
      <p style="color:#9aa0aa;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hi${name ? ' ' + name.split(' ')[0] : ''},
        we received a request to reset your password. Click the button below — this link expires in 1 hour.
      </p>
      ${btn('Reset Password', resetUrl)}
      <p style="color:#5e6470;font-size:12px;margin-top:20px;">
        If you didn't request this, you can safely ignore this email. Your password won't change.
      </p>
    `),
  });
}

// ── Trial expiry cron ─────────────────────────────────────────────────────────

function startTrialCron(pool) {
  async function checkTrials() {
    try {
      // Users with trial ending in exactly 7 days or 1 day who haven't subscribed
      const { rows } = await pool.query(`
        SELECT email, name, trial_ends_at
        FROM users
        WHERE sub_status IN ('inactive', 'trialing')
          AND trial_ends_at IS NOT NULL
          AND trial_ends_at > NOW()
          AND (
            (trial_ends_at::date = (NOW() + interval '7 days')::date)
            OR (trial_ends_at::date = (NOW() + interval '1 day')::date)
          )
      `);
      for (const user of rows) {
        const daysLeft = Math.ceil((new Date(user.trial_ends_at) - Date.now()) / 86400000);
        await sendTrialExpiringSoon({ to: user.email, name: user.name, daysLeft });
      }
      if (rows.length > 0) {
        console.log(`[trial-cron] Sent expiry reminders to ${rows.length} user(s)`);
      }
    } catch (e) {
      console.error('[trial-cron] Error:', e.message);
    }
  }

  // Run once at startup (catches missed sends after server restart), then every 24h
  checkTrials();
  setInterval(checkTrials, 24 * 60 * 60 * 1000);
  console.log('· Trial expiry cron: running (checks daily)');
}

module.exports = {
  sendWelcome,
  sendTrialExpiringSoon,
  sendPaymentFailed,
  sendSubscriptionActivated,
  sendPasswordReset,
  startTrialCron,
};
