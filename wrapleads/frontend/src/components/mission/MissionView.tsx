import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useCountUp } from '../../hooks/useCountUp';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { useLeads } from '../../hooks/useLeads';
import ROICalculatorModal from '../modals/ROICalculatorModal';
import HotProposalsCard from './HotProposalsCard';
import PerfectTimingCard from './PerfectTimingCard';
import WinThisWeekCard from './WinThisWeekCard';
import StreakBadge from './StreakBadge';
import InboundRequestsCard from './InboundRequestsCard';
import CallSessionModal from './CallSessionModal';
import TodayScoreCard from './TodayScoreCard';
import ProposalHeatCard from './ProposalHeatCard';
import RescueQueueCard from './RescueQueueCard';
import IntentSignalsCard from './IntentSignalsCard';
import TaskQueueCard from './TaskQueueCard';
import SpeedDialCard from './SpeedDialCard';
import StalePipelineCard from './StalePipelineCard';
import ReferralEngineCard from './ReferralEngineCard';
import DailyBriefingCard from './DailyBriefingCard';
import ObjectionCounterCard from './ObjectionCounterCard';
import SignalLeadsCard from './SignalLeadsCard';
import SmsInboxCard from './SmsInboxCard';
import DarkProposalsCard from './DarkProposalsCard';
import FleetGrowthCard from './FleetGrowthCard';
import MaterialInventoryCard from './MaterialInventoryCard';
import SubPayablesCard from './SubPayablesCard';
import QuickStartCard from './QuickStartCard';
import UpcomingAppointmentsCard from './UpcomingAppointmentsCard';
import DealRiskCard from './DealRiskCard';
import { winProbability, scoreLead, scoreLabel, SCORE_COLORS } from '../../utils/scoring';
import type { LeadStatus, LeadCategory } from '../../api/types';

// ... (constants remain the same)

export default function MissionView() {
  const setMode = useAppStore((s) => s.setMode);
  const setFilter = useAppStore((s) => s.setFilter);
  const setCurrentLeadId = useAppStore((s) => s.setCurrentLeadId);
  const setQuickOpenTab = useAppStore((s) => s.setQuickOpenTab);
  const settings = useAppStore((s) => s.settings);
  const { leads } = useLeads();
  const [showBulk, setShowBulk] = useState(false);
  const [showEnrich, setShowEnrich] = useState(false);
  const [showProspector, setShowProspector] = useState(false);
  const [showCampaigns, setShowCampaigns] = useState(false);
  const [showROI, setShowROI] = useState(false);
  const [showCallSession, setShowCallSession] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [cardVis, setCardVis] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('wl_mission_card_visibility') ?? '{}'); } catch { return {}; }
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mission'],
    queryFn: () => api.getMission(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const { data: briefData } = useQuery({
    queryKey: ['mission-brief'],
    queryFn: () => api.getMissionBrief(),
    staleTime: 60 * 60_000,
    enabled: !!data,
  });

  const { data: signalsData } = useQuery({
    queryKey: ['mission-signals'],
    queryFn: () => api.getMissionSignals(),
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  // ── Declare all useCountUp hooks BEFORE any early returns or conditionals ──
  const animWon = useCountUp(data?.wonThisMonth ?? 0);
  const animSeqActive = useCountUp(data?.sequences?.active ?? 0);
  const animPending = useCountUp(data?.sequences?.pendingEmails ?? 0);
  const animNewEmail = useCountUp(data?.newWithEmail?.length ?? 0);
  const animAging = useCountUp(data?.agingWraps ?? 0);

  if (isLoading || !data) {
    return (
      <div className="pv-loading">
        <span className="spinner spinner-lg" />
        <span>Building your mission briefing…</span>
      </div>
    );
  }

  const { overdue, newWithEmail, replied, bidsThisWeek, callReady, needsEmail, sequences, wonThisMonth, wonThisMonthRevenue, agingWraps, stuckDeals } = data;
  
  function cardVisible(id: string): boolean { return cardVis[id] !== false; }

  function toggleCard(id: string) {
    setCardVis((v) => {
      const next = { ...v, [id]: v[id] !== false ? false : true };
      localStorage.setItem('wl_mission_card_visibility', JSON.stringify(next));
      return next;
    });
  }

  function resetCards() {
    setCardVis({});
    localStorage.removeItem('wl_mission_card_visibility');
  }

  // ... rest of component
  return (
    <div className="mission-root">
      {/* Mission view content */}
    </div>
  );
}
