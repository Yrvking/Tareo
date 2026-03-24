import { parseLocalDate } from "./dateUtils"

/**
 * Lógica de Tareo
 * Regla operativa actual: máximo 8.5 horas normales por día.
 * Todo exceso pasa automáticamente a horas extras.
 */

export const getNormalHourCap = (dateString) => {
  if (!dateString) return 8.5;
  const date = parseLocalDate(dateString);
  const day = date.getDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sáb
  
  if (day === 0) return 0; // Domingo
  return 8.5; // Lunes a Sábado
};

const roundHours = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const normalizeAssignmentsByDailyCap = (assignments = [], dateString, usedNormalHours = 0) => {
  const cap = getNormalHourCap(dateString);
  let remainingNormal = Math.max(0, roundHours(cap - usedNormalHours));
  let movedToExtra = 0;

  const normalizedAssignments = (Array.isArray(assignments) ? assignments : []).map((assignment) => {
    const horasNormales = roundHours(assignment?.horasNormales);
    const horasExtras = roundHours(assignment?.horasExtras);
    const allowedNormal = Math.min(horasNormales, remainingNormal);
    const overflowNormal = Math.max(0, roundHours(horasNormales - allowedNormal));

    remainingNormal = roundHours(remainingNormal - allowedNormal);
    movedToExtra = roundHours(movedToExtra + overflowNormal);

    return {
      ...assignment,
      horasNormales: roundHours(allowedNormal),
      horasExtras: roundHours(horasExtras + overflowNormal),
    };
  });

  return {
    assignments: normalizedAssignments,
    cap,
    usedNormalHours: roundHours(usedNormalHours),
    movedToExtra,
    adjusted: movedToExtra > 0,
  };
};

/**
 * Divide las horas totales en Normales y Extras basándose en la fecha
 */
export const splitHoursByCap = (totalHours, dateString) => {
  const cap = getNormalHourCap(dateString);
  const hn = Math.min(totalHours, cap);
  const he = Math.max(0, totalHours - cap);
  
  return {
    normales: hn,
    extras: he,
    cap: cap
  };
};

export const JORNALES_2026 = {
  OPERARIO: 89.30,
  OFICIAL: 69.75,
  PEON: 62.80
};

export const CATEGORIAS = [
  { id: 'operario', nombre: 'Operario', jornal: JORNALES_2026.OPERARIO },
  { id: 'oficial', nombre: 'Oficial', jornal: JORNALES_2026.OFICIAL },
  { id: 'peon', nombre: 'Peón', jornal: JORNALES_2026.PEON }
];
