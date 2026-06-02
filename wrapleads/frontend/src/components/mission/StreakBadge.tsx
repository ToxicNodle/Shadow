import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

// Daily action streak — gamifies the mission dashboard.
//
// A "streaked" day = ≥1 outreach action (email sent, call, status moved
// forward).  We compute this client-side from the mission feed + global
// activities so the user gets credit for any concrete forward motion.
//
// Streak is persisted to localStorage with the last-active-day so it
// survives reloads and only resets when a full day is skipped.

interface StreakState {
  current: number;
  best: number;
  lastActiveDay: string | null;
}

const KEY = 'wl_action_streak_v1';

function loadStreak(): StreakState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { current: 0, best: 0, lastActiveDay: null };
    return JSON.parse(raw);
  } catch {
    return { current: 0, best: 0, lastActiveDay: null };
  }
}

function saveStreak(s: StreakState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  const d1 = new Date(a + 'T00:00:00Z').getTime();
  const d2 = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((d2 - d1) / 86_400_000);
}

export default function StreakBadge() {
  const [streak, setStreak] = useState<StreakState>(() => loadStreak());

  const { data: mission } = useQuery({
    queryKey: ['mission'],
    queryFn: () => api.getMission(),
    staleTime: 60_000,
  });

  // Recompute streak on mission load
  useEffect(() => {
    if (!mission) return;
    const today = dateKey(new Date());
    // "Today active" = user has sent emails, made calls, or moved leads forward today.
    // We approximate with the wonToday/sequences metrics — if the user has any
    // active sequence touching today OR a meeting/won today, they're active.
    const actionsToday = (mission.sequences?.pendingEmails ?? 0) > 0
      || (mission.replied?.length ?? 0) > 0
      || (mission.wonThisMonth ?? 0) > 0;  // weakest signal — proxy for monthly engagement

    if (!actionsToday) return;

    setStreak((prev) => {
      // Already credited today
      if (prev.lastActiveDay === today) return prev;

      // First-ever active day
      if (!prev.lastActiveDay) {
        const next = { current: 1, best: Math.max(prev.best, 1), lastActiveDay: today };
        saveStreak(next);
        return next;
      }

      const gap = diffDays(prev.lastActiveDay, today);
      let current: number;
      if (gap === 1) {
        current = prev.current + 1;            // consecutive day → extend
      } else if (gap === 0) {
        return prev;                            // same day already counted
      } else {
        current = 1;                            // gap > 1 → reset
      }
      const next = { current, best: Math.max(prev.best, current), lastActiveDay: today };
      saveStreak(next);
      return next;
    });
  }, [mission]);

  if (streak.current === 0) return null;

  const isMilestone = streak.current % 7 === 0 && streak.current > 0;
  const color = streak.current >= 30 ? '#ef4444'
              : streak.current >= 14 ? '#f97316'
              : streak.current >= 7  ? '#f59e0b'
              : '#3b82f6';

  return (
    <div
      className={`streak-badge${isMilestone ? ' milestone' : ''}`}
      title={`${streak.current}-day action streak · Best: ${streak.best} days`}
      style={{ '--streak-color': color } as React.CSSProperties}
    >
      <span className="streak-flame">{streak.current >= 7 ? '🔥' : '⚡'}</span>
      <div className="streak-meta">
        <span className="streak-num">{streak.current}</span>
        <span className="streak-label">day{streak.current !== 1 ? 's' : ''}</span>
      </div>
      {isMilestone && <span className="streak-shine" />}
    </div>
  );
}
