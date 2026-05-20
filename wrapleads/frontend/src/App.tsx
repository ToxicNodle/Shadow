import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { getToken } from './api/client';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';

// Lazy-load the CRM shell so the marketing/auth pages don't drag the entire
// app bundle on first paint. Investors land on a fast public page; the heavy
// CRM code only fetches once they log in.
const CRMPage = lazy(() => import('./pages/CRMPage'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = getToken();
  if (!token) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

function CrmFallback() {
  return (
    <div className="loading" style={{ height: '100vh' }}>
      <span className="spinner spinner-lg" />
      <span>Loading…</span>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Suspense fallback={<CrmFallback />}>
              <CRMPage />
            </Suspense>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
