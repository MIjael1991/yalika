"use client";

import { usePathname } from "next/navigation";

import { YalekaTheme } from "./yaleka-theme";
import { YalekaSearch } from "./yaleka-search";
import { OrionSidebar } from "./orion-sidebar";
import { ModuleMenu } from "./module-menu";
import { OrionPwa } from "./orion-pwa";

export function OrionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (
    pathname === "/login" ||
    pathname === "/registro" ||
    pathname === "/recuperar" ||
    pathname.startsWith("/e/") ||
    pathname.startsWith("/s/") ||
    pathname.startsWith("/r/")
  ) {
    return (
      <div className="min-h-screen bg-slate-950">
        <OrionPwa />
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <OrionPwa />
      <OrionSidebar />
      <div className="min-w-0 pb-20 lg:pl-64 lg:pb-0">
        <YalekaTheme>
          <ModuleMenu />
          {pathname !== "/inicio" && (
            <div className="px-4 py-3">
              <YalekaSearch compact />
            </div>
          )}
          {children}
        </YalekaTheme>
      </div>
    </div>
  );
}
