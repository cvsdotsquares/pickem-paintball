// components/Layout/Layout.tsx
"use client";
import { ColorSchemeScript, MantineProvider } from '@mantine/core';

import '@mantine/core/styles.layer.css';
import 'mantine-datatable/styles.layer.css';
import Sidebar from "../Dashboard/Sidebar";
import React, { ReactNode } from "react";
import Widgets from '../Dashboard/widgets';

interface LayoutProps {
  children: ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex flex-row w-full">
      <Sidebar />
      <main className="flex-1 overflow-hidden ">
        <MantineProvider defaultColorScheme="light">{children}</MantineProvider>
      </main>

    </div>
  );
};

export default Layout;
