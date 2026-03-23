/**
 * Convierte "YYYY-MM-DD" a Date en hora local (sin conversión UTC).
 * new Date("YYYY-MM-DD") interpreta como UTC medianoche → en Peru (UTC-5)
 * retrocede un día. Esta función evita ese bug.
 */
export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Retorna el rango de la semana (Lun-Sab) para una fecha dada.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {{ dates: string[], monday: Date }}
 */
export function getWeekRange(dateStr) {
  const current = parseLocalDate(dateStr)
  const day = current.getDay() // 0=Dom, 1=Lun, ..., 6=Sab
  const diffToMonday = current.getDate() - (day === 0 ? 6 : day - 1)

  const monday = new Date(current.getFullYear(), current.getMonth(), diffToMonday)

  const dates = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }

  return { dates, monday }
}
