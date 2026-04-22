// app/dashboard/layout.tsx
"use client";

import ProtectedRoute from "../../components/Layout/ProtectedRoute";
import Layout from "../../components/Layout/Layout";
import { LeagueProvider } from "../../contexts/LeagueContext";
import { NotificationProvider } from "../../contexts/NotificationContext";
import BadgesAnnouncementController from "../../components/Badges/BadgesAnnouncementController";
import BadgesModalsController from "../../components/Badges/BadgesModalsController";
import { ReactNode } from "react";

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  return (
    <ProtectedRoute>
      <LeagueProvider>
        <NotificationProvider>
          <Layout>{children}</Layout>
          <BadgesAnnouncementController />
          <BadgesModalsController />
        </NotificationProvider>
      </LeagueProvider>
    </ProtectedRoute>
  );
};

export default DashboardLayout;
