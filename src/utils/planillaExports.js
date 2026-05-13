import ExcelJS from "exceljs"
import { parseLocalDate } from "./dateUtils"
import { getAccountingExportIssues } from "./exportCSV"
import { getWeekNumber } from "./s10Exporter"
import { getWorkerCategoryLabel } from "./workerCategory"
import { resolveAccountingPartida } from "./accountingPartidas"

const APP = {
  dark: "FF0F172A",
  card: "FF1E293B",
  cardAlt: "FF172033",
  border: "FF334155",
  blue: "FF2563EB",
  blueSoft: "FFDBEAFE",
  gold: "FFEAB308",
  goldSoft: "FFFEF3C7",
  red: "FFEF4444",
  redSoft: "FFFEE2E2",
  green: "FF22C55E",
  dim: "FFCBD5E1",
  text: "FFF8FAFC",
  white: "FFFFFFFF",
  lightBlue: "FFA3DBFF",
  teal: "FF1BDDE5",
  pink: "FFFF4FD1",
  slate: "FFE2E8F0",
}

const thinBorder = {
  top: { style: "thin", color: { argb: APP.border } },
  left: { style: "thin", color: { argb: APP.border } },
  bottom: { style: "thin", color: { argb: APP.border } },
  right: { style: "thin", color: { argb: APP.border } },
}

function downloadBuffer(buffer, filename, mime) {
  const blob = new Blob([buffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function saveWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer()
  downloadBuffer(
    buffer,
    filename,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
}

function splitWorkerName(fullName) {
  const raw = String(fullName || "").trim()
  if (!raw) return { apellidos: "", nombres: "" }
  if (raw.includes(",")) {
    const [apellidos, nombres] = raw.split(",")
    return {
      apellidos: String(apellidos || "").trim(),
      nombres: String(nombres || "").trim(),
    }
  }
  const parts = raw.split(/\s+/)
  if (parts.length <= 2) {
    return { apellidos: raw, nombres: "" }
  }
  const middle = Math.ceil(parts.length / 2)
  return {
    apellidos: parts.slice(0, middle).join(" "),
    nombres: parts.slice(middle).join(" "),
  }
}

function formatDateEs(dateString) {
  if (!dateString) return ""
  const date = parseLocalDate(dateString)
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function buildAccountingWeek(fechaTareo) {
  const selected = parseLocalDate(fechaTareo)
  const monday = new Date(selected)
  const day = monday.getDay() || 7
  monday.setDate(monday.getDate() - (day - 1))

  const dates = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    dates.push(date)
  }

  return {
    number: getWeekNumber(selected),
    year: selected.getFullYear(),
    dates,
    monday: dates[0],
    sunday: dates[6],
  }
}

function buildWorkerMap(workers = []) {
  const map = new Map()
  workers.forEach((worker) => {
    const keys = [worker.id, worker.codigo].filter(Boolean)
    keys.forEach((key) => map.set(String(key), worker))
  })
  return map
}

function buildActivityMap(actividades = []) {
  return new Map((actividades || []).map((actividad) => [String(actividad.id), actividad]))
}

function buildPartidaMap(partidas = []) {
  return new Map((partidas || []).map((partida) => [String(partida.id), partida]))
}

function getWeekDays(weekRange = []) {
  const base = weekRange.map((day) => ({
    ...day,
    display: `${day.label} ${day.dayNum}`,
  }))
  if (base.length === 6) {
    const lastDate = parseLocalDate(base[base.length - 1].date)
    lastDate.setDate(lastDate.getDate() + 1)
    base.push({
      date: `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}-${String(lastDate.getDate()).padStart(2, "0")}`,
      label: "DOM",
      dayNum: lastDate.getDate(),
      display: `DOM ${lastDate.getDate()}`,
    })
  }
  return base
}

function makeSheetTitle(ws, title, subtitle, totalColumns, options = {}) {
  const titleFill = options.titleFill || APP.card
  const subtitleFill = options.subtitleFill || APP.cardAlt

  ws.mergeCells(1, 1, 1, totalColumns)
  ws.getCell(1, 1).value = title
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: APP.gold } }
  ws.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: titleFill } }
  ws.getCell(1, 1).alignment = { vertical: "middle", horizontal: "left" }
  ws.getCell(1, 1).border = thinBorder
  ws.getRow(1).height = 24

  ws.mergeCells(2, 1, 2, totalColumns)
  ws.getCell(2, 1).value = subtitle
  ws.getCell(2, 1).font = { size: 11, color: { argb: APP.dim }, italic: true }
  ws.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: subtitleFill } }
  ws.getCell(2, 1).alignment = { vertical: "middle", horizontal: "left" }
  ws.getCell(2, 1).border = thinBorder
  ws.getRow(2).height = 20

  ws.views = [{ state: "frozen", ySplit: 5 }]
}

function styleHeaderCell(cell, opts = {}) {
  const alignment = {
    horizontal: opts.horizontal || "center",
    vertical: "middle",
    wrapText: opts.wrapText ?? true,
  }
  if (typeof opts.textRotation === "number") {
    alignment.textRotation = opts.textRotation
  }

  cell.font = {
    bold: true,
    size: opts.size || 10,
    color: { argb: opts.fontColor || APP.text },
  }
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: opts.fill || APP.card },
  }
  cell.alignment = alignment
  cell.border = thinBorder
}

function styleDataCell(cell, opts = {}) {
  cell.font = {
    size: opts.size || 10,
    bold: Boolean(opts.bold),
    color: { argb: opts.fontColor || APP.text },
  }
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: opts.fill || APP.dark },
  }
  cell.border = thinBorder
  cell.alignment = {
    horizontal: opts.horizontal || "center",
    vertical: "middle",
    wrapText: opts.wrapText ?? false,
  }
  if (opts.numFmt) cell.numFmt = opts.numFmt
}

function buildWorkerWeeklyRows(workerWeeklyData = {}, weekRange = []) {
  return Object.entries(workerWeeklyData)
    .map(([workerId, data]) => {
      let totalHn = 0
      let totalHe = 0
      const dayValues = weekRange.map((day) => {
        const cell = data.days?.[day.date] || { hn: 0, he: 0 }
        totalHn += cell.hn || 0
        totalHe += cell.he || 0
        return cell
      })

      return {
        workerId,
        nombre: data.nombre,
        categoria: data.categoria,
        days: dayValues,
        totalHn,
        totalHe,
        total: totalHn + totalHe,
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

function buildAccountingRows(registros, workers, actividades, partidas, weekRange) {
  const workerMap = buildWorkerMap(workers)
  const activityMap = buildActivityMap(actividades)
  const partidaMap = buildPartidaMap(partidas)
  const weekDays = getWeekDays(weekRange)
  const groupMap = new Map()

  registros.forEach((reg) => {
    reg.assignments?.forEach((assignment) => {
      const hn = Number(assignment.horasNormales) || 0
      const he = Number(assignment.horasExtras) || 0
      if (!hn && !he) return

      const worker = workerMap.get(String(reg.workerId))
      const activity = activityMap.get(String(assignment.actividadId))
      const partidaId = String(activity?.partidaId || assignment.partidaId || "")
      const partida = partidaMap.get(partidaId)
      const observation = worker?.ocupacion || activity?.nombre || ""
      const groupKey = [String(reg.workerId), partidaId, observation].join("|")

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          workerId: String(reg.workerId),
          worker,
          workerNombre: reg.workerNombre,
          partidaId,
          partidaNombre: partida?.nombre || partidaId || "SIN PARTIDA",
          observation,
          days: Object.fromEntries(weekDays.map((day) => [day.date, { hn: 0, he60: 0, he100: 0 }])),
        })
      }

      const row = groupMap.get(groupKey)
      if (!row.days[reg.date]) {
        row.days[reg.date] = { hn: 0, he60: 0, he100: 0 }
      }
      row.days[reg.date].hn += hn
      row.days[reg.date].he60 += he
    })
  })

  return Array.from(groupMap.values())
    .sort((a, b) => {
      const nameA = a.worker?.nombre || a.workerNombre || a.workerId
      const nameB = b.worker?.nombre || b.workerNombre || b.workerId
      return nameA.localeCompare(nameB, "es")
    })
    .map((row, index) => {
      const worker = row.worker || {}
      const names = splitWorkerName(worker.nombre || row.workerNombre || row.workerId)
      const totalNormal = weekDays.reduce((sum, day) => sum + (row.days[day.date]?.hn || 0), 0)
      const total60 = weekDays.reduce((sum, day) => sum + (row.days[day.date]?.he60 || 0), 0)
      const total100 = weekDays.reduce((sum, day) => sum + (row.days[day.date]?.he100 || 0), 0)
      const total = totalNormal + total60 + total100
      const costoHora = Number(worker.costoHora || 0)
      const accountingPartida = resolveAccountingPartida(row.partidaId, row.partidaNombre)

      return {
        item: index + 1,
        dni: worker.dni || "",
        apellidos: names.apellidos,
        nombres: names.nombres,
        categoria: getWorkerCategoryLabel(worker, { fallback: "SIN CATEGORIA" }).toUpperCase(),
        pc: row.partidaId,
        partida: row.partidaNombre,
        partidaContable: accountingPartida.accountingCode,
        descripcionContable: accountingPartida.accountingDescription,
        falta: "",
        observation: row.observation,
        costoHora,
        costoTotal: total * costoHora,
        totalNormal,
        total60,
        total100,
        total,
        days: weekDays.map((day) => ({
          label: day.label,
          dayNum: day.dayNum,
          total:
            (row.days[day.date]?.hn || 0) +
            (row.days[day.date]?.he60 || 0) +
            (row.days[day.date]?.he100 || 0),
        })),
      }
    })
}

function buildPersonalRows(registros, workers) {
  const workerMap = buildWorkerMap(workers)
  const seen = new Map()
  registros.forEach((reg) => {
    const worker = workerMap.get(String(reg.workerId))
    if (!worker) return
    seen.set(String(worker.codigo || worker.id), worker)
  })

  return Array.from(seen.values())
    .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"))
    .map((worker, index) => ({
      item:             index + 1,
      dni:              worker.dni || "",
      nombre:           worker.nombre || "",
      categoria:        getWorkerCategoryLabel(worker, { fallback: "SIN CATEGORIA" }).toUpperCase(),
      planilla:         worker.planilla || "",
      fechaIngreso:     worker.fechaIngreso || "",
      fechaCese:        worker.fechaCese || "",
      activo:           worker.activo || "",
      codigo:           worker.codigo || worker.id || "",
      cussp:            worker.cussp || "",
      ocupacion:        worker.ocupacion || "",
      costoHora:        Number(worker.costoHora || 0),
      costoHoraExtra60: Number(worker.costoHoraExtra60 || 0),
      costoHoraExtra100:Number(worker.costoHoraExtra100 || 0),
      banco:            worker.banco || "",
      cuenta:           worker.cuenta || "",
      cci:              worker.cci || "",
      regimenPension:   worker.regimenPension || "",
      afp:              worker.afp || "",
      cantidadHijos:    Number(worker.cantidadHijos || 0),
      dh1_dni:          worker.dh1_dni || "",
      dh1_nombre:       worker.dh1_nombre || "",
      dh1_fechaNac:     worker.dh1_fechaNac || "",
      dh2_dni:          worker.dh2_dni || "",
      dh2_nombre:       worker.dh2_nombre || "",
      dh2_fechaNac:     worker.dh2_fechaNac || "",
      dh3_dni:          worker.dh3_dni || "",
      dh3_nombre:       worker.dh3_nombre || "",
      dh3_fechaNac:     worker.dh3_fechaNac || "",
      dh4_dni:          worker.dh4_dni || "",
      dh4_nombre:       worker.dh4_nombre || "",
      dh4_fechaNac:     worker.dh4_fechaNac || "",
    }))
}

function setColumnWidths(ws, widths = []) {
  widths.forEach((width, index) => {
    ws.getColumn(index + 1).width = width
  })
}

function writePlanillaSheet(workbook, title, subtitle, headers, rows, widths, options = {}) {
  const ws = workbook.addWorksheet(title)
  makeSheetTitle(ws, title, subtitle, headers.length)
  setColumnWidths(ws, widths)

  const headerRowIndex = 4
  const headerRow = ws.getRow(headerRowIndex)
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = header
    styleHeaderCell(cell, {
      fill: options.headerFill || APP.card,
      fontColor: options.headerFontColor || APP.text,
    })
  })
  headerRow.height = options.headerHeight || 18

  rows.forEach((rowValues, rowIndex) => {
    const row = ws.getRow(headerRowIndex + 1 + rowIndex)
    rowValues.forEach((value, columnIndex) => {
      const cell = row.getCell(columnIndex + 1)
      cell.value = value
      const zebra = rowIndex % 2 === 0 ? APP.dark : APP.cardAlt
      styleDataCell(cell, {
        fill: options.fillMap?.[columnIndex] || zebra,
        fontColor: options.fontMap?.[columnIndex] || APP.dim,
        horizontal: options.alignMap?.[columnIndex] || (columnIndex === 0 ? "left" : "center"),
        bold: options.boldCols?.includes(columnIndex),
      })
      if (typeof value === "number") cell.numFmt = options.numFmtMap?.[columnIndex] || "0.0"
    })
    row.height = options.rowHeight || 18
  })

  return ws
}

function buildVisualWorkbook({
  fechaTareo,
  projectConfig,
  weekRange,
  workerWeeklyData,
  dailyActivityReport,
  activityWeeklyMatrix,
  weeklyActivitySummary,
  weeklyPartidaSummary,
}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Codex"
  workbook.created = new Date()
  const weekLabel = `Semana ${String(getWeekNumber(parseLocalDate(fechaTareo))).padStart(2, "0")} - ${parseLocalDate(fechaTareo).getFullYear()}`
  const subtitle = `${projectConfig?.empresa || "Sin empresa"} · ${projectConfig?.obra || "Sin obra"} · ${weekLabel}`

  const workerRows = buildWorkerWeeklyRows(workerWeeklyData, weekRange).map((row) => [
    row.nombre,
    row.categoria,
    ...row.days.flatMap((day) => [day.hn || 0, day.he || 0]),
    row.totalHn,
    row.totalHe,
    row.total,
  ])

  const planillaHeaders = [
    "TRABAJADOR",
    "CAT.",
    ...weekRange.flatMap((day) => [`${day.label} ${day.dayNum} HN`, `${day.label} ${day.dayNum} HE`]),
    "T. NORMAL",
    "T. EXTRA",
    "T. TRAB.",
  ]
  writePlanillaSheet(
    workbook,
    "Planilla Semanal",
    subtitle,
    planillaHeaders,
    workerRows,
    [34, 14, ...weekRange.flatMap(() => [10, 10]), 12, 12, 12],
    {
      fillMap: Object.fromEntries([
        [0, APP.card],
        [1, APP.card],
        [planillaHeaders.length - 3, APP.goldSoft],
        [planillaHeaders.length - 2, APP.redSoft],
        [planillaHeaders.length - 1, APP.blueSoft],
      ]),
      fontMap: Object.fromEntries([
        [0, APP.text],
        [1, APP.text],
        [planillaHeaders.length - 3, APP.dark],
        [planillaHeaders.length - 2, APP.red],
        [planillaHeaders.length - 1, APP.blue],
      ]),
      alignMap: Object.fromEntries([[0, "left"]]),
      boldCols: [0, planillaHeaders.length - 3, planillaHeaders.length - 2, planillaHeaders.length - 1],
    }
  )

  const dailyHeaders = [
    "ITEM",
    "ACTIVIDAD",
    "PARTIDA DE CONTROL",
    "TOTAL HORAS",
    ...dailyActivityReport.workersToday.map((worker) => worker.nombre),
  ]
  const dailyRows = dailyActivityReport.rows.map((row) => [
    row.item,
    row.nombre,
    `${row.partidaId || ""} ${row.partidaNombre || ""}`.trim(),
    row.total,
    ...dailyActivityReport.workersToday.map((worker) => row.hoursByWorker[worker.id] || 0),
  ])
  if (dailyActivityReport.rows.length > 0) {
    dailyRows.push([
      "",
      "TOTAL",
      "",
      dailyActivityReport.grandTotal,
      ...dailyActivityReport.workersToday.map((worker) => dailyActivityReport.totalsByWorker[worker.id] || 0),
    ])
  }
  const dailySheet = writePlanillaSheet(
    workbook,
    "Actividad Diario",
    `${subtitle} · ${formatDateEs(fechaTareo)}`,
    dailyHeaders,
    dailyRows,
    [8, 34, 34, 12, ...dailyActivityReport.workersToday.map(() => 8)],
    {
      fillMap: Object.fromEntries([
        [1, APP.card],
        [2, APP.goldSoft],
        [3, APP.blueSoft],
      ]),
      fontMap: Object.fromEntries([
        [1, APP.text],
        [2, APP.dark],
        [3, APP.blue],
      ]),
      alignMap: Object.fromEntries([[1, "left"], [2, "left"]]),
      boldCols: [1, 3],
    }
  )
  dailyActivityReport.workersToday.forEach((_, index) => {
    const cell = dailySheet.getRow(4).getCell(5 + index)
    styleHeaderCell(cell, {
      fill: index % 2 === 0 ? APP.teal : APP.pink,
      fontColor: APP.dark,
      textRotation: 90,
      size: 9,
    })
  })
  dailySheet.getRow(4).height = 68

  const matrixHeaders = [
    "ACTIVIDAD",
    "PARTIDA DE CONTROL",
    ...weekRange.map((day) => `${day.label} ${day.dayNum}`),
    "TOTAL",
  ]
  const matrixRows = activityWeeklyMatrix.map((row) => {
    let total = 0
    const dayValues = weekRange.map((day) => {
      const value = (row.days?.[day.date]?.hn || 0) + (row.days?.[day.date]?.he || 0)
      total += value
      return value
    })
    return [row.nombre, row.partida, ...dayValues, total]
  })
  writePlanillaSheet(
    workbook,
    "Actividad Semanal",
    subtitle,
    matrixHeaders,
    matrixRows,
    [32, 32, ...weekRange.map(() => 11), 12],
    {
      fillMap: Object.fromEntries([
        [0, APP.card],
        [1, APP.card],
        [matrixHeaders.length - 1, APP.blueSoft],
      ]),
      fontMap: Object.fromEntries([
        [0, APP.text],
        [1, APP.dim],
        [matrixHeaders.length - 1, APP.blue],
      ]),
      alignMap: Object.fromEntries([[0, "left"], [1, "left"]]),
      boldCols: [0, matrixHeaders.length - 1],
    }
  )

  const resumenActividadRows = weeklyActivitySummary.map((row) => [
    row.nombre,
    row.totalHn,
    row.totalHe,
    row.totalHn + row.totalHe,
  ])
  writePlanillaSheet(
    workbook,
    "Resumen Actividad",
    subtitle,
    ["ACTIVIDAD", "HN", "HE", "TOTAL"],
    resumenActividadRows,
    [42, 12, 12, 12],
    {
      fillMap: { 0: APP.card, 1: APP.goldSoft, 2: APP.redSoft, 3: APP.blueSoft },
      fontMap: { 0: APP.text, 1: APP.dark, 2: APP.red, 3: APP.blue },
      alignMap: { 0: "left" },
      boldCols: [0, 3],
    }
  )

  const resumenPartidaRows = weeklyPartidaSummary.map((row) => [
    row.id,
    row.nombre,
    row.totalHn,
    row.totalHe,
    row.totalHn + row.totalHe,
  ])
  writePlanillaSheet(
    workbook,
    "Resumen Partida",
    subtitle,
    ["CODIGO", "PARTIDA DE CONTROL", "HN", "HE", "TOTAL"],
    resumenPartidaRows,
    [16, 44, 12, 12, 12],
    {
      fillMap: { 0: APP.goldSoft, 1: APP.card, 2: APP.goldSoft, 3: APP.redSoft, 4: APP.blueSoft },
      fontMap: { 0: APP.dark, 1: APP.text, 2: APP.dark, 3: APP.red, 4: APP.blue },
      alignMap: { 1: "left" },
      boldCols: [0, 1, 4],
    }
  )

  return workbook
}

function buildAccountingWorkbook({
  registros,
  workers,
  partidas,
  actividades,
  fechaTareo,
  projectConfig,
  weekRange,
}) {
  const issues = getAccountingExportIssues(registros, workers)
  if (issues.length > 0) {
    const detail = issues
      .slice(0, 8)
      .map((issue) => `${issue.nombre}: ${issue.missing.join(", ")}`)
      .join(" | ")
    throw new Error(`No se puede exportar a contabilidad. Faltan datos obligatorios en trabajadores: ${detail}${issues.length > 8 ? "..." : ""}`)
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Codex"
  workbook.created = new Date()

  const accountingWeek = buildAccountingWeek(fechaTareo)
  const weekDays = getWeekDays(weekRange)
  const accountingRows = buildAccountingRows(registros, workers, actividades, partidas, weekRange)
  const personalRows = buildPersonalRows(registros, workers)

  const ws = workbook.addWorksheet("TAREO SEMANA")
  ws.views = [{ state: "frozen", ySplit: 9 }]
  setColumnWidths(ws, [2.5, 6, 12, 18, 18, 14, 12, 28, 16, 24, 10, 6, 6, 6, 6, 6, 6, 6, 10, 10, 10, 24, 12, 14])

  ws.mergeCells("B2:D2")
  ws.getCell("B2").value = projectConfig?.empresa || "INVERSIONES MELCEN S.A."
  ws.getCell("B2").font = { bold: true, color: { argb: APP.dark } }
  ws.getCell("B2").alignment = { horizontal: "center", vertical: "middle" }

  ws.mergeCells("B3:D3")
  ws.getCell("B3").value = projectConfig?.ruc ? `RUC: ${projectConfig.ruc}` : "RUC:"
  ws.getCell("B3").alignment = { horizontal: "center", vertical: "middle" }

  ws.mergeCells("B4:D4")
  ws.getCell("B4").value = `OBRA: ${projectConfig?.obra || "SIN OBRA"}`
  ws.getCell("B4").font = { bold: true }
  ws.getCell("B4").alignment = { horizontal: "center", vertical: "middle" }

  ws.mergeCells("B6:T6")
  ws.getCell("B6").value = `TAREO DE PERSONAL OBRERO SEMANA N° ${String(accountingWeek.number).padStart(2, "0")} - ${accountingWeek.year} ( DEL ${formatDateEs(weekDays[0]?.date)} AL ${formatDateEs(weekDays[weekDays.length - 1]?.date)} )`
  ws.getCell("B6").font = { bold: true, size: 12 }
  ws.getCell("B6").alignment = { horizontal: "center", vertical: "middle" }

  ;["B2", "B3", "B4", "B6"].forEach((ref) => {
    ws.getCell(ref).fill = { type: "pattern", pattern: "solid", fgColor: { argb: APP.white } }
  })

  const mergedVertical = ["B8:B9", "C8:C9", "D8:D9", "E8:E9", "F8:F9", "G8:G9", "H8:H9", "I8:I9", "J8:J9", "K8:K9", "S8:S9", "T8:T9", "U8:U9", "V8:V9", "W8:W9", "X8:X9"]
  mergedVertical.forEach((range) => ws.mergeCells(range))

  const headLabels = {
    B8: "ITEM",
    C8: "DNI",
    D8: "APELLIDOS",
    E8: "NOMBRES",
    F8: "CATEGORIA",
    G8: "P.C",
    H8: "PARTIDA DE CONTROL",
    I8: "PARTIDA\nCONTABLE",
    J8: "DESC.\nCONTABLE",
    K8: "FALTA",
    L8: "LUN",
    M8: "MAR",
    N8: "MIÉ",
    O8: "JUE",
    P8: "VIE",
    Q8: "SÁB",
    R8: "DOM",
    S8: "HORAS\nNORMAL",
    T8: "H.H\n60%",
    U8: "H.H\n100%",
    V8: "OBSERVACION",
    W8: "COSTO\nHORA",
    X8: "COSTO\nTOTAL",
  }
  Object.entries(headLabels).forEach(([ref, value]) => {
    const cell = ws.getCell(ref)
    cell.value = value
    styleHeaderCell(cell, { fill: APP.lightBlue, fontColor: APP.dark, wrapText: true })
  })

  weekDays.forEach((day, index) => {
    const cell = ws.getCell(9, 12 + index)
    cell.value = day.dayNum
    styleHeaderCell(cell, { fill: APP.white, fontColor: APP.dark })
  })

  accountingRows.forEach((row, index) => {
    const excelRow = ws.getRow(10 + index)
    const values = [
      null,
      row.item,
      row.dni,
      row.apellidos,
      row.nombres,
        row.categoria,
        row.pc,
        row.partida,
        row.partidaContable,
        row.descripcionContable,
        row.falta,
        ...row.days.map((day) => day.total || 0),
        row.totalNormal,
        row.total60,
        row.total100,
      row.observation,
      row.costoHora,
      row.costoTotal,
    ]
    values.forEach((value, columnIndex) => {
      const cell = excelRow.getCell(columnIndex + 1)
      cell.value = value
      const fill = columnIndex >= 18 && columnIndex <= 20
        ? [APP.goldSoft, APP.redSoft, APP.redSoft][columnIndex - 18]
        : columnIndex === 22
          ? APP.goldSoft
            : columnIndex === 23
            ? APP.blueSoft
            : APP.white
      styleDataCell(cell, {
        fill,
        fontColor: columnIndex === 23 ? APP.blue : APP.dark,
        horizontal: columnIndex >= 11 && columnIndex <= 20 ? "center" : columnIndex === 3 || columnIndex === 4 || columnIndex === 7 || columnIndex === 9 || columnIndex === 21 ? "left" : "center",
        bold: columnIndex === 2 || columnIndex === 23,
      })
      if (typeof value === "number" && columnIndex >= 11 && columnIndex <= 23) {
        cell.numFmt = columnIndex >= 22 ? '"S/" #,##0.00' : "0.0"
      }
    })
    excelRow.height = 18
  })

  // ── HOJA: DATOS PERSONALES ─────────────────────────────────────────────
  const personalSheet = workbook.addWorksheet("DATOS PERSONALES")
  personalSheet.views = [{ state: "frozen", ySplit: 5 }]
  setColumnWidths(personalSheet, [
    6,   // N°
    14,  // DNI
    34,  // Nombre
    18,  // Categoria
    14,  // Planilla
    14,  // F. Ingreso
    14,  // F. Cese
    10,  // Estado
    12,  // Codigo
    14,  // CUSSP
    22,  // Ocupacion
    14,  // HH Normal
    14,  // HH 60%
    14,  // HH 100%
    16,  // Banco
    18,  // Cuenta
    22,  // CCI
    18,  // Regimen Pension
    16,  // AFP
    10,  // N° Hijos
    14,  // DH1 DNI
    28,  // DH1 Nombre
    14,  // DH1 F.Nac
    14,  // DH2 DNI
    28,  // DH2 Nombre
    14,  // DH2 F.Nac
    14,  // DH3 DNI
    28,  // DH3 Nombre
    14,  // DH3 F.Nac
    14,  // DH4 DNI
    28,  // DH4 Nombre
    14,  // DH4 F.Nac
  ])

  personalSheet.mergeCells("B4:F4")
  personalSheet.getCell("B4").value = "DATOS PERSONAL — PROYECTO " + (projectConfig?.codigoProyecto || "")
  personalSheet.getCell("B4").font = { bold: true, size: 12, color: { argb: APP.dark } }
  personalSheet.getCell("B4").alignment = { horizontal: "center", vertical: "middle" }
  personalSheet.getCell("B4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: APP.lightBlue } }

  const personalHeaders = [
    "N°",
    "DNI / CPP",
    "APELLIDOS Y NOMBRES",
    "CATEGORIA",
    "PLANILLA",
    "F. INGRESO",
    "F. CESE",
    "ESTADO",
    "CODIGO",
    "CUSSP",
    "OCUPACION",
    "MONTO HH\nNORMAL",
    "MONTO HH\n60%",
    "MONTO HH\n100%",
    "BANCO",
    "CUENTA",
    "CCI",
    "REGIMEN\nPENSION",
    "AFP",
    "N°\nHIJOS",
    "DH1\nDNI",
    "DH1 NOMBRE",
    "DH1\nF.NAC",
    "DH2\nDNI",
    "DH2 NOMBRE",
    "DH2\nF.NAC",
    "DH3\nDNI",
    "DH3 NOMBRE",
    "DH3\nF.NAC",
    "DH4\nDNI",
    "DH4 NOMBRE",
    "DH4\nF.NAC",
  ]
  const personalHeaderRow = personalSheet.getRow(5)
  personalHeaders.forEach((header, index) => {
    const cell = personalHeaderRow.getCell(index + 1)
    cell.value = header
    styleHeaderCell(cell, { fill: APP.lightBlue, fontColor: APP.dark, wrapText: true })
  })
  personalHeaderRow.height = 30

  // Columnas numéricas (índice base-0)
  const personalNumCols = new Set([11, 12, 13, 19])
  // Columnas con texto alineado a la izquierda
  const personalLeftCols = new Set([2, 10, 14, 21, 24, 27, 30])

  personalRows.forEach((row, index) => {
    const excelRow = personalSheet.getRow(6 + index)
    const values = [
      row.item,
      row.dni,
      row.nombre,
      row.categoria,
      row.planilla,
      row.fechaIngreso,
      row.fechaCese,
      row.activo,
      row.codigo,
      row.cussp,
      row.ocupacion,
      row.costoHora,
      row.costoHoraExtra60,
      row.costoHoraExtra100,
      row.banco,
      row.cuenta,
      row.cci,
      row.regimenPension,
      row.afp,
      row.cantidadHijos,
      row.dh1_dni,
      row.dh1_nombre,
      row.dh1_fechaNac,
      row.dh2_dni,
      row.dh2_nombre,
      row.dh2_fechaNac,
      row.dh3_dni,
      row.dh3_nombre,
      row.dh3_fechaNac,
      row.dh4_dni,
      row.dh4_nombre,
      row.dh4_fechaNac,
    ]
    const zebra = index % 2 === 0 ? APP.white : "FFF8FAFC"
    values.forEach((value, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1)
      cell.value = value
      styleDataCell(cell, {
        fill: colIdx === 7
          ? (row.activo === "ACTIVO" ? "FFD1FAE5" : "FFFEE2E2")
          : zebra,
        fontColor: colIdx === 7
          ? (row.activo === "ACTIVO" ? "FF065F46" : APP.red)
          : APP.dark,
        horizontal: personalLeftCols.has(colIdx) ? "left" : "center",
        bold: colIdx === 2,
      })
      if (personalNumCols.has(colIdx) && typeof value === "number") {
        cell.numFmt = colIdx === 19 ? "0" : '"S/" #,##0.00'
      }
    })
    excelRow.height = 18
  })

  return workbook
}

export async function exportStyledPlanillaWorkbook(payload) {
  const workbook = buildVisualWorkbook(payload)
  const selected = parseLocalDate(payload.fechaTareo)
  const filename = `Planilla_Visual_Sem${String(getWeekNumber(selected)).padStart(2, "0")}_${selected.getFullYear()}.xlsx`
  await saveWorkbook(workbook, filename)
  return filename
}

export async function exportAccountingWorkbook(payload) {
  const workbook = buildAccountingWorkbook(payload)
  const selected = parseLocalDate(payload.fechaTareo)
  const filename = `TAREO SEMANA ${String(getWeekNumber(selected)).padStart(2, "0")} - ${selected.getFullYear()} - ${payload.projectConfig?.obra || "OBRA"}.xlsx`
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  await saveWorkbook(workbook, filename)
  return filename
}

export async function exportReportePlanilla(payload) {
  const { registros, workers, fechaTareo, projectConfig, weekRange, netosFinanzas = {} } = payload
  const workerMap = buildWorkerMap(workers)
  const weekDays = getWeekDays(weekRange)
  
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Codex"
  workbook.created = new Date()

  const weekNum = getWeekNumber(parseLocalDate(fechaTareo))
  const year = parseLocalDate(fechaTareo).getFullYear()
  const sheetName = `REPORTE PLANILLA SEM ${weekNum}`
  const ws = workbook.addWorksheet(sheetName)

  // Headers
  const baseHeaders = ["ITEM", "DNI", "APELLIDOS Y NOMBRES", "CATEGORIA"]
  const dayHeaders = weekDays.flatMap(d => [`${d.label} ${d.dayNum} HN`, `${d.label} ${d.dayNum} HE`])
  const totalHeaders = ["TOT HN", "TOT HE", "EXT 60%", "EXT 100%", "TOTAL HORAS", "NETO FINANZAS"]
  const bankHeaders = ["BANCO", "CUENTA", "CCI"]
  
  const headers = [...baseHeaders, ...dayHeaders, ...totalHeaders, ...bankHeaders]
  
  // Title
  ws.mergeCells(1, 1, 1, headers.length)
  ws.getCell(1, 1).value = `REPORTE DE PLANILLA - SEMANA ${weekNum} - ${year}`
  ws.getCell(1, 1).font = { bold: true, size: 14 }
  ws.getCell(1, 1).alignment = { horizontal: "center" }

  ws.mergeCells(2, 1, 2, headers.length)
  ws.getCell(2, 1).value = `OBRA: ${projectConfig?.obra || "TODAS"} | PERIODO: DEL ${formatDateEs(weekDays[0]?.date)} AL ${formatDateEs(weekDays[weekDays.length - 1]?.date)}`
  ws.getCell(2, 1).alignment = { horizontal: "center" }

  const headerRow = ws.getRow(4)
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    styleHeaderCell(cell, { 
      fill: i >= baseHeaders.length + dayHeaders.length && i < baseHeaders.length + dayHeaders.length + totalHeaders.length ? APP.lightBlue : APP.card, 
      fontColor: i >= baseHeaders.length + dayHeaders.length && i < baseHeaders.length + dayHeaders.length + totalHeaders.length ? APP.dark : APP.text 
    })
  })

  // Data
  const groupMap = new Map()
  registros.forEach(reg => {
    const workerId = String(reg.workerId)
    if (!groupMap.has(workerId)) {
      const worker = workerMap.get(workerId)
      groupMap.set(workerId, {
        id: workerId,
        dni: worker?.dni || "",
        codigo: worker?.codigo || "",
        nombre: worker?.nombre || reg.workerNombre || workerId,
        categoria: getWorkerCategoryLabel(worker, { fallback: "PEÓN" }).toUpperCase(),
        banco: worker?.banco || "",
        cuenta: worker?.cuenta || "",
        cci: worker?.cci || "",
        days: Object.fromEntries(weekDays.map(d => [d.date, { hn: 0, he: 0 }]))
      })
    }
    const row = groupMap.get(workerId)
    reg.assignments?.forEach(as => {
      if (row.days[reg.date]) {
        row.days[reg.date].hn += (Number(as.horasNormales) || 0)
        row.days[reg.date].he += (Number(as.horasExtras) || 0)
      }
    })
  })

  const rows = Array.from(groupMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  
  rows.forEach((row, i) => {
    const excelRow = ws.getRow(5 + i)
    let totalHn = 0
    let totalHe = 0
    const dayValues = weekDays.flatMap(d => {
      const h = row.days[d.date] || { hn: 0, he: 0 }
      totalHn += h.hn
      totalHe += h.he
      return [h.hn || null, h.he || null]
    })

    const neto = netosFinanzas[row.id] || netosFinanzas[row.dni] || netosFinanzas[row.codigo] || 0

    const values = [
      i + 1,
      row.dni,
      row.nombre,
      row.categoria,
      ...dayValues,
      totalHn,
      totalHe,
      0, // EXT 60%
      0, // EXT 100%
      totalHn + totalHe,
      neto || null,
      row.banco,
      row.cuenta,
      row.cci
    ]

    values.forEach((v, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1)
      cell.value = v
      styleDataCell(cell, {
        fill: i % 2 === 0 ? APP.white : "FFF9FAFB",
        fontColor: colIdx === baseHeaders.length + dayHeaders.length + 5 ? APP.blue : APP.dark, // NETO FINANZAS blue
        horizontal: colIdx === 2 || colIdx >= headers.length - 3 ? "left" : "center",
        bold: colIdx === 2 || colIdx === baseHeaders.length + dayHeaders.length + 4 || colIdx === baseHeaders.length + dayHeaders.length + 5
      })
      
      // Numbers format
      if (typeof v === "number") {
        if (colIdx >= baseHeaders.length && colIdx < baseHeaders.length + dayHeaders.length + 5) {
          cell.numFmt = "0.0"
        } else if (colIdx === baseHeaders.length + dayHeaders.length + 5) {
          cell.numFmt = '"S/" #,##0.00'
        }
      }
    })
  })

  // Widths
  const widths = [
    5, 12, 35, 15, // Base
    ...weekDays.flatMap(() => [6, 6]), // Days
    10, 10, 10, 10, 12, 14, // Totals
    15, 20, 25 // Bank
  ]
  setColumnWidths(ws, widths)

  const filename = `REPORTE PLANILLA - ${projectConfig?.obra || "OBRA"} - SEM ${weekNum}.xlsx`
  await saveWorkbook(workbook, filename)
  return filename
}
