import { requireBusinessSession } from "../../lib/yalika-business-session";
import Link from "next/link";
import { FilesWorkspace } from "../archivos/files-workspace";
import { ConvertHub } from "./convert-hub";
import { ImageWorkspace } from "./image-workspace";
import { OfflineSwitch } from "./offline-switch";
import { MergeWorkspace } from "./merge-workspace";
import { RecordsWorkspace } from "./records-workspace";
import { SheetWorkspace } from "./sheet-workspace";
import { StudioWorkspace } from "./studio-workspace";
import styles from "./studio.module.css";
export const dynamic = "force-dynamic";
const MENU = [
  [
    "Crear",
    [
      ["", "Documento"],
      ["hoja", "Hoja de cálculo"],
    ],
  ],
  ["Fotos", [["imagen", "Escanear y mejorar"]]],
  [
    "Convertir",
    [
      ["convertir", "Convertir archivos"],
      ["unir", "Unir PDF"],
    ],
  ],
  [
    "Trabajo",
    [
      ["expedientes", "Expedientes"],
      ["archivos", "Mis archivos"],
    ],
  ],
] as const;
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const asked = (await searchParams).tab,
    // Los enlaces de las pantallas separadas de antes llevan al convertidor único.
    requested = ["pdf-imagenes", "pdf-texto", "excel"].includes(asked ?? "") ? "convertir" : asked,
    tab = MENU.some(([, items]) => items.some(([key]) => key && key === requested)) ? requested : "";
  const user = await requireBusinessSession(),
    scope = { userId: user.id, companyId: user.companyId },
    key = `${user.companyId}:${user.id}`;
  return (
    <div className={styles.shell}>
      <nav aria-label="Estudio" className={styles.menu}>
        {MENU.map(([group, items]) => (
          <div key={group} className={styles.menuGroup}>
            <span className={styles.menuLabel}>{group}</span>
            <div className={styles.menuItems}>
              {items.map(([id, label]) => (
                <Link
                  key={id}
                  aria-current={id === tab ? "page" : undefined}
                  className={styles.menuLink}
                  href={id ? "/estudio?tab=" + id : "/estudio"}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <OfflineSwitch />
      {tab === "archivos" ? (
        <FilesWorkspace scope={scope} />
      ) : tab === "expedientes" ? (
        <RecordsWorkspace key={key} scope={scope} />
      ) : tab === "convertir" ? (
        <ConvertHub key={key} scope={scope} />
      ) : tab === "unir" ? (
        <MergeWorkspace key={key} scope={scope} />
      ) : tab === "hoja" ? (
        <SheetWorkspace key={key} scope={scope} />
      ) : tab === "imagen" ? (
        <ImageWorkspace key={key} scope={scope} />
      ) : (
        <StudioWorkspace key={key} scope={scope} />
      )}
    </div>
  );
}
