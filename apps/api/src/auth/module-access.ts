export const surveyOnlyRoleName = 'encuestas';

function normalizedRoleName(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function isSurveyOnlyRole(roleName?: string | null) {
  return normalizedRoleName(roleName) === surveyOnlyRoleName;
}

export function modulesForRole(roleName?: string | null) {
  return isSurveyOnlyRole(roleName) ? ['surveys'] : ['all'];
}

export function homePathForRole(roleName?: string | null) {
  return isSurveyOnlyRole(roleName) ? '/encuestas' : '/';
}

