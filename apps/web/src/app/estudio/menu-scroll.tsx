"use client";
import { useEffect } from "react";

// En pantallas angostas el menú se desliza de lado: deja a la vista la sección en la que está la persona.
export function MenuScroll() {
  useEffect(() => {
    document.querySelector('nav[aria-label="Estudio"] [aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);
  return null;
}
