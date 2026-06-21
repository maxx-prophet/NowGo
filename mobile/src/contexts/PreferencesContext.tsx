import React, { createContext, useContext } from "react";
import { usePreferences } from "../hooks/usePreferences";

type PreferencesContextType = ReturnType<typeof usePreferences>;

const PreferencesContext = createContext<PreferencesContextType | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const value = usePreferences();
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferencesContext() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferencesContext must be used within PreferencesProvider");
  return ctx;
}
