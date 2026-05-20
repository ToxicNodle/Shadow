import type { Lead } from '../api/types';

const CAT_SCORES: Record<string, number> = {
  fleet: 25, colorchange: 22, dinoc: 20, reatec: 18,
  construction: 15, gc_referral: 15, wallgraphics: 12, design: 10,
};

const STATUS_SCORES: Record<string, number> = {
  won: 30, proposal: 25, meeting: 20, replied: 15, contacted: 10, cold: 5, lost: 0,
};

export interface ScoreBreakdown {
  total: number;
  factors: { label: string; points: number; max: number }[];
}

export function scoreBreakdown(lead: Lead): ScoreBreakdown {
  const factors: ScoreBreakdown['factors'] = [];
  let score = 0;

  const fleet = parseInt(lead.fleetSize) || 0;
  const fleetPts = fleet >= 100 ? 30 : fleet >= 50 ? 25 : fleet >= 20 ? 18 : fleet >= 10 ? 12 : fleet >= 5 ? 6 : 0;
  score += fleetPts;
  factors.push({ label: `Fleet Size (${fleet > 0 ? fleet + ' units' : 'unknown'})`, points: fleetPts, max: 30 });

  const catPts = CAT_SCORES[lead.category] ?? 10;
  score += catPts;
  factors.push({ label: `Category (${lead.category})`, points: catPts, max: 25 });

  const statusPts = STATUS_SCORES[lead.status] ?? 5;
  score += statusPts;
  factors.push({ label: `Pipeline Stage (${lead.status})`, points: statusPts, max: 30 });

  const emailPts = lead.email ? 6 : 0;
  const namePts = lead.contactName ? 4 : 0;
  const phonePts = lead.phone ? 3 : 0;
  const pitchPts = lead.pitchAngle ? 2 : 0;
  const dataPts = emailPts + namePts + phonePts + pitchPts;
  score += dataPts;
  factors.push({ label: `Data Completeness`, points: dataPts, max: 15 });

  return { total: Math.min(score, 100), factors };
}

export function scoreLead(lead: Lead): number {
  return scoreBreakdown(lead).total;
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

// Stage base close probability (0–1)
const STAGE_PROB: Record<string, number> = {
  won: 1.0, proposal: 0.55, meeting: 0.35, replied: 0.22,
  contacted: 0.12, cold: 0.06, new: 0.04, lost: 0.0,
};

export function winProbability(lead: Lead): number {
  let p = STAGE_PROB[lead.status] ?? 0.05;

  // Score bonus/penalty
  const score = scoreLead(lead);
  if (score >= 65) p += 0.06;
  else if (score >= 35) p += 0.02;
  else p -= 0.02;

  // Data completeness bonus
  if (lead.email) p += 0.03;
  if (lead.phone) p += 0.02;

  // Fleet size bonus (larger deal → more committed buyer)
  const fleet = parseInt(lead.fleetSize || '0') || 0;
  if (fleet >= 25) p += 0.05;
  else if (fleet >= 10) p += 0.02;

  // Recency penalty
  if (lead.lastContacted) {
    const days = Math.floor((Date.now() - new Date(lead.lastContacted).getTime()) / 86_400_000);
    if (days > 30) p -= 0.08;
    else if (days > 14) p -= 0.04;
  }

  // Clamp: never show 100% for active leads, never below 1%
  if (lead.status === 'won') return 100;
  if (lead.status === 'lost') return 0;
  return Math.round(Math.max(1, Math.min(94, p * 100)));
}

export function winProbabilityColor(prob: number): string {
  if (prob >= 50) return '#10b981';
  if (prob >= 25) return '#f59e0b';
  if (prob >= 10) return '#94a3b8';
  return '#64748b';
}
