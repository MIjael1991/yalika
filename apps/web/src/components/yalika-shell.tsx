"use client";

import { usePathname } from "next/navigation";

import { YalikaTheme } from "./yalika-theme";
import { YalikaSearch } from "./yalika-search";
import { YalikaSidebar } from "./yalika-sidebar";
import { ModuleMenu } from "./module-menu";
import { YalikaPwa } from "./yalika-pwa";

export function YalikaShell({ children }: { children: React.ReactNode }) {
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
        <YalikaPwa />
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <YalikaPwa />
      <YalikaSidebar />
      <div className="min-w-0 pb-20 lg:pl-64 lg:pb-0">
        <YalikaTheme>
          <ModuleMenu />
          {pathname !== "/inicio" && (
            <div className="px-4 py-3">
              <YalikaSearch compact />
            </div>
          )}
          {children}
        </YalikaTheme>
      </div>
    </div>
  );
}
