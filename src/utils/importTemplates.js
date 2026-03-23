import * as XLSX from "xlsx"

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVIDADES — Plantilla de importación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera y descarga una plantilla Excel para importar actividades.
 * Columnas: ID | NOMBRE_ACTIVIDAD | CODIGO_PARTIDA | NOMBRE_PARTIDA (referencia)
 */
export function downloadActividadesTemplate(partidas = []) {
  const wb = XLSX.utils.book_new()

  const headerRow = ["ID", "NOMBRE_ACTIVIDAD", "CODIGO_PARTIDA", "NOMBRE_PARTIDA (referencia)"]
  const exampleRow1 = ["A001", "ACARREO HORIZONTAL", "010201015", "Traslado Vertical y Horizontal"]
  const exampleRow2 = ["A002", "TOPOGRAFIA", "010202001", "Topografia"]

  const data = [headerRow, exampleRow1, exampleRow2]

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [{ wch: 8 }, { wch: 50 }, { wch: 16 }, { wch: 50 }]

  // Hoja de referencia con todas las partidas disponibles
  const refData = [["CODIGO_PARTIDA", "NOMBRE_PARTIDA"], ...partidas.map(p => [p.id, p.nombre])]
  const refWS = XLSX.utils.aoa_to_sheet(refData)
  refWS["!cols"] = [{ wch: 16 }, { wch: 60 }]

  XLSX.utils.book_append_sheet(wb, ws, "Actividades")
  XLSX.utils.book_append_sheet(wb, refWS, "Partidas (referencia)")

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "plantilla_actividades.xlsx"
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Parsea un Excel de actividades (mismo formato que la plantilla).
 * Fila 1 = encabezados (se omite). Columnas: A=ID, B=Nombre, C=CódigoPartida.
 * @returns {Array<{id, nombre, partidaId}>}
 */
export function parseActividadesFromXLSX(buffer) {
  const wb = XLSX.read(buffer, { type: "array" })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })

  const result = []
  for (let i = 1; i < rows.length; i++) {
    const [id, nombre, partidaId] = rows[i]
    const idStr = String(id || "").trim()
    const nombreStr = String(nombre || "").trim().toUpperCase()
    const partidaStr = String(partidaId || "").trim()
    if (!idStr || !nombreStr) continue
    result.push({ id: idStr, nombre: nombreStr, partidaId: partidaStr || null })
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// TAREO — Plantilla de importación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera y descarga una plantilla Excel para importar tareos diarios.
 * Columnas: FECHA | COD_TRABAJADOR | NOMBRE_TRABAJADOR | COD_ACTIVIDAD |
 *           NOMBRE_ACTIVIDAD (ref) | HORAS_NORMALES | HORAS_EXTRAS
 */
export function downloadTareoTemplate(workers = [], actividades = [], fechaTareo = "") {
  const wb = XLSX.utils.book_new()

  const header = [
    "FECHA (YYYY-MM-DD)",
    "COD_TRABAJADOR",
    "NOMBRE_TRABAJADOR",
    "COD_ACTIVIDAD",
    "NOMBRE_ACTIVIDAD (referencia)",
    "HORAS_NORMALES",
    "HORAS_EXTRAS",
  ]

  const today = fechaTareo || new Date().toISOString().split("T")[0]
  const w0 = workers[0] || {}
  const a0 = actividades[0] || {}
  const exRow = [
    today,
    w0.codigo || w0.id || "22002053",
    w0.nombre || "APELLIDO, NOMBRE",
    a0.id || "A001",
    a0.nombre || "ACARREO HORIZONTAL",
    8.5,
    0,
  ]

  const data = [header, exRow]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 45 }, { wch: 16 }, { wch: 14 }]

  // Hoja de referencia: trabajadores
  const wrkData = [["COD_TRABAJADOR", "NOMBRE_TRABAJADOR", "CATEGORIA"], ...workers.map(w => [w.codigo || w.id, w.nombre, w.categoria])]
  const wrkWS = XLSX.utils.aoa_to_sheet(wrkData)
  wrkWS["!cols"] = [{ wch: 14 }, { wch: 40 }, { wch: 15 }]

  // Hoja de referencia: actividades
  const actData = [["COD_ACTIVIDAD", "NOMBRE_ACTIVIDAD", "PARTIDA_ID"], ...actividades.map(a => [a.id, a.nombre, a.partidaId])]
  const actWS = XLSX.utils.aoa_to_sheet(actData)
  actWS["!cols"] = [{ wch: 12 }, { wch: 50 }, { wch: 14 }]

  XLSX.utils.book_append_sheet(wb, ws, "Tareo")
  XLSX.utils.book_append_sheet(wb, wrkWS, "Trabajadores (ref)")
  XLSX.utils.book_append_sheet(wb, actWS, "Actividades (ref)")

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "plantilla_tareo.xlsx"
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Parsea un Excel de tareo (mismo formato que la plantilla).
 * Devuelve array de registros agrupados por trabajador+fecha.
 * @returns {Array<{workerId, workerNombre, date, assignments: [{actividadId, partidaId, horasNormales, horasExtras}]}>}
 */
export function parseTareoFromXLSX(buffer, workers = [], actividades = []) {
  const wb = XLSX.read(buffer, { type: "array" })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })

  // Map worker code → worker
  const workerByCode = new Map()
  workers.forEach(w => {
    if (w.codigo) workerByCode.set(String(w.codigo).trim(), w)
    workerByCode.set(String(w.id).trim(), w)
  })

  // Map actividad code → actividad
  const actByCode = new Map(actividades.map(a => [String(a.id).trim(), a]))

  // Group by worker+date
  const regMap = new Map()

  for (let i = 1; i < rows.length; i++) {
    const [fecha, codTrab, , codAct, , hn, he] = rows[i]
    const fechaStr = String(fecha || "").trim()
    const codTrabStr = String(codTrab || "").trim()
    const codActStr = String(codAct || "").trim()

    if (!fechaStr || !codTrabStr || !codActStr) continue

    const worker = workerByCode.get(codTrabStr)
    if (!worker) continue
    const act = actByCode.get(codActStr)
    if (!act) continue

    const key = `${worker.id}|${fechaStr}`
    if (!regMap.has(key)) {
      regMap.set(key, {
        id: null,
        workerId: worker.id,
        workerNombre: worker.nombre,
        frenteId: null,
        frenteNombre: null,
        date: fechaStr,
        timestamp: new Date().toLocaleTimeString("es-PE"),
        raw: "Importado desde Excel",
        assignments: [],
      })
    }

    regMap.get(key).assignments.push({
      actividadId: act.id,
      partidaId: act.partidaId || null,
      horasNormales: parseFloat(hn) || 0,
      horasExtras: parseFloat(he) || 0,
    })
  }

  return Array.from(regMap.values())
}
