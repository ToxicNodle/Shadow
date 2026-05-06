import { useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';

export default function Toast() {
  const { toast, clearToast } = useAppStore((s) => ({ toast: s.toast, clearToast: s.clearToast }));

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 3000);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;

  return (
    <div className={`toast ${toast.type}`}>
      {toast.message}
    </div>
  );
}
