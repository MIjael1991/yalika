"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { moduleForPath } from "../lib/module-navigation";

function OrionSidebarMark() {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="h-10 w-10"
      fill="none"
    >
      <circle cx="24" cy="24" r="16.5" stroke="#60A5FA" strokeWidth="5" />
      <path
        d="M12.4 35.6A16.4 16.4 0 0 1 8 24c0-9 7.2-16.3 16.2-16.5"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <path
        d="M35.6 12.4A16.4 16.4 0 0 1 40 24c0 9-7.2 16.3-16.2 16.5"
        stroke="#22D3EE"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <circle cx="38" cy="10" r="4.5" fill="white" />
      <circle cx="9" cy="37" r="3.5" fill="#38BDF8" />
    </svg>
  );
}

function MobileNavIcon({
  kind,
}: {
  kind:
    | "home"
    | "life"
    | "survey"
    | "sale"
    | "studio"
    | "health"
    | "account"
    | "services";
}) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (kind === "account")
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </svg>
    );
  if (kind === "services")
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  if (kind === "health") {
    return (
      <svg {...common}>
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
      </svg>
    );
  }

  if (kind === "life") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16M8 14h3M8 17h6" />
      </svg>
    );
  }

  if (kind === "sale") {
    return (
      <svg {...common}>
        <path d="M4 7h16l-1 13H5L4 7ZM8 7V5a4 4 0 0 1 8 0v2" />
      </svg>
    );
  }

  if (kind === "survey") {
    return (
      <svg {...common}>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h5M8 16h7" />
        <path d="m6.5 8 .6.6 1.2-1.4" />
      </svg>
    );
  }

  if (kind === "studio") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 9v11M12 13h5M12 16h3" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6" />
    </svg>
  );
}

const menu = [
  {
    label: "Yaleka",
    items: [
      { name: "Inicio", href: "/inicio" },
      { name: "Mi día", href: "/life" },
      { name: "Estudio", href: "/estudio" },
      { name: "Mis servicios", href: "/servicios" },
    ],
  },
  {
    label: "Mis módulos",
    items: [
      { name: "Encuestas", href: "/encuestas" },
      { name: "Salud", href: "/salud" },
      { name: "Punto de venta", href: "/pos" },
      { name: "Páginas web", href: "/sites" },
    ],
  },
];

export function OrionSidebar() {
  const pathname = usePathname();
  const [modules, setModules] = useState<string[] | null>(null);
  const [visibleModules, setVisibleModules] = useState<string[] | null>(null);
  const mobileItems = [
    { name: "Inicio", href: "/inicio", icon: "home" as const },
    { name: "Mi día", href: "/life", icon: "life" as const },
    { name: "Servicios", href: "/servicios", icon: "services" as const },
    { name: "Cuenta", href: "/cuenta", icon: "account" as const },
    { name: "Encuestas", href: "/encuestas", icon: "survey" as const },
  ];
  const hasFullAccess = modules?.includes("all") ?? false;

  // La visibilidad no modifica los permisos de las rutas.
  const canShow = (href: string) => {
    const moduleId =
      href === "/encuestas"
        ? "surveys"
        : href === "/salud"
          ? "health"
          : href === "/sites"
            ? "sites"
            : href === "/pos" || href.startsWith("/pos/")
              ? "pos"
              : null;
    if (moduleId === null) return true;
    if (visibleModules === null) return false;
    return visibleModules.includes(moduleId);
  };

  const currentModule = moduleForPath(pathname);
  const generalMenu = hasFullAccess
    ? menu
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => canShow(item.href)),
        }))
        .filter((group) => group.items.length > 0)
    : modules?.includes("surveys")
      ? [
          {
            label: "Mis módulos",
            items: [{ name: "Encuestas", href: "/encuestas" }],
          },
        ]
      : [];

  const visibleMenu =
    hasFullAccess && currentModule
      ? [
          {
            label: "Tu espacio",
            items: [{ name: "← Volver a Inicio", href: "/inicio" }],
          },
          { label: currentModule.name, items: currentModule.items },
          {
            label: "Yaleka",
            items: [{ name: "Cambiar de servicio", href: "/servicios" }],
          },
        ]
      : generalMenu;

  const visibleMobileItems = hasFullAccess
    ? mobileItems.filter((item) => item.href !== "/encuestas")
    : modules?.includes("surveys")
      ? mobileItems.filter((item) => item.href === "/encuestas")
      : [];

  const homeHref = hasFullAccess ? "/inicio" : "/encuestas";

  useEffect(() => {
    let active = true;

    fetch("/api/orion/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ user?: { modules?: string[] } }>;
      })
      .then((payload) => {
        if (active) setModules(payload?.user?.modules ?? []);
      })
      .catch(() => {
        if (active) setModules([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasFullAccess) return;

    let active = true;

    async function refreshSelection() {
      try {
        const response = await fetch(
          "/api/orion/assistant-preference/modules",
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error("Preferencias no disponibles");
        }

        const payload: unknown = await response.json();

        if (
          !payload ||
          typeof payload !== "object" ||
          !("visibleModules" in payload)
        ) {
          throw new Error("Respuesta invalida");
        }

        const value = (payload as { visibleModules: unknown }).visibleModules;

        if (
          value !== null &&
          (!Array.isArray(value) ||
            !value.every((id) =>
              ["surveys", "life", "health", "pos", "sites"].includes(id),
            ))
        ) {
          throw new Error("Lista invalida");
        }

        if (active) {
          setVisibleModules(
            value === null
              ? []
              : value.filter(
                  (id: string) =>
                    Array.isArray(
                      (payload as { availableModules?: unknown })
                        .availableModules,
                    ) &&
                    (
                      payload as unknown as { availableModules: string[] }
                    ).availableModules.includes(id),
                ),
          );
        }
      } catch {
        // Si falla la consulta se mantiene la navegacion basica.
        if (active) {
          setVisibleModules([]);
        }
      }
    }

    const refresh = () => {
      void refreshSelection();
    };

    void refreshSelection();

    window.addEventListener("yalika:services-changed", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      active = false;
      window.removeEventListener("yalika:services-changed", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [hasFullAccess]);

  const logout = async () => {
    await fetch("/api/orion/auth/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/login");
  };

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : currentModule?.items.some((item) => item.href === href)
        ? pathname === href
        : href === "/estudio"
          ? pathname.startsWith("/estudio") || pathname.startsWith("/archivos")
          : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-[#061426]/95 px-4 backdrop-blur-xl lg:hidden">
        <Link href={homeHref} className="flex items-center gap-2">
          <OrionSidebarMark />
          <span>
            <span className="block text-sm font-black tracking-[0.28em] text-white">
              Yaleka
            </span>
            <span className="block text-[9px] text-cyan-200/70">
              Contigo cuando importa.
            </span>
          </span>
        </Link>
        <Link
          href="/cuenta"
          aria-label="Mi cuenta"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white"
        >
          <MobileNavIcon kind="account" />
        </Link>
      </header>

      <nav
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, visibleMobileItems.length)}, minmax(0, 1fr))`,
        }}
        className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-50 grid rounded-2xl border border-white/10 bg-[#07182b]/95 p-1.5 shadow-2xl shadow-slate-950/60 backdrop-blur-xl lg:hidden"
      >
        {visibleMobileItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-2 text-sm font-semibold transition ${
                active ? "bg-blue-500 text-white" : "text-slate-400"
              }`}
            >
              <MobileNavIcon kind={item.icon} />
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-[#061426] lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <Link href={homeHref} className="flex items-center gap-3">
            <OrionSidebarMark />
            <span>
              <span className="block text-base font-black tracking-[0.28em] text-white">
                Yaleka
              </span>
              <span className="mt-0.5 block text-sm text-cyan-200/65">
                Contigo cuando importa.
              </span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto p-4">
          {visibleMenu.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {group.label}
              </p>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center justify-between rounded-xl px-3 py-3 text-sm transition ${
                        active
                          ? "bg-blue-500 font-semibold text-white shadow-lg shadow-blue-950/30"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="m-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Tu espacio</p>

          <div className="mt-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />

            <span className="text-sm text-slate-300">
              Yaleka · Una sola cuenta
            </span>
          </div>
          <Link
            href="/cuenta"
            className="mt-3 flex min-h-10 w-full items-center justify-center rounded-lg border border-cyan-500/20 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-400/10"
          >
            Mi cuenta
          </Link>
          <button
            type="button"
            onClick={logout}
            className="mt-3 w-full rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/5"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
