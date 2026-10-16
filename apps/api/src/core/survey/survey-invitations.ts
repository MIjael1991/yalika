import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';

export const invitationHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export type InvitationContact = {
  name: string;
  email: string;
  phone: string;
  group: string;
  reference: string;
};
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export async function parseParticipants(
  filename: string,
  content: string,
): Promise<InvitationContact[]> {
  if (
    !/\.(csv|xlsx)$/i.test(filename) ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(content)
  ) {
    throw new BadRequestException(
      'Selecciona un archivo Excel .xlsx o CSV válido',
    );
  }
  const bytes = Buffer.from(content, 'base64');
  if (!bytes.length || bytes.length > 2_000_000)
    throw new BadRequestException('El archivo debe pesar menos de 2 MB');
  const workbook = new ExcelJS.Workbook();
  try {
    if (/\.csv$/i.test(filename)) {
      const first = bytes.toString('utf8').split(/\r?\n/, 1)[0];
      await workbook.csv.read(Readable.from([bytes]), {
        parserOptions: {
          delimiter: first.includes(';') ? ';' : ',',
          ignoreEmpty: true,
        },
      });
    } else {
      await workbook.xlsx.load(
        bytes as unknown as Parameters<typeof workbook.xlsx.load>[0],
      );
    }
  } catch {
    throw new BadRequestException(
      'No pudimos leer el archivo. Revisa el formato y las columnas.',
    );
  }
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount > 1001)
    throw new BadRequestException(
      'Importa entre 1 y 1000 participantes por archivo',
    );
  const columns = new Map<string, number>();
  sheet
    .getRow(1)
    .eachCell((cell, index) =>
      columns.set(normalize(cell.text.replace(/^\uFEFF/, '')), index),
    );
  const pick = (aliases: string[]) =>
    aliases.map((key) => columns.get(key)).find(Boolean);
  const mapping = {
    name: pick(['nombre']),
    email: pick(['correo', 'email', 'correo electronico']),
    phone: pick(['telefono', 'celular', 'telefono/celular']),
    group: pick(['grupo']),
    reference: pick(['referencia']),
  };
  if (!mapping.email && !mapping.phone)
    throw new BadRequestException(
      'Incluye una columna Correo o Teléfono/Celular',
    );
  const contacts: InvitationContact[] = [];
  const seen = new Set<string>();
  for (let row = 2; row <= sheet.rowCount; row++) {
    const result: InvitationContact = {
      name: '',
      email: '',
      phone: '',
      group: '',
      reference: '',
    };
    for (const key of Object.keys(mapping) as (keyof InvitationContact)[]) {
      const index = mapping[key];
      result[key] = index ? sheet.getRow(row).getCell(index).text.trim() : '';
      if (result[key].length > 254)
        throw new BadRequestException(
          `Fila ${row}: un campo excede 254 caracteres`,
        );
    }
    if (!Object.values(result).some(Boolean)) continue;
    result.email = result.email.toLowerCase();
    result.phone = result.phone.replace(/\D/g, '');
    if (!result.email && !result.phone)
      throw new BadRequestException(`Fila ${row}: falta correo o teléfono`);
    if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))
      throw new BadRequestException(`Fila ${row}: correo inválido`);
    if (result.phone && (result.phone.length < 10 || result.phone.length > 15))
      throw new BadRequestException(`Fila ${row}: teléfono inválido`);
    const key = result.email
      ? `email:${result.email}`
      : `phone:${result.phone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push(result);
  }
  if (!contacts.length)
    throw new BadRequestException('El archivo no contiene participantes');
  return contacts;
}
