import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { useMemo } from 'react';
import type { Lead, LeadActivity } from '../../../api/types';

// AI Whisper — a single, quietly italicized observation derived from
// the lead's actual activity history.  Not generative AI — pattern
// extraction.  Surfaces real signal the user hasn't connected:
// "responds best to morning emails", "5d cadence works", etc.
//
// Renders nothing if there's no signal yet (avoids noise).

type ActivityItem = LeadActivity;

function pickWhisper(lead: Lead, activities: ActivityItem[]): string | null {
  if (!activities || activities.length < 3) return null;

  // ── Signal 1: time-of-day preference for replies ──
  const replies = activities.filter((a) => a.type === 'email_reply');
  if (replies.length >= 2) {
    const hours = replies.map((a) => new Date(a.created_at).getUTCHours());
    const morning = hours.filter((h) => h >= 12 && h < 17).length;   // 8a-1p ET ≈ 12-17 UTC
    const afternoon = hours.filter((h) => h >= 17 && h < 22).length;
    if (morning > afternoon && morning >= 2) {
      return `Responds best in the morning — ${morning} of ${replies.length} replies came before noon their time.`;
    }
    if (afternoon > morning && afternoon >= 2) {
      return `Best response window: afternoon — ${afternoon} of ${replies.length} replies arrived after lunch.`;
    }
  }

  // ── Signal 2: cadence between contacts ──
  const sentEmails = activities
    .filter((a) => a.type === 'email_sent' || a.type === 'email_generated')
    .map((a) => new Date(a.created_at).getTime())
    .sort((a, b) => a - b);
  if (sentEmails.length >= 3 && replies.length >= 1) {
    const gaps: number[] = [];
    for (let i = 1; i < sentEmails.length; i++) {
      gaps.push((sentEmails[i] - sentEmails[i - 1]) / 86_400_000);
    }
    const median = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    if (median >= 4 && median <= 10) {
      return `Your ${Math.round(median)}-day follow-up cadence is producing replies — keep the rhythm.`;
    }
    if (median > 14) {
      return `${Math.round(median)}-day gaps between touches — try tightening to 5–7 days for higher reply rates.`;
    }
  }

  // ── Signal 3: stalling at current stage ──
  const stageMoves = activities.filter((a) => a.type === 'status_changed');
  if (stageMoves.length > 0 && !['won', 'lost'].includes(lead.status)) {
    const lastMove = new Date(stageMoves[0].created_at).getTime();
    const daysStuck = Math.floor((Date.now() - lastMove) / 86_400_000);
    if (daysStuck > 14 && lead.status === 'proposal') {
      return `${daysStuck} days at proposal stage — a friendly check-in unlocks 40% of stalled deals.`;
    }
    if (daysStuck > 21 && lead.status === 'contacted') {
      return `Three weeks at "contacted" — try a different angle (price, urgency, or referral).`;
    }
  }

  // ── Signal 4: high email engagement, no reply ──
  const opens = activities.filter((a) => (a.metadata?.opened as boolean) === true);
  if (opens.length >= 3 && replies.length === 0) {
    return `Opened your emails ${opens.length}× but hasn't replied — they're reading. Try a direct question next.`;
  }

  // ── Signal 5: proposal viewed multiple times ──
  const propViews = activities.filter((a) => (a.metadata?.proposal_view as boolean) === true);
  if (propViews.length >= 3) {
    return `Proposal viewed ${propViews.length} times — they're shopping it. Call to close before they shop someone else.`;
  }

  return null;
}

export default function AIWhisper({ lead }: { lead: Lead }) {
  const { data } = useQuery({
    queryKey: ['lead-activities-whisper', lead.serverId],
    queryFn: () => (lead.serverId ? api.getActivities(lead.serverId) : Promise.resolve({ activities: [] })),
    enabled: !!lead.serverId,
    staleTime: 120_000,
  });

  const activities = (data?.activities ?? []) as unknown as ActivityItem[];
  const whisper = useMemo(() => pickWhisper(lead, activities), [lead, activities]);

  if (!whisper) return null;

  return (
    <div className="ai-whisper">
      <span className="ai-whisper-icon">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2l1.9 4.6 4.6 1.9-4.6 1.9-1.9 4.6-1.9-4.6-4.6-1.9 4.6-1.9z" />
          <path d="M20 3v4M18 5h4" />
        </svg>
      </span>
      <span className="ai-whisper-text">{whisper}</span>
    </div>
  );
}
