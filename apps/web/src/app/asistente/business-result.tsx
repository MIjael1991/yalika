"use client";
import Link from "next/link";
import { useState } from "react";
export function BusinessResult({
  intent,
  items,
}: {
  intent: string;
  items: Record<string, unknown>[];
}) {
  const [expanded, setExpanded] = useState(false);
  const low = intent === "low_stock";
  const shown = expanded ? items : items.slice(0, 6);
  const number = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  return (
    <section
      className="mt-4"
      aria-label={
        low ? "Productos con pocas existencias" : "Productos encontrados"
      }
    >
      {low && (
        <p className="mb-3 text-sm text-slate-300">
          Estos productos llegaron al nivel de alerta que configuraste. Revisa
          cuáles necesitas reponer.
        </p>
      )}
      <ul className="space-y-3">
        {shown.map((row, index) => {
          const stock = number(row.stock),
            limit = number(row.lowStockAt),
            price = number(row.price);
          return (
            <li
              key={index}
              className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
            >
              <p className="text-base font-semibold text-white">
                {typeof row.name === "string"
                  ? row.name
                  : "Producto sin nombre"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span
                  className={
                    stock === 0
                      ? "font-semibold text-rose-200"
                      : "font-semibold text-amber-100"
                  }
                >
                  {stock === null
                    ? "Existencias no disponibles"
                    : stock === 0
                      ? "Sin existencias"
                      : `${stock === 1 ? "Queda" : "Quedan"} ${stock} ${stock === 1 ? "unidad" : "unidades"}`}
                </span>
                {low && limit !== null && (
                  <span className="text-sm text-slate-300">
                    Alerta: {limit} o menos
                  </span>
                )}
                {!low && price !== null && (
                  <span className="text-sm text-slate-200">
                    Precio:{" "}
                    {price.toLocaleString("es-MX", {
                      style: "currency",
                      currency: "MXN",
                    })}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {items.length > 6 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 min-h-11 rounded-xl border border-cyan-300/30 px-4 py-2 font-semibold text-cyan-100"
        >
          {expanded ? "Mostrar menos" : `Ver los ${items.length} productos`}
        </button>
      )}
      <Link
        href={low ? "/pos/inventario" : "/pos/productos"}
        className="mt-3 flex min-h-11 items-center rounded-xl bg-cyan-300 px-4 py-3 font-bold text-slate-950"
      >
        {low ? "Abrir inventario para revisar o reponer" : "Abrir productos"} →
      </Link>
    </section>
  );
}
