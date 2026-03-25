import * as XLSX from "xlsx"
import { getWorkerCategoryLabel, hasWorkerCategory } from "./workerCategory"

function getIsoDay(dateString) {
  const dateObj = dateString ? new Date(`${dateString}T12:00:00`) : new Date()
  const dayIndex = dateObj.getDay()
  return dayIndex === 0 ? 7 : dayIndex
}

function buildWorkerMap(workers = []) {
  const map = new Map()
  for (const worker of workers) {
    const keys = [worker.id, worker.codigo].filter(Boolean)
    for (const key of keys) {
      map.set(String(key), worker)
    }
  }
  return map
}

export function getAccountingExportIssues(registros = [], workers = []) {
  const workerMap = buildWorkerMap(workers)
  const seen = new Map()

  for (const reg of registros) {
    const worker = workerMap.get(String(reg.workerId))
    if (!worker) {
      seen.set(String(reg.workerId), {
        nombre: reg.workerNombre || reg.workerId,
        missing: ["Trabajador no encontrado en catálogo"],
      })
      continue
    }

    const missing = []
    if (!String(worker.dni || "").trim()) missing.push("DNI")
    if (!hasWorkerCategory(worker)) missing.push("Categoría")
    if (!String(worker.fechaIngreso || "").trim()) missing.push("Fecha de Ingreso")

    if (missing.length > 0) {
      seen.set(String(worker.codigo || worker.id), {
        nombre: worker.nombre || reg.workerNombre || worker.codigo || worker.id,
        missing,
      })
    }
  }

  return Array.from(seen.values())
}

export function exportDatabaseXLSX(registros, workers, partidas, actividades) {
  const issues = getAccountingExportIssues(registros, workers)
  if (issues.length > 0) {
    const detail = issues
      .slice(0, 8)
      .map((issue) => `${issue.nombre}: ${issue.missing.join(", ")}`)
      .join(" | ")
    throw new Error(`No se puede exportar a contabilidad. Faltan datos obligatorios en trabajadores: ${detail}${issues.length > 8 ? "..." : ""}`)
  }

  const workerMap = buildWorkerMap(workers)
  const actividadMap = new Map(actividades.map((a) => [String(a.id), a]))
  const partidaMap = new Map(partidas.map((p) => [String(p.id), p]))
  const db = {}

  registros.forEach((reg) => {
    const isoDay = getIsoDay(reg.date)

    reg.assignments.forEach((assignment) => {
      const key = `${reg.workerId}|${reg.frenteNombre || ""}|${assignment.actividadId}|${assignment.partidaId || ""}`
      if (!db[key]) {
        db[key] = {
          workerId: reg.workerId,
          workerNombre: reg.workerNombre,
          frente: reg.frenteNombre || "",
          actividadId: assignment.actividadId,
          partidaId: assignment.partidaId,
          daysNormal: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
          daysExtra: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
        }
      }

      db[key].daysNormal[isoDay] += (assignment.horasNormales || 0)
      db[key].daysExtra[isoDay] += (assignment.horasExtras || 0)
    })
  })

  const sheetData = [[
    "DNI",
    "Código",
    "Trabajador",
    "Categoría",
    "Fecha Ingreso",
    "Costo Hora",
    "Frente",
    "Sector",
    "Elemento",
    "Actividad",
    "Código Partida de Control",
    "Partida de Control",
    "Lunes HN", "Lunes HE",
    "Martes HN", "Martes HE",
    "Miércoles HN", "Miércoles HE",
    "Jueves HN", "Jueves HE",
    "Viernes HN", "Viernes HE",
    "Sábado HN", "Sábado HE",
    "Domingo HN", "Domingo HE",
    "Total HN",
    "Total HE",
    "Total General",
    "Costo Total",
  ]]

  Object.values(db).forEach((row) => {
    const worker = workerMap.get(String(row.workerId))
    const actividad = actividadMap.get(String(row.actividadId))
    const partidaId = row.partidaId || actividad?.partidaId || ""
    const partida = partidaMap.get(String(partidaId))
    const totalHN = Object.values(row.daysNormal).reduce((a, b) => a + b, 0)
    const totalHE = Object.values(row.daysExtra).reduce((a, b) => a + b, 0)
    const totalGeneral = totalHN + totalHE
    const costoHora = Number(worker?.costoHora || 0)

    sheetData.push([
      worker?.dni || "",
      worker?.codigo || worker?.id || row.workerId,
      worker?.nombre || row.workerNombre || row.workerId,
      getWorkerCategoryLabel(worker, { includeCode: true, fallback: "" }),
      worker?.fechaIngreso || "",
      costoHora,
      row.frente,
      "",
      "",
      actividad?.nombre || row.actividadId,
      partida?.id || partidaId,
      partida ? partida.nombre : partidaId,
      row.daysNormal[1] || 0, row.daysExtra[1] || 0,
      row.daysNormal[2] || 0, row.daysExtra[2] || 0,
      row.daysNormal[3] || 0, row.daysExtra[3] || 0,
      row.daysNormal[4] || 0, row.daysExtra[4] || 0,
      row.daysNormal[5] || 0, row.daysExtra[5] || 0,
      row.daysNormal[6] || 0, row.daysExtra[6] || 0,
      row.daysNormal[7] || 0, row.daysExtra[7] || 0,
      totalHN,
      totalHE,
      totalGeneral,
      Number((totalGeneral * costoHora).toFixed(2)),
    ])
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(sheetData)
  ws["!cols"] = [
    { wch: 14 }, { wch: 12 }, { wch: 34 }, { wch: 18 }, { wch: 14 }, { wch: 12 },
    { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 30 }, { wch: 18 }, { wch: 36 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, "BaseDatosTareo")

  const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  const blob = new Blob([wbOut], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `BD_Tareo_${new Date().toISOString().split("T")[0]}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
