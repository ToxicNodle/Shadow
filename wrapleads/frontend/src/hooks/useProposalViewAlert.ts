import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAppStore } from '../store/useAppStore';

const STORAGE_KEY = 'wl_seen_proposal_views';
const ALERT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes — only alert if viewed in last 15 min

function getSeenMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function markSeen(proposalId: number, viewedAt: string) {
  const map = getSeenMap();
  map[String(proposalId)] = viewedAt;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}
function wasSeen(proposalId: number, viewedAt: string): boolean {
  const map = getSeenMap();
  return map[String(proposalId)] === viewedAt;
}

function requestBrowserPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function fireBrowserNotification(company: string, proposalTitle: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(`🔥 ${company} opened your proposal`, {
      body: `"${proposalTitle}" — call them now before they shop someone else`,
      icon: '/favicon.ico',
      tag: `proposal-view-${company}`,
      requireInteraction: true,
    });
    setTimeout(() => n.close(), 12_000);
  } catch {}
}

export function useProposalViewAlert() {
  const showToast = useAppStore((s) => s.showToast);
  const permissionRequested = useRef(false);

  const { data } = useQuery({
    queryKey: ['proposal-heat'],
    queryFn: () => api.getProposalHeat(),
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  // Request notification permission once on mount
  useEffect(() => {
    if (!permissionRequested.current) {
      permissionRequested.current = true;
      requestBrowserPermission();
    }
  }, []);

  // Check for new proposal views each time data refreshes
  useEffect(() => {
    if (!data?.hot?.length) return;

    const now = Date.now();
    for (const proposal of data.hot) {
      if (!proposal.lastViewedAt) continue;
      const viewedAt = proposal.lastViewedAt;
      const viewedMs = new Date(viewedAt).getTime();

      // Only alert for views within the last 15 minutes
      if (now - viewedMs > ALERT_WINDOW_MS) continue;
      // Skip if we've already alerted for this exact view
      if (wasSeen(proposal.id, viewedAt)) continue;

      markSeen(proposal.id, viewedAt);

      const company = proposal.lead?.company || 'A prospect';
      const title = proposal.title || 'your proposal';

      showToast(`🔥 ${company} just opened "${title}" — call them now!`, 'error');
      fireBrowserNotification(company, title);
    }
  }, [data, showToast]);
}
