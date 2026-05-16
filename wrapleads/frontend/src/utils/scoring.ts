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
