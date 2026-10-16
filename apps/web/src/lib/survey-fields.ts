export const fieldLabels = { name: 'Nombre', email: 'Correo', phone: 'Teléfono', municipality: 'Municipio', locality: 'Localidad', postalCode: 'Código postal', address: 'Domicilio', curp: 'CURP', voterKey: 'Clave de elector', electoralSection: 'Sección electoral' };
export type PersonalField = { key: keyof typeof fieldLabels; required: boolean };
export function legacyFields(survey: { identityMode: string; personalFields?: PersonalField[] | null; collectMunicipality?: boolean; collectLocality?: boolean; collectPostalCode?: boolean; collectAddress?: boolean; collectCurp?: boolean; collectVoterKey?: boolean; collectElectoralSection?: boolean }): PersonalField[] {
  if (survey.personalFields) return survey.personalFields;
  const fields: PersonalField[] = [];
  if (survey.identityMode !== 'anonymous') fields.push({key:'name',required:true});
  if (survey.identityMode.includes('email')) fields.push({key:'email',required:survey.identityMode !== 'email_or_phone'});
  if (survey.identityMode.includes('phone')) fields.push({key:'phone',required:survey.identityMode !== 'email_or_phone'});
  for (const key of ['municipality','locality','postalCode','address','curp','voterKey','electoralSection'] as const) {
    const flag = `collect${key[0].toUpperCase()}${key.slice(1)}` as keyof typeof survey;
    if (survey[flag]) fields.push({key,required:true});
  }
  return fields;
}
