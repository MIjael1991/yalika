"use client";

import { usePathname } from "next/navigation";

import { YalikaTheme } from "./yalika-theme";
import { YalikaSearch } from "./yalika-search";
import { YalikaSidebar } from "./yalika-sidebar";
import { ModuleMenu } from "./module-menu";
import { YalikaPwa } from "./yalika-pwa";
import { AlarmaYalika } from "./yalika-alarma";

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
      <AlarmaYalika />
      <YalikaSidebar />
      <div className="min-w-0 pb-20 lg:pl-64 lg:pb-0">
        <YalikaTheme>
          <ModuleMenu />
          {pathname !== "/inicio" && (
            <div className="flex items-stretch gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <YalikaSearch compact />
              </div>
              {/* En Tequio, el 911 siempre a la mano junto al asistente */}
              {pathname.startsWith("/tequio") && (
                <a
                  href="tel:911"
                  aria-label="Llamar al 911 si peligra una vida"
                  className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-red-700 px-3 leading-none text-white shadow-lg shadow-red-900/30 hover:bg-red-800 sm:px-4"
                >
                  <strong className="text-lg font-extrabold">911</strong>
                  <span className="mt-0.5 hidden text-[11px] font-bold sm:block">Emergencia</span>
                </a>
              )}
            </div>
          )}
          {children}
        </YalikaTheme>
      </div>
    </div>
  );
}
