import * as XLSX from "xlsx"
import { getTodayLocalDate } from "./dateUtils"

function downloadWorkbook(wb, filename) {
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────────────────────────────────────
// S10 — Plantillas modelo
// ─────────────────────────────────────────────────────────────────────────────

export function downloadS10PersonalTemplate() {
  const wb = XLSX.utils.book_new()
  const data = [
    ["Código", "Nombre", "DNI", "Categoría", "Fecha Ingreso", "Código categoría", "Abreviatura Categoría", "Costo hora promedio", "Ocupación", "Activo Proyecto"],
    ["22002053", "CHUQUILIN ANGULO, OSCAR JUNIOR", "76214091", "003 Operario", "23/02/2026", "003", "ope", 25.0, "OPERARIO", "SI"],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [
    { wch: 14 }, { wch: 38 }, { wch: 14 }, { wch: 18 }, { wch: 14 },
    { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 16 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, "Personal S10")
  downloadWorkbook(wb, "plantilla_personal_s10.xlsx")
}

export function downloadS10PartidasTemplate() {
  const wb = XLSX.utils.book_new()
  const data = [
    ["Código Partida de Control", "Descripción"],
    ["010201015", "Traslado Vertical y Horizontal"],
    ["010202001", "Topografía"],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [{ wch: 24 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, ws, "Partidas Proyecto")
  downloadWorkbook(wb, "plantilla_partidas_s10.xlsx")
}

export function downloadS10ModeloTemplate() {
  const wb = XLSX.utils.book_new()

  const partidasData = [
    ["Código", "Descripción"],
    ["010201015", "Traslado Vertical y Horizontal"],
    ["010202001", "Topografía"],
  ]
  const partidasWs = XLSX.utils.aoa_to_sheet(partidasData)
  partidasWs["!cols"] = [{ wch: 18 }, { wch: 60 }]

  const tiposHoraData = [
    ["Código", "Descripción", "Abreviatura"],
    ["0", "NRO HRS NORMALES", "N"],
    ["1", "NRO HRS EXTRAS AL 60%", "E60"],
    ["2", "NRO HRS EXTRAS AL 100%", "E100"],
  ]
  const tiposHoraWs = XLSX.utils.aoa_to_sheet(tiposHoraData)
  tiposHoraWs["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 14 }]

  XLSX.utils.book_append_sheet(wb, partidasWs, "Partida de Control")
  XLSX.utils.book_append_sheet(wb, tiposHoraWs, "TipoHora")
  downloadWorkbook(wb, "plantilla_modelo_tmo.xlsx")
}

export function downloadS10CostosTemplate() {
  const wb = XLSX.utils.book_new()
  const data = [
    [
      "Código",
      "Apellidos y Nombres",
      "Proyecto",
      "Año",
      "Periodo Semanal",
      "Tipo de Nómina",
      "Fecha",
      "Horas laboradas",
      "Horas descanso",
      "Tipo Hora",
      "Código Partida de Control",
      "Partida de Control",
      "Costo HH Normal",
      "Costo HH Extra60",
      "Costo HH Extra100",
    ],
    [
      "22002053",
      "CHUQUILIN ANGULO, OSCAR JUNIOR",
      "03020001 - SUNNY",
      "2026",
      "SEM-09",
      "OBREROS",
      "2026-02-23",
      8.5,
      0,
      "N",
      "010201015",
      "Traslado Vertical y Horizontal",
      25.0,
      40.0,
      50.0,
    ],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [
    { wch: 14 }, { wch: 38 }, { wch: 24 }, { wch: 10 }, { wch: 16 },
    { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 22 }, { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, "Consolidado Costos")
  downloadWorkbook(wb, "plantilla_consolidado_costos_s10.xlsx")
}

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
  downloadWorkbook(wb, "plantilla_actividades.xlsx")
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

  const today = fechaTareo || getTodayLocalDate()
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
  downloadWorkbook(wb, "plantilla_tareo.xlsx")
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
