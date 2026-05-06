import { useAppStore } from '../../store/useAppStore';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

export default function PaywallModal() {
  const { paywallOpen, showToast } = useAppStore((s) => ({ paywallOpen: s.paywallOpen, showToast: s.showToast }));
  const { logout } = useAuth();

  if (!paywallOpen) return null;

  async function handleUpgrade() {
    try {
      const { url } = await api.checkout();
      window.location.href = url;
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    }
  }

  return (
    <div className="paywall-overlay">
      <div className="paywall-card">
        <div className="pw-icon">🔒</div>
        <h2>Your trial has ended</h2>
        <p className="pw-sub">
          Subscribe to continue using WrapLeads and keep all your leads, searches, and contact data.
        </p>
        <div className="price">$500</div>
        <p className="per">per month</p>
        <ul>
          <li>Unlimited lead pipeline</li>
          <li>FMCSA carrier database (250k+ carriers)</li>
          <li>AI email generation</li>
          <li>Apollo contact finder</li>
          <li>Saved searches with new carrier alerts</li>
        </ul>
        <button className="paywall-btn" onClick={handleUpgrade}>
          Subscribe Now
        </button>
        <br />
        <button className="paywall-logout" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
