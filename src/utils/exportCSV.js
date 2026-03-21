import * as XLSX from "xlsx"

export function getSummary(registros) {
  const summary = {}
  for (const reg of registros) {
    if (!summary[reg.workerId]) {
      summary[reg.workerId] = {
        nombre: reg.workerNombre,
        partidasNormales: {},
        partidasExtras: {},
        totalNormales: 0,
        totalExtras: 0,
      }
    }
    for (const a of reg.assignments) {
      const hn = a.horasNormales || 0
      const he = a.horasExtras || 0

      if (!summary[reg.workerId].partidasNormales[a.partidaId]) {
        summary[reg.workerId].partidasNormales[a.partidaId] = 0
      }
      if (!summary[reg.workerId].partidasExtras[a.partidaId]) {
        summary[reg.workerId].partidasExtras[a.partidaId] = 0
      }

      summary[reg.workerId].partidasNormales[a.partidaId] += hn
      summary[reg.workerId].partidasExtras[a.partidaId] += he
      summary[reg.workerId].totalNormales += hn
      summary[reg.workerId].totalExtras += he
    }
  }
  return summary
}

export function getUniquePartidas(registros) {
  return [...new Set(registros.flatMap((r) => r.assignments.map((a) => a.partidaId)))]
}

export function exportDatabaseXLSX(registros, workers, partidas, actividades) {
  // We want a flat database: Worker, Frente, Sector, Elemento, Actividad, Partida, Lunes(N/E), Martes(N/E)...
  
  // First, group records by: workerId + frenteNombre + actividadId
  const db = {}
  
  registros.forEach(reg => {
    // Determine the day of week. Assuming reg.date is YYYY-MM-DD
    const dateObj = reg.date ? new Date(reg.date + "T00:00:00") : new Date()
    const dayIndex = dateObj.getDay() // 0 = Sun, 1 = Mon ...
    
    // Convert Sunday (0) to 7 for easier array mapping where Mon=1
    const isoDay = dayIndex === 0 ? 7 : dayIndex

    reg.assignments.forEach(a => {
      const key = `${reg.workerId}|${reg.frenteNombre || ""}|${a.actividadId}`
      if (!db[key]) {
        db[key] = {
          workerId: reg.workerId,
          frente: reg.frenteNombre || "",
          actividadId: a.actividadId,
          partidaId: a.partidaId,
          daysNormal: { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0 },
          daysExtra: { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0 }
        }
      }
      db[key].daysNormal[isoDay] += (a.horasNormales || 0)
      db[key].daysExtra[isoDay] += (a.horasExtras || 0)
    })
  })

  const sheetData = []
  
  // Headers
  sheetData.push([
    "DNI/Código", "Trabajador", "Categoría", 
    "Frente", "Sector", "Elemento", 
    "Actividad", "Partida de Control",
    "Lunes HN", "Lunes HE",
    "Martes HN", "Martes HE",
    "Miércoles HN", "Miércoles HE",
    "Jueves HN", "Jueves HE",
    "Viernes HN", "Viernes HE",
    "Sábado HN", "Sábado HE",
    "Domingo HN", "Domingo HE",
    "Total HN", "Total HE", "Total General"
  ])

  Object.values(db).forEach(row => {
    const worker = workers.find(w => String(w.id) === String(row.workerId) || String(w.codigo) === String(row.workerId))
    const act = actividades.find(a => a.id === row.actividadId)
    const pc = partidas.find(p => p.id === row.partidaId) || partidas.find(p => p.id === act?.partidaId)
    
    const actName = act ? act.nombre : row.actividadId
    const pcName = pc ? `${pc.id} - ${pc.nombre}` : row.partidaId

    const totalHN = Object.values(row.daysNormal).reduce((a,b)=>a+b, 0)
    const totalHE = Object.values(row.daysExtra).reduce((a,b)=>a+b, 0)

    sheetData.push([
      worker?.codigo || worker?.id || row.workerId,
      worker?.nombre || row.workerId,
      worker?.categoria || worker?.abrevCategoria || "",
      row.frente,
      "", // Sector (Empty for now)
      "", // Elemento (Empty for now)
      actName,
      pcName,
      row.daysNormal[1] || 0, row.daysExtra[1] || 0,
      row.daysNormal[2] || 0, row.daysExtra[2] || 0,
      row.daysNormal[3] || 0, row.daysExtra[3] || 0,
      row.daysNormal[4] || 0, row.daysExtra[4] || 0,
      row.daysNormal[5] || 0, row.daysExtra[5] || 0,
      row.daysNormal[6] || 0, row.daysExtra[6] || 0,
      row.daysNormal[7] || 0, row.daysExtra[7] || 0,
      totalHN, totalHE, totalHN + totalHE
    ])
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(sheetData)
  
  // Adjust column widths roughly
  ws["!cols"] = [
    { wch: 12 }, { wch: 35 }, { wch: 12 }, 
    { wch: 20 }, { wch: 15 }, { wch: 15 },
    { wch: 30 }, { wch: 40 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, 
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, 
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, 
    { wch: 8 }, { wch: 8 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }
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
