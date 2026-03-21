import * as XLSX from "xlsx"

/**
 * Map day index to Spanish day name
 */
const DAY_NAMES = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]

/**
 * Get the Monday of a given ISO week number + year.
 */
function getWeekStartDate(year, weekNum) {
  // ISO week: Jan 4 is always in week 1
  const jan4 = new Date(year, 0, 4)
  const dayOfWeek = jan4.getDay() || 7 // Mon=1 ... Sun=7
  const mondayW1 = new Date(jan4)
  mondayW1.setDate(jan4.getDate() - dayOfWeek + 1)
  // Add (weekNum - 1) * 7 days
  const result = new Date(mondayW1)
  result.setDate(mondayW1.getDate() + (weekNum - 1) * 7)
  return result
}

/**
 * Format date as dd/mm/yyyy
 */
function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/**
 * Get current ISO week number from a date
 */
export function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

/**
 * Generate S10-compatible weekly XLS file.
 *
 * @param {Object} params
 * @param {Array} params.registros - All daily registrations for the week
 * @param {Array} params.workers - Workers list with S10 fields
 * @param {Array} params.partidas - Partidas de control
 * @param {Array} params.tiposHora - Tipos de hora
 * @param {number} params.semana - Week number
 * @param {number} params.anio - Year
 * @param {Object} params.projectConfig - { empresa, obra, codigoProyecto, codigoNomina }
 */
export function generateWeeklyXLS({
  registros,
  workers,
  partidas,
  tiposHora,
  semana,
  anio,
  projectConfig = {},
}) {
  const {
    empresa = "INVERSIONES MELCEN S.A.",
    obra = "02 - Sunny- Construcción  - INV MELCEN",
    codigoProyecto = "03020001",
    codigoNomina = "002",
  } = projectConfig

  const wb = XLSX.utils.book_new()
  const weekStart = getWeekStartDate(anio, semana)

  // Create 7 day sheets
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dayDate = new Date(weekStart)
    dayDate.setDate(weekStart.getDate() + dayIdx)
    const dayName = DAY_NAMES[dayIdx]
    const dateStr = formatDate(dayDate)
    const dayDateStr = dayDate.toISOString().split("T")[0] // yyyy-mm-dd for matching

    // Filter registros for this day
    const dayRegistros = registros.filter((r) => {
      if (!r.date) return false
      return r.date === dayDateStr
    })

    // Build the sheet data
    const sheetData = []

    // Row 1: Header
    const row1 = new Array(53).fill("")
    row1[0] = empresa
    row1[5] = "Tareo de Mano de Obra"
    row1[12] = `${dayName} ${dateStr}`
    sheetData.push(row1)

    // Row 2: Obra
    const row2 = new Array(53).fill("")
    row2[0] = "OBRA:"
    row2[1] = obra
    sheetData.push(row2)

    // Row 3: Empty
    sheetData.push(new Array(53).fill(""))

    // Row 4: Type legend
    const row4 = new Array(53).fill("")
    row4[0] = "Tipo: N (Normal), E60 (Extra al 60%), E100 (Extra al 100%), DM (Descanso Médico)"
    sheetData.push(row4)

    // Row 5: Column headers - Rotación groups
    const row5 = new Array(53).fill("")
    row5[0] = "Cat"
    row5[1] = "Código"
    row5[2] = "Nombre"
    // 13 rotaciones, each with 4 columns: P.C. | Horas | (gap) | Tipo
    for (let r = 0; r < 13; r++) {
      const base = 3 + r * 4
      row5[base] = `Rotación ${r + 1}`
    }
    sheetData.push(row5)

    // Row 6: Sub-headers
    const row6 = new Array(53).fill("")
    for (let r = 0; r < 13; r++) {
      const base = 3 + r * 4
      row6[base] = "P.C."
      row6[base + 1] = "Horas"
      row6[base + 2] = ""
      row6[base + 3] = "Tipo"
    }
    sheetData.push(row6)

    // Worker rows
    for (const w of workers) {
      const row = new Array(53).fill("")
      row[0] = w.categoria || w.abrevCategoria || ""
      row[1] = w.codigo || w.id || ""
      row[2] = w.nombre || ""

      // Find registros for this worker on this day
      const workerDayRegs = dayRegistros.filter(
        (r) => String(r.workerId) === String(w.id) || String(r.workerId) === String(w.codigo)
      )

      // Fill rotaciones from assignments
      let rotIdx = 0
      for (const reg of workerDayRegs) {
        for (const a of reg.assignments) {
          if (rotIdx >= 13) break

          const base = 3 + rotIdx * 4
          row[base] = a.partidaId || ""

          // Normal hours
          if (a.horasNormales > 0) {
            row[base + 1] = a.horasNormales
            row[base + 3] = "N"
            rotIdx++
          }

          // Extra hours as separate rotation
          if (a.horasExtras > 0 && rotIdx < 13) {
            if (a.horasNormales > 0) {
              // New rotation for extras
              const base2 = 3 + rotIdx * 4
              row[base2] = a.partidaId || ""
              row[base2 + 1] = a.horasExtras
              row[base2 + 3] = "E60"
              rotIdx++
            } else {
              row[base + 1] = a.horasExtras
              row[base + 3] = "E60"
              rotIdx++
            }
          }

          if (a.horasNormales === 0 && a.horasExtras === 0) {
            rotIdx++
          }
        }
      }

      sheetData.push(row)
    }

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(sheetData)

    // Set column widths
    ws["!cols"] = [
      { wch: 10 }, // Cat
      { wch: 12 }, // Código
      { wch: 35 }, // Nombre
    ]
    for (let r = 0; r < 13; r++) {
      ws["!cols"].push({ wch: 12 }) // P.C.
      ws["!cols"].push({ wch: 6 })  // Horas
      ws["!cols"].push({ wch: 2 })  // gap
      ws["!cols"].push({ wch: 5 })  // Tipo
    }

    XLSX.utils.book_append_sheet(wb, ws, dayName)
  }

  // Add 'Partida de Control' sheet
  const pcData = partidas.map((p) => ["", p.id, p.nombre, `${p.id} ${p.nombre}`])
  const pcWS = XLSX.utils.aoa_to_sheet(pcData)
  pcWS["!cols"] = [{ wch: 4 }, { wch: 14 }, { wch: 50 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, pcWS, "Partida de Control")

  // Add 'TipoHora' sheet
  const thData = tiposHora.map((t) => ["", t.codigo, t.descripcion, t.abreviatura])
  const thWS = XLSX.utils.aoa_to_sheet(thData)
  thWS["!cols"] = [{ wch: 4 }, { wch: 6 }, { wch: 35 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, thWS, "TipoHora")

  // Add empty 'TipoDia' sheet
  const tdWS = XLSX.utils.aoa_to_sheet([[]])
  XLSX.utils.book_append_sheet(wb, tdWS, "TipoDia")

  // Generate filename
  const semStr = String(semana).padStart(2, "0")
  const filename = `TMO-${codigoProyecto}-${codigoNomina}-Sem${semStr}${anio}.xls`

  // Write and download
  const wbOut = XLSX.write(wb, { bookType: "xls", type: "array" })
  const blob = new Blob([wbOut], { type: "application/vnd.ms-excel" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)

  return filename
}
