import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useAppStore } from '../../store/useAppStore';

export default function Toast() {
  const { toast, clearToast } = useAppStore((s) => ({ toast: s.toast, clearToast: s.clearToast }));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) { setVisible(false); return; }
    setVisible(true);
    const t = setTimeout(() => { setVisible(false); setTimeout(clearToast, 200); }, 3000);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;

  const icons: Record<string, ReactElement> = {
    success: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
    error:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="3"/></svg>,
    info:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8" strokeWidth="3"/><line x1="12" y1="12" x2="12" y2="16"/></svg>,
  };

  return (
    <div className={`toast toast-v2 ${toast.type}${visible ? ' toast-in' : ' toast-out'}`}>
      <span className="toast-icon">{icons[toast.type] ?? icons.info}</span>
      <span className="toast-msg">{toast.message}</span>
      <button className="toast-dismiss" onClick={() => { setVisible(false); setTimeout(clearToast, 200); }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}
