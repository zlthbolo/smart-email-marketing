import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { api } from './lib/api';
import type { AdminProfile } from './types';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmailAccountsPage } from './pages/EmailAccountsPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { CampaignBuilderPage } from './pages/CampaignBuilderPage';
import { LeadsPage } from './pages/LeadsPage';
import { InboxPage } from './pages/InboxPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { LogsPage } from './pages/LogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';

function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const auth = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: ({ signal }) => api.get<AdminProfile>('/auth/me', signal).then((result) => result.data),
    retry: false,
    staleTime: 60_000,
  });
  if (auth.isPending) return <div className="app-boot"><LoadingState label="جارٍ التحقق من الجلسة…" rows={3} /></div>;
  if (auth.isError) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthGate><AppShell /></AuthGate>}>
        <Route index element={<DashboardPage />} />
        <Route path="email-accounts" element={<EmailAccountsPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="campaigns/new" element={<CampaignBuilderPage />} />
        <Route path="campaigns/:campaignId/edit" element={<CampaignBuilderPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
