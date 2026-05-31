'use strict';

const ITC_CONSTRUCTION_START = new Date('2026-07-04T00:00:00Z');
const ITC_IN_SERVICE = new Date('2027-12-31T00:00:00Z');
const ITC_STEP_DOWN_2033 = new Date('2033-01-01T00:00:00Z');

function daysUntil(target) {
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function daysUntilITCDeadline() {
  return daysUntil(ITC_CONSTRUCTION_START);
}

function daysUntilInService() {
  return daysUntil(ITC_IN_SERVICE);
}

function daysUntilStepDown() {
  return daysUntil(ITC_STEP_DOWN_2033);
}

function urgencyBanner() {
  const days = daysUntilITCDeadline();
  if (days <= 0) {
    const serviceDays = daysUntilInService();
    if (serviceDays > 0) {
      return {
        level: 'critical',
        days: serviceDays,
        headline: `${serviceDays} days until ITC in-service deadline`,
        detail: 'The construction-start window has closed. Systems must be placed in service by December 31, 2027 to qualify for the full 30% ITC.',
        badge: `${serviceDays}d to in-service`,
      };
    }
    return {
      level: 'info',
      days: daysUntilStepDown(),
      headline: 'ITC step-down begins 2033',
      detail: 'The 30% federal Investment Tax Credit begins stepping down after 2032. Projects started now still qualify for the full credit.',
      badge: 'ITC 30% available',
    };
  }
  if (days <= 30) {
    return {
      level: 'critical',
      days,
      headline: `${days} days to lock in 30% ITC`,
      detail: `Construction must start by July 4, 2026 to qualify for the full 30% federal Investment Tax Credit. That's ${days} days. After this date, only projects already under construction qualify.`,
      badge: `${days}d left`,
    };
  }
  if (days <= 90) {
    return {
      level: 'urgent',
      days,
      headline: `${days} days to lock in 30% ITC`,
      detail: `The 30% federal ITC requires construction start by July 4, 2026. At current permitting timelines (60–90 days), projects that haven't started design NOW may miss the window.`,
      badge: `${days}d left`,
    };
  }
  return {
    level: 'normal',
    days,
    headline: `${days} days until ITC construction-start deadline`,
    detail: 'The 30% federal Investment Tax Credit requires construction to begin by July 4, 2026. Plan now to lock in the full credit before the step-down.',
    badge: `${days}d to deadline`,
  };
}

function htmlBanner() {
  const u = urgencyBanner();
  const colors = {
    critical: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
    urgent: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
    normal: { bg: '#f0f9ff', border: '#93c5fd', text: '#1e40af' },
    info: { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
  };
  const c = colors[u.level] || colors.normal;
  return `<div style="padding:14px 18px;background:${c.bg};border:1px solid ${c.border};border-radius:8px;font-size:13px;font-weight:600;color:${c.text};">` +
    `<strong>${u.headline}</strong> — ${u.detail}</div>`;
}

function htmlCountdownBadge() {
  const u = urgencyBanner();
  const colors = { critical: '#ef4444', urgent: '#f59e0b', normal: '#3b82f6', info: '#22c55e' };
  const c = colors[u.level] || colors.normal;
  return `<span style="display:inline-block;padding:4px 10px;background:${c};color:#fff;font-size:11px;font-weight:800;letter-spacing:0.06em;border-radius:4px;text-transform:uppercase;">${u.badge}</span>`;
}

module.exports = {
  daysUntilITCDeadline,
  daysUntilInService,
  daysUntilStepDown,
  urgencyBanner,
  htmlBanner,
  htmlCountdownBadge,
  ITC_CONSTRUCTION_START,
  ITC_IN_SERVICE,
  ITC_STEP_DOWN_2033,
};
