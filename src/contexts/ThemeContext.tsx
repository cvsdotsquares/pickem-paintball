"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STATUS_BAR_THEME_COLOR = { light: "#ffffff", dark: "#101010" } as const;

function applyThemeToDocument(theme: Theme) {
  const root = document.documentElement;
  const isDark = theme === "dark";
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";

  const color = STATUS_BAR_THEME_COLOR[theme];
  /* Reinforce under Safari compositing (must match opaque page chrome above content) */
  root.style.backgroundColor = color;
  if (document.body) {
    document.body.style.backgroundColor = color;
  }

  /* Update in place — do not remove() metas Next/React manages (causes removeChild null errors). */
  const themeMetas = document.querySelectorAll('meta[name="theme-color"]');
  if (themeMetas.length === 0) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", color);
    document.head.appendChild(meta);
  } else {
    themeMetas.forEach((el) => el.setAttribute("content", color));
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme;
    // Default is light; only apply dark when user explicitly chose it
    const resolved = stored === "dark" ? "dark" : "light";
    setTheme(resolved);
    if (stored !== "dark" && stored !== "light") {
      localStorage.setItem("theme", resolved);
    }
  }, []);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};
