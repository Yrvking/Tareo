import * as XLSX from "xlsx"

const DAY_NAMES = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]

function getWeekStartDate(year, weekNum) {
  const jan4 = new Date(year, 0, 4)
  const dayOfWeek = jan4.getDay() || 7
  const mondayW1 = new Date(jan4)
  mondayW1.setDate(jan4.getDate() - dayOfWeek + 1)
  const result = new Date(mondayW1)
  result.setDate(mondayW1.getDate() + (weekNum - 1) * 7)
  return result
}

function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

/**
 * Genera el XLS semanal compatible con S10 (formato TMO exacto).
 *
 * Estructura por hoja día:
 *   Fila 1: código tipo "N" en col AA(26), "Hora normal" en AB(27)
 *   Fila 2: empresa(A), "Tareo de Mano de Obra"(F), "Día Fecha"(N), E60(AA), Hora+60%(AB)
 *   Fila 3: "OBRA:"(A), obra(B), E100(AA), Hora+100%(AB)
 *   Fila 4: DM(AA), Descanso médico(AB), nota reservada(BA=52)
 *   Fila 5: leyenda tipo(A), "<Intermedio>"(BA=52)
 *   Fila 6: encabezados grupo — Cat, Código, Nombre, Rot 1-5, GR, Tareo Día
 *   Fila 7: sub-encabezados — P.C., Horas, (gap), Tipo  ×5
 *   Filas 8+: una fila por trabajador, <Obrero> en col AY(50), <Fin> en BA(52) del último
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

  // Mapa código partida → "código nombre" (formato dropdown S10)
  const partidaMap = new Map(partidas.map(p => [p.id, `${p.id} ${p.nombre}`]))

  // Códigos de tipo hora en formato S10 "CÓDIGO DESCRIPCION"
  const tipoNormalCode = (() => {
    const t = tiposHora.find(t => t.codigo === "0" || t.abreviatura === "N")
    return t ? `${t.codigo} ${t.descripcion}` : "0 NRO HRS NORMALES"
  })()
  const tipoE60Code = (() => {
    const t = tiposHora.find(t => t.codigo === "1" || t.abreviatura === "E60")
    return t ? `${t.codigo} ${t.descripcion}` : "1 NRO HRS EXTRAS AL 60%"
  })()
  const tipoE100Code = (() => {
    const t = tiposHora.find(t => t.codigo === "2" || t.abreviatura === "E100")
    return t ? `${t.codigo} ${t.descripcion}` : "2 NRO HRS EXTRAS AL 100%"
  })()

  const wb = XLSX.utils.book_new()
  const weekStart = getWeekStartDate(anio, semana)

  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dayDate = new Date(weekStart)
    dayDate.setDate(weekStart.getDate() + dayIdx)
    const dayName = DAY_NAMES[dayIdx]
    const dateStr = formatDate(dayDate)
    const dayDateStr = dayDate.toISOString().split("T")[0]

    const dayRegistros = registros.filter(r => r.date === dayDateStr)
    const sheetData = []

    // ── Fila 1 (índice 0): leyenda tipo N ─────────────────────────────────────
    const r0 = new Array(53).fill("")
    r0[26] = "N"
    r0[27] = "Hora normal"
    sheetData.push(r0)

    // ── Fila 2 (índice 1): empresa, título, fecha, E60 ────────────────────────
    const r1 = new Array(53).fill("")
    r1[0] = empresa
    r1[5] = "Tareo de Mano de Obra"
    r1[13] = `${dayName} ${dateStr}`
    r1[26] = "E60"
    r1[27] = "Hora + 60%"
    sheetData.push(r1)

    // ── Fila 3 (índice 2): obra, E100 ─────────────────────────────────────────
    const r2 = new Array(53).fill("")
    r2[0] = "OBRA:"
    r2[1] = obra
    r2[26] = "E100"
    r2[27] = "Hora + 100%"
    sheetData.push(r2)

    // ── Fila 4 (índice 3): DM, nota variables reservadas ──────────────────────
    const r3 = new Array(53).fill("")
    r3[26] = "DM"
    r3[27] = "Descanso médico"
    r3[52] = "Las siguiente variables son reservadas"
    sheetData.push(r3)

    // ── Fila 5 (índice 4): leyenda tipo, marcador Intermedio ──────────────────
    const r4 = new Array(53).fill("")
    r4[0] = "Tipo: N (Normal), E?? (Extra), DM (Descanso médico)"
    r4[52] = "<Intermedio>"
    sheetData.push(r4)

    // ── Fila 6 (índice 5): encabezados de grupo ───────────────────────────────
    const r5 = new Array(53).fill("")
    r5[0] = "Cat"
    r5[1] = "Código"
    r5[2] = "Nombre"
    // 5 rotaciones × 4 columnas empezando en col D (índice 3)
    for (let rot = 0; rot < 5; rot++) {
      r5[3 + rot * 4] = `Rotación ${rot + 1}`
    }
    r5[23] = "GR"
    r5[24] = "Tareo Día"
    sheetData.push(r5)

    // ── Fila 7 (índice 6): sub-encabezados por rotación ───────────────────────
    const r6 = new Array(53).fill("")
    for (let rot = 0; rot < 5; rot++) {
      const base = 3 + rot * 4
      r6[base]     = "P.C."
      r6[base + 1] = "Horas"
      r6[base + 2] = ""
      r6[base + 3] = "Tipo"
    }
    sheetData.push(r6)

    // ── Filas de trabajadores (índice 7+) ──────────────────────────────────────
    for (let wIdx = 0; wIdx < workers.length; wIdx++) {
      const w = workers[wIdx]
      const isLast = wIdx === workers.length - 1
      const row = new Array(53).fill("")

      row[0] = w.categoria || ""
      row[1] = w.codigo || w.id || ""
      row[2] = w.nombre || ""

      const workerDayRegs = dayRegistros.filter(
        r => String(r.workerId) === String(w.id) || String(r.workerId) === String(w.codigo)
      )

      let rotIdx = 0
      for (const reg of workerDayRegs) {
        for (const a of reg.assignments) {
          if (rotIdx >= 5) break

          const pcValue = partidaMap.get(a.partidaId) || a.partidaId || ""

          if (a.horasNormales > 0) {
            const base = 3 + rotIdx * 4
            row[base]     = pcValue
            row[base + 1] = a.horasNormales
            row[base + 3] = tipoNormalCode
            rotIdx++
          }

          if (a.horasExtras > 0 && rotIdx < 5) {
            const base = 3 + rotIdx * 4
            row[base]     = pcValue
            row[base + 1] = a.horasExtras
            row[base + 3] = tipoE60Code
            rotIdx++
          }
        }
      }

      row[23] = "1.0"           // GR
      row[50] = "<Obrero>"      // col AY
      if (isLast) row[52] = "<Fin>"  // col BA, solo en el último

      sheetData.push(row)
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData)

    // Anchos de columna
    ws["!cols"] = [
      { wch: 10 },  // A — Cat
      { wch: 12 },  // B — Código
      { wch: 35 },  // C — Nombre
    ]
    for (let rot = 0; rot < 5; rot++) {
      ws["!cols"].push({ wch: 55 })  // P.C. (código + nombre partida)
      ws["!cols"].push({ wch: 7  })  // Horas
      ws["!cols"].push({ wch: 2  })  // gap
      ws["!cols"].push({ wch: 28 })  // Tipo
    }
    ws["!cols"].push({ wch: 5 })  // GR
    ws["!cols"].push({ wch: 10 }) // Tareo Día

    XLSX.utils.book_append_sheet(wb, ws, dayName)
  }

  // ── Hoja "Partida de Control" ──────────────────────────────────────────────
  const pcData = partidas.map(p => ["", p.id, p.nombre, `${p.id} ${p.nombre}`])
  const pcWS = XLSX.utils.aoa_to_sheet(pcData)
  pcWS["!cols"] = [{ wch: 4 }, { wch: 14 }, { wch: 55 }, { wch: 65 }]
  XLSX.utils.book_append_sheet(wb, pcWS, "Partida de Control")

  // ── Hoja "TipoHora" ────────────────────────────────────────────────────────
  const thData = tiposHora.map(t => ["", t.codigo, t.descripcion, `${t.codigo} ${t.descripcion}`])
  const thWS = XLSX.utils.aoa_to_sheet(thData)
  thWS["!cols"] = [{ wch: 4 }, { wch: 6 }, { wch: 35 }, { wch: 38 }]
  XLSX.utils.book_append_sheet(wb, thWS, "TipoHora")

  // ── Hoja "TipoDia" (vacía, requerida por S10) ──────────────────────────────
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "TipoDia")

  // ── Nombre de archivo y descarga ───────────────────────────────────────────
  const semStr = String(semana).padStart(2, "0")
  const filename = `TMO-${codigoProyecto}-${codigoNomina}-Sem${semStr}${anio}.xls`

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
