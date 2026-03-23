import { parseLocalDate } from "./dateUtils"

/**
 * Lógica de Tareo para Construcción Civil Perú (Regímen 48h Semanales)
 * Distribución: Lun-Vie (8.5h) + Sáb (5.5h) = 48h
 */

export const getNormalHourCap = (dateString) => {
  if (!dateString) return 8.5;
  const date = parseLocalDate(dateString);
  const day = date.getDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sáb
  
  if (day === 0) return 0; // Domingo
  if (day === 6) return 5.5; // Sábado
  return 8.5; // Lunes a Viernes
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
