import type { Lead } from '../api/types';

const CAT_SCORES: Record<string, number> = {
  fleet: 25, colorchange: 22, dinoc: 20, reatec: 18,
  construction: 15, gc_referral: 15, wallgraphics: 12, design: 10,
};

const STATUS_SCORES: Record<string, number> = {
  won: 30, proposal: 25, meeting: 20, replied: 15, contacted: 10, cold: 5, lost: 0,
};

export function scoreLead(lead: Lead): number {
  let score = 0;

  // Fleet size (up to 30 pts)
  const fleet = parseInt(lead.fleetSize) || 0;
  if (fleet >= 100) score += 30;
  else if (fleet >= 50) score += 25;
  else if (fleet >= 20) score += 18;
  else if (fleet >= 10) score += 12;
  else if (fleet >= 5) score += 6;

  // Category fit (up to 25 pts)
  score += CAT_SCORES[lead.category] ?? 10;

  // Pipeline stage (up to 30 pts)
  score += STATUS_SCORES[lead.status] ?? 5;

  // Data completeness (up to 15 pts)
  if (lead.email) score += 6;
  if (lead.contactName) score += 4;
  if (lead.phone) score += 3;
  if (lead.pitchAngle) score += 2;

  return Math.min(score, 100);
}

export type ScoreLabel = 'hot' | 'warm' | 'cool';

export function scoreLabel(score: number): ScoreLabel {
  if (score >= 65) return 'hot';
  if (score >= 35) return 'warm';
  return 'cool';
}

export const SCORE_COLORS: Record<ScoreLabel, string> = {
  hot: '#ef4444',
  warm: '#f59e0b',
  cool: '#64748b',
};
