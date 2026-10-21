// Lo que se puede hacer en Estudio, dicho como lo diría una persona: el menú, la pantalla de inicio y los atajos salen de aquí.
export type ToolId =
  | "convertir"
  | "imagen"
  | "identificacion"
  | "voz"
  | "unir"
  | "documento"
  | "hoja"
  | "nombres"
  | "expedientes"
  | "archivos";
export type Tool = { id: ToolId; title: string; short: string; hint: string; icon: string };
export type ToolGroup = { id: string; question: string; tools: Tool[] };
export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: "convertir",
    question: "Quiero convertir o mejorar",
    tools: [
      { id: "convertir", title: "Pasar un archivo a otro formato", short: "Convertir archivos", hint: "De PDF a Word, de Word a PDF, de Excel a PDF, de fotos a PDF…", icon: "convert" },
      { id: "imagen", title: "Mejorar una foto o un escaneo", short: "Mejorar fotos", hint: "Endereza, aclara y recorta fotos de documentos.", icon: "scan" },
      { id: "identificacion", title: "Sacar copia de mi INE", short: "Copia de INE", hint: "Fotos del frente y del reverso en una hoja lista para imprimir.", icon: "card" },
      { id: "voz", title: "Pasar audio o video a texto", short: "Audio a texto", hint: "Una grabación o un video se vuelve un documento de Word.", icon: "voice" },
      { id: "unir", title: "Unir varios PDF", short: "Unir PDF", hint: "Junta PDF y fotos en un solo archivo, en el orden que quieras.", icon: "merge" },
    ],
  },
  {
    id: "crear",
    question: "Quiero escribir o calcular",
    tools: [
      { id: "documento", title: "Escribir un documento", short: "Documento", hint: "Cartas, oficios y formatos; sale en Word o PDF.", icon: "doc" },
      { id: "hoja", title: "Hacer una hoja de cálculo", short: "Hoja de cálculo", hint: "Tablas con fórmulas; sale en Excel o PDF.", icon: "sheet" },
      { id: "nombres", title: "Hacer una lista de nombres", short: "Lista de nombres", hint: "Ordena nombres y apellidos y pásalos a Excel.", icon: "list" },
    ],
  },
  {
    id: "tengo",
    question: "Quiero ver lo que ya tengo",
    tools: [
      { id: "expedientes", title: "Mis expedientes", short: "Expedientes", hint: "Carpetas de trabajo con sus documentos y evidencias.", icon: "folder" },
      { id: "archivos", title: "Mis archivos", short: "Mis archivos", hint: "Lo que guardaste en este dispositivo.", icon: "files" },
    ],
  },
];
export const TOOLS: Tool[] = TOOL_GROUPS.flatMap((g) => g.tools);
export const toolById = (id: string | undefined) => TOOLS.find((t) => t.id === id);
// Atajos de «¿qué quieres convertir?»: abren el convertidor ya con el formato elegido.
export type Shortcut = { label: string; href: string };
export const SHORTCUTS: Shortcut[] = [
  { label: "PDF a Word", href: "/estudio?tab=convertir&de=pdf&a=word" },
  { label: "Word a PDF", href: "/estudio?tab=convertir&de=word&a=pdf" },
  { label: "Fotos a PDF", href: "/estudio?tab=convertir&de=imagen&a=pdf" },
  { label: "Excel a PDF", href: "/estudio?tab=convertir&de=excel&a=pdf" },
  { label: "Foto a Word", href: "/estudio?tab=convertir&de=imagen&a=word" },
  { label: "PDF a fotos", href: "/estudio?tab=convertir&de=pdf&a=jpg" },
];
export const toolHref = (id: ToolId) => "/estudio?tab=" + id;
