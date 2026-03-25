import { parseLocalDate } from "./dateUtils"

/**
 * Lógica de Tareo
 * Reglas operativas actuales:
 * - Máximo 8.5 horas normales por día.
 * - Máximo 2.5 horas extras por día.
 * - No existe conversión automática entre HN y HE.
 */

export const NORMAL_HOUR_CAP = 8.5
export const EXTRA_HOUR_CAP = 2.5

export const getNormalHourCap = (dateString) => {
  if (!dateString) return NORMAL_HOUR_CAP;
  const date = parseLocalDate(dateString);
  const day = date.getDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sáb
  
  if (day === 0) return 0; // Domingo
  return NORMAL_HOUR_CAP; // Lunes a Sábado
};

export const getExtraHourCap = () => EXTRA_HOUR_CAP

const roundHours = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const summarizeAssignmentHours = (assignments = []) => {
  const list = Array.isArray(assignments) ? assignments : []
  return list.reduce(
    (sum, assignment) => ({
      hn: roundHours(sum.hn + roundHours(assignment?.horasNormales)),
      he: roundHours(sum.he + roundHours(assignment?.horasExtras)),
    }),
    { hn: 0, he: 0 }
  )
}

export const validateAssignmentsByDailyLimits = ({
  assignments = [],
  dateString,
  usedNormalHours = 0,
  usedExtraHours = 0,
}) => {
  const normalCap = getNormalHourCap(dateString)
  const extraCap = getExtraHourCap(dateString)
  const submitted = summarizeAssignmentHours(assignments)
  const totalNormal = roundHours(roundHours(usedNormalHours) + submitted.hn)
  const totalExtra = roundHours(roundHours(usedExtraHours) + submitted.he)
  const errors = []

  if (totalNormal > normalCap) {
    errors.push(`Las Horas Normales del día suman ${totalNormal}h y el tope es ${normalCap}h.`)
  }

  if (totalExtra > extraCap) {
    errors.push(`Las Horas Extras del día suman ${totalExtra}h y el tope es ${extraCap}h.`)
  }

  return {
    valid: errors.length === 0,
    normalCap,
    extraCap,
    usedNormalHours: roundHours(usedNormalHours),
    usedExtraHours: roundHours(usedExtraHours),
    submittedNormalHours: submitted.hn,
    submittedExtraHours: submitted.he,
    totalNormal,
    totalExtra,
    errors,
  }
}

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
