import { Routes, Route, Navigate } from 'react-router-dom';
import { getToken } from './api/client';
import AuthPage from './pages/AuthPage';
import CRMPage from './pages/CRMPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <CRMPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
