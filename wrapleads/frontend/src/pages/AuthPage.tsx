import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, setToken } from '../api/client';
import { ApiError } from '../api/client';

type View = 'login' | 'register' | 'forgot' | 'reset';

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get('reset');

  const [view, setView] = useState<View>(resetToken ? 'reset' : 'login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [regName, setRegName] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Forgot password fields
  const [forgotEmail, setForgotEmail] = useState('');

  // Reset password fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  function switchView(v: View) {
    setView(v);
    setError('');
    setSuccess('');
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api.login(loginEmail, loginPassword);
      setToken(token);
      localStorage.setItem('wl_user', JSON.stringify(user));
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api.register(regName, regCompany, regEmail, regPassword);
      setToken(token);
      localStorage.setItem('wl_user', JSON.stringify(user));
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.forgotPassword(forgotEmail);
      setSuccess('Check your email — we sent a reset link (valid for 1 hour).');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(resetToken!, newPassword);
      setSuccess('Password updated! You can now sign in.');
      setView('login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed — link may have expired');
    } finally {
      setLoading(false);
    }
  }

  const isLoginOrRegister = view === 'login' || view === 'register';

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-logo">W</span>
          <span className="auth-brand-name">WrapLeads<span className="auth-brand-io">.io</span></span>
        </div>
        <p className="auth-tagline">Lead discovery for wrap shops</p>

        {isLoginOrRegister && (
          <div className="auth-tabs">
            <button
              className={`auth-tab ${view === 'login' ? 'active' : ''}`}
              onClick={() => switchView('login')}
            >
              Sign In
            </button>
            <button
              className={`auth-tab ${view === 'register' ? 'active' : ''}`}
              onClick={() => switchView('register')}
            >
              Create Account
            </button>
          </div>
        )}

        {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}
        {success && <div className="success-box" style={{ marginBottom: 16 }}>{success}</div>}

        {view === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="field-group">
              <label className="field-label">Email</label>
              <input
                className="input"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
              />
            </div>
            <div className="field-group">
              <label className="field-label">Password</label>
              <input
                className="input"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Sign In'}
            </button>
            <button
              type="button"
              className="auth-forgot-link"
              onClick={() => switchView('forgot')}
            >
              Forgot password?
            </button>
          </form>
        )}

        {view === 'register' && (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="field-row">
              <div className="field-group">
                <label className="field-label">Your Name</label>
                <input
                  className="input"
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Alex Smith"
                  required
                  autoFocus
                />
              </div>
              <div className="field-group">
                <label className="field-label">Company</label>
                <input
                  className="input"
                  type="text"
                  value={regCompany}
                  onChange={(e) => setRegCompany(e.target.value)}
                  placeholder="Shadow Graphix"
                  required
                />
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Email</label>
              <input
                className="input"
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            <div className="field-group">
              <label className="field-label">Password</label>
              <input
                className="input"
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
                minLength={8}
              />
            </div>
            <p className="auth-trial-note">14-day free trial · No credit card required</p>
            <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Start Free Trial'}
            </button>
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={handleForgot} className="auth-form">
            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.5 }}>
              Enter your email and we'll send you a reset link valid for 1 hour.
            </p>
            <div className="field-group">
              <label className="field-label">Email</label>
              <input
                className="input"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
              />
            </div>
            <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Send Reset Link'}
            </button>
            <button type="button" className="auth-forgot-link" onClick={() => switchView('login')}>
              ← Back to sign in
            </button>
          </form>
        )}

        {view === 'reset' && (
          <form onSubmit={handleReset} className="auth-form">
            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.5 }}>
              Choose a new password for your account.
            </p>
            <div className="field-group">
              <label className="field-label">New Password</label>
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
                minLength={8}
                autoFocus
              />
            </div>
            <div className="field-group">
              <label className="field-label">Confirm Password</label>
              <input
                className="input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Same as above"
                required
                minLength={8}
              />
            </div>
            <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Set New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
