import { useEffect, useState } from 'react';

// Compact live timestamp for the topbar.  Bloomberg-terminal feel.
// Format: "TUE · MAY 25 · 14:32" (24h, market-style).

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatNow(d: Date): { date: string; time: string } {
  return {
    date: `${DOW[d.getDay()]} · ${MON[d.getMonth()]} ${d.getDate()}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

export default function LiveClock() {
  const [t, setT] = useState(() => formatNow(new Date()));

  useEffect(() => {
    // Tick every 15s — minute precision is fine, no need for second-level
    const id = setInterval(() => setT(formatNow(new Date())), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="live-clock" title={new Date().toString()}>
      <span className="live-clock-date">{t.date}</span>
      <span className="live-clock-sep">·</span>
      <span className="live-clock-time">{t.time}</span>
    </div>
  );
}
