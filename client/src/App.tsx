import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminLoginPage, AdminProfile } from './pages/AdminLoginPage';
import { AdminRaffleManagePage } from './pages/AdminRaffleManagePage';
import { HomePage } from './pages/HomePage';
import { PublicRafflePage } from './pages/PublicRafflePage';
import { apiFetch } from './utils/api';

function AdminRoutes() {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<{ admin: AdminProfile }>('/api/admin/auth/me')
      .then((res) => {
        if (active) setAdmin(res.admin);
      })
      .catch(() => {
        if (active) setAdmin(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex items-center gap-2.5 text-slate-600 font-semibold">
          <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
          <span>Verificando sesión...</span>
        </div>
      </div>
    );
  }

  if (!admin) {
    return <AdminLoginPage onAuthenticated={setAdmin} />;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <AdminDashboardPage
            admin={admin}
            onAdminUpdated={setAdmin}
            onLogout={() => setAdmin(null)}
          />
        }
      />
      <Route path="/rifas/:id" element={<AdminRaffleManagePage />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/r/:slug" element={<PublicRafflePage />} />
        <Route path="/admin/*" element={<AdminRoutes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
