import { requireBusinessSession } from "../../lib/yalika-business-session";
import { FilesWorkspace } from "../archivos/files-workspace";
import { TOOLS } from "../../lib/estudio-tools";
import { ConvertHub } from "./convert-hub";
import { EstudioHome } from "./estudio-home";
import { EstudioMenu } from "./estudio-menu";
import { IdentificationWorkspace } from "./id-workspace";
import { ImageWorkspace } from "./image-workspace";
import { OfflineSwitch } from "./offline-switch";
import { MergeWorkspace } from "./merge-workspace";
import { NamesWorkspace } from "./names-workspace";
import { RecordsWorkspace } from "./records-workspace";
import { SheetWorkspace } from "./sheet-workspace";
import { StudioWorkspace } from "./studio-workspace";
import { TranscribeWorkspace } from "./transcribe-workspace";
import styles from "./studio.module.css";
export const dynamic = "force-dynamic";
const WANTED = ["pdf", "word", "excel", "csv", "powerpoint", "imagen", "texto"];
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; de?: string; a?: string }>;
}) {
  const q = await searchParams,
    // Los enlaces de las pantallas separadas de antes llevan al convertidor único.
    requested = ["pdf-imagenes", "pdf-texto", "excel"].includes(q.tab ?? "") ? "convertir" : q.tab,
    tab = TOOLS.some((t) => t.id === requested) ? (requested as string) : "";
  const user = await requireBusinessSession(),
    scope = { userId: user.id, companyId: user.companyId },
    key = `${user.companyId}:${user.id}`;
  return (
    <div className={styles.shell}>
      <EstudioMenu key={tab} current={tab} />
      <div className={styles.main}>
        <OfflineSwitch />
        {tab === "archivos" ? (
          <FilesWorkspace scope={scope} />
        ) : tab === "expedientes" ? (
          <RecordsWorkspace key={key} scope={scope} />
        ) : tab === "convertir" ? (
          <ConvertHub key={key} scope={scope} from={WANTED.includes(q.de ?? "") ? q.de : undefined} to={q.a} />
        ) : tab === "voz" ? (
          <TranscribeWorkspace key={key} scope={scope} />
        ) : tab === "unir" ? (
          <MergeWorkspace key={key} scope={scope} />
        ) : tab === "nombres" ? (
          <NamesWorkspace key={key} scope={scope} />
        ) : tab === "hoja" ? (
          <SheetWorkspace key={key} scope={scope} />
        ) : tab === "imagen" ? (
          <ImageWorkspace key={key} scope={scope} />
        ) : tab === "identificacion" ? (
          <IdentificationWorkspace key={key} scope={scope} />
        ) : tab === "documento" ? (
          <StudioWorkspace key={key} scope={scope} />
        ) : (
          <EstudioHome />
        )}
      </div>
    </div>
  );
}
