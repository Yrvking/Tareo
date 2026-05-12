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
 * Formatea una fecha a "YYYY-MM-DD" usando la zona local.
 */
export function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function getTodayLocalDate() {
  return formatLocalDate(new Date())
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
    dates.push(formatLocalDate(d))
  }

  return { dates, monday }
}

/**
 * Retorna el número de semana ISO 8601.
 */
export function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

/**
 * Genera opciones de semanas para un selector.
 * @param {number} count - Cantidad de semanas hacia atrás.
 * @param {number} futureCount - Cantidad de semanas hacia adelante.
 */
export function getWeekOptions(count = 12, futureCount = 2) {
  const options = []
  const today = new Date()
  
  // Retroceder hasta el lunes de la semana actual
  const currentMonday = getWeekRange(formatLocalDate(today)).monday

  for (let i = -futureCount; i <= count; i++) {
    const monday = new Date(currentMonday)
    monday.setDate(currentMonday.getDate() - (i * 7))
    
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    
    const year = monday.getFullYear()
    const week = getWeekNumber(monday)
    
    const label = `SEMANA N° ${String(week).padStart(2, '0')} - ${year} (DEL ${formatDatePeru(monday)} AL ${formatDatePeru(sunday)})`
    
    options.push({
      value: `${year}_${week}`,
      label,
      year,
      week,
      startDate: formatLocalDate(monday),
      endDate: formatLocalDate(sunday)
    })
  }
  
  return options
}

function formatDatePeru(date) {
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}
