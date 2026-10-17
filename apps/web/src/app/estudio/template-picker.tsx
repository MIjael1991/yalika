"use client";
import { useState } from "react";
import { DOC_TEMPLATES, MAX_FIELD, buildFromTemplate, templateById } from "../../lib/yalika-doc-templates";
import type { YalikaDocument } from "../../lib/yalika-document";
import styles from "./studio.module.css";
export function TemplatePicker({ onCreate, onClose }: { onCreate: (d: YalikaDocument) => void; onClose: () => void }) {
  const [id, setId] = useState(DOC_TEMPLATES[0].id),
    [values, setValues] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    t = templateById(id)!;
  return (
    <form
      className={styles.formCard}
      style={{ maxWidth: 720 }}
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onCreate(buildFromTemplate(id, values));
        } catch (x) {
          setError(x instanceof Error ? x.message : "No se pudo crear el documento.");
        }
      }}
    >
      <strong>Documento con plantilla</strong>
      <div className={styles.seg} role="group" aria-label="Tipo de documento">
        {DOC_TEMPLATES.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-pressed={x.id === id}
            onClick={() => {
              setId(x.id);
              setValues({});
              setError("");
            }}
          >
            {x.label}
          </button>
        ))}
      </div>
      <p className={styles.help} style={{ margin: 0 }}>
        {t.hint} Lo que dejes vacío queda como una línea para llenar después.
      </p>
      {t.fields.map((f) => (
        <label key={f.id} className={styles.field}>
          {f.label}
          {f.multiline ? (
            <textarea
              maxLength={MAX_FIELD}
              placeholder={f.hint}
              value={values[f.id] ?? ""}
              onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
            />
          ) : (
            <input
              maxLength={200}
              placeholder={f.hint}
              value={values[f.id] ?? ""}
              onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
            />
          )}
        </label>
      ))}
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions} style={{ margin: 0 }}>
        <button type="submit" className={styles.primary}>
          Crear documento
        </button>
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
