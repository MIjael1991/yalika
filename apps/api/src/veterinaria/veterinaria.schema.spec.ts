import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Se ejecuta desde apps/api (como `npm test`). Lee archivos, no toca la base de datos.
const schemaText = readFileSync(
  join(process.cwd(), 'prisma', 'schema', 'veterinaria.prisma'),
  'utf8',
);
const migrationDir = readdirSync(join(process.cwd(), 'prisma', 'migrations')).find((d) =>
  d.endsWith('_veterinaria_r1'),
);
const sql = migrationDir
  ? readFileSync(join(process.cwd(), 'prisma', 'migrations', migrationDir, 'migration.sql'), 'utf8')
  : '';

type Field = { name: string; type: string; optional: boolean; raw: string };
type Model = { name: string; table: string; fields: Field[]; raw: string };

function parseModels(text: string): Model[] {
  const out: Model[] = [];
  for (const m of text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const body = m[2];
    const table = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? m[1];
    const fields: Field[] = [];
    for (const line of body.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('//') || t.startsWith('@@')) continue;
      const f = t.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
      if (f) fields.push({ name: f[1], type: f[2] + (f[3] ?? ''), optional: !!f[4], raw: t });
    }
    out.push({ name: m[1], table, fields, raw: body });
  }
  return out;
}

const models = parseModels(schemaText);
const modelNames = new Set(models.map((m) => m.name));
const sqlType: Record<string, string> = {
  String: 'TEXT',
  DateTime: 'TIMESTAMP(3)',
  Boolean: 'BOOLEAN',
  Int: 'INTEGER',
  Json: 'JSONB',
};

function tableSql(table: string) {
  return sql.match(new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? '';
}
const scalar = (m: Model) => m.fields.filter((f) => !modelNames.has(f.type.replace('[]', '')));

describe('esquema veterinaria.prisma y su migración', () => {
  it('existen la migración y los 6 modelos esperados', () => {
    expect(migrationDir).toBe('20261016180000_veterinaria_r1');
    expect(models.map((m) => m.table).sort()).toEqual(
      [
        'vet_audit_events',
        'vet_consultations',
        'vet_pet_guardians',
        'vet_pets',
        'vet_prescription_items',
        'vet_prescriptions',
      ].sort(),
    );
  });

  it('cada modelo tiene su CREATE TABLE y cada campo su columna con el mismo tipo y nulabilidad', () => {
    for (const model of models) {
      const ddl = tableSql(model.table);
      expect(ddl).not.toBe('');
      for (const f of scalar(model)) {
        const line = ddl.split('\n').find((l) => l.trim().startsWith(`"${f.name}" `)) ?? '';
        expect(`${model.table}.${f.name}: ${line ? 'ok' : 'falta columna'}`).toBe(`${model.table}.${f.name}: ok`);
        expect(line).toContain(sqlType[f.type]);
        expect(line.includes('NOT NULL')).toBe(!f.optional);
      }
    }
  });

  it('no hay columnas de más en la migración', () => {
    for (const model of models) {
      const cols = [...tableSql(model.table).matchAll(/^\s+"(\w+)" /gm)].map((m) => m[1]).sort();
      expect(cols).toEqual(scalar(model).map((f) => f.name).sort());
    }
  });

  it('los índices y únicos del esquema existen con el nombre que genera Prisma', () => {
    for (const model of models) {
      for (const m of model.raw.matchAll(/@@(index|unique)\(\[([^\]]+)\]\)/g)) {
        const cols = m[2].split(',').map((c) => c.trim());
        const name = `${model.table}_${cols.join('_')}_${m[1] === 'index' ? 'idx' : 'key'}`;
        expect(name.length).toBeLessThanOrEqual(63);
        const kind = m[1] === 'index' ? 'CREATE INDEX' : 'CREATE UNIQUE INDEX';
        const list = cols.map((c) => `"${c}"`).join(', ');
        expect(sql).toContain(`${kind} "${name}" ON "${model.table}"(${list});`);
      }
    }
  });

  it('las claves foráneas existen y los datos clínicos no se borran en cascada', () => {
    for (const model of models) {
      for (const f of model.fields.filter((x) => modelNames.has(x.type.replace('[]', '')))) {
        const rel = f.raw.match(/@relation\(fields: \[(\w+)\], references: \[(\w+)\](?:, onDelete: (\w+))?\)/);
        if (!rel) continue;
        const target = models.find((m) => m.name === f.type.replace('?', ''))!;
        const onDelete = (rel[3] ?? 'Restrict').toUpperCase();
        expect(sql).toContain(
          `ALTER TABLE "${model.table}" ADD CONSTRAINT "${model.table}_${rel[1]}_fkey" FOREIGN KEY ("${rel[1]}") REFERENCES "${target.table}"("${rel[2]}") ON DELETE ${onDelete} ON UPDATE CASCADE;`,
        );
        // Solo las líneas de receta (renglones) pueden borrarse en cascada con su receta.
        if (onDelete === 'CASCADE') expect(model.table).toBe('vet_prescription_items');
      }
    }
  });

  it('la migración es aditiva: solo crea tablas nuevas vet_*', () => {
    const statements = sql
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    for (const s of statements) {
      expect(s).toMatch(/^(CREATE TABLE "vet_|CREATE (UNIQUE )?INDEX "vet_|ALTER TABLE "vet_\w+" ADD CONSTRAINT "vet_)/);
    }
    const withoutFkActions = sql.replace(/ON (DELETE|UPDATE) \w+/g, '');
    expect(withoutFkActions).not.toMatch(/\b(DROP|DELETE|TRUNCATE|INSERT|UPDATE)\b/i);
    expect(sql).not.toMatch(/"(clinical_|users?"|companies|Clinical)/);
  });

  it('el esquema no se relaciona con tablas Clinical* ni con el perfil humano', () => {
    const code = schemaText
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/Clinical\w*/);
    expect(code).not.toMatch(/ownerUserId/);
  });
});
