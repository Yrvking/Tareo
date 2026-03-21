import * as XLSX from "xlsx"

/**
 * Parse the personnel XLSX file from S10.
 * Extracts key fields: código, nombre, categoría, dni, costoHora, fechaIngreso, ocupación
 */
export function parsePersonalXLSX(fileBuffer) {
  const wb = XLSX.read(fileBuffer, { type: "array" })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(sheet, { defval: "" })

  return data.map((row) => {
    // Map column names (may have encoding issues with accents)
    const codigo = row["Código"] || row["C\u00f3digo"] || row["Codigo"] || ""
    const nombre = row["Nombre"] || ""
    const categoriaCode = row["Código categoría"] || row["C\u00f3digo categor\u00eda"] || row["Codigo categoria"] || ""
    const categoria = row["Categoría"] || row["Categor\u00eda"] || row["Categoria"] || ""
    const abrevCategoria = row["Abreviatura Categoría"] || row["Abreviatura Categor\u00eda"] || ""
    const dni = row["DNI"] || ""
    const costoHora = parseFloat(row["Costo hora promedio"] || "0") || 0
    const fechaIngreso = row["Fecha Ingreso"] || ""
    const ocupacion = row["Ocupación"] || row["Ocupaci\u00f3n"] || row["Ocupacion"] || ""
    const activo = row["Activo Proyecto"] || ""

    return {
      id: String(codigo).trim(),
      codigo: String(codigo).trim(),
      nombre: String(nombre).trim(),
      categoriaCode: String(categoriaCode).trim(),
      categoria: String(categoria).trim(),
      abrevCategoria: String(abrevCategoria).trim(),
      dni: String(dni).trim(),
      costoHora,
      fechaIngreso: String(fechaIngreso).trim(),
      ocupacion: String(ocupacion).trim(),
      activo: String(activo).trim(),
    }
  }).filter(w => w.codigo && w.nombre)
}

/**
 * Parse 'Partida de Control' sheet from an S10 model XLS file.
 */
export function parsePartidasFromXLS(fileBuffer) {
  const wb = XLSX.read(fileBuffer, { type: "array" })

  // Find the 'Partida de Control' sheet
  const sheetName = wb.SheetNames.find(
    (n) => n.toLowerCase().includes("partida")
  )
  if (!sheetName) return []

  const sheet = wb.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })

  return data
    .map((row) => {
      // Column B = código, Column C = nombre (based on analysis)
      const id = String(row[1] || "").trim()
      const nombre = String(row[2] || "").trim()
      if (!id || !nombre) return null
      return { id, nombre }
    })
    .filter(Boolean)
}

/**
 * Parse 'TipoHora' sheet from an S10 model XLS file.
 */
export function parseTipoHoraFromXLS(fileBuffer) {
  const wb = XLSX.read(fileBuffer, { type: "array" })

  const sheetName = wb.SheetNames.find(
    (n) => n.toLowerCase().includes("tipohora") || n.toLowerCase().includes("tipo hora")
  )
  if (!sheetName) return []

  const sheet = wb.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })

  return data
    .map((row) => {
      const codigo = String(row[1] || "").trim()
      const descripcion = String(row[2] || "").trim()
      const abreviatura = String(row[3] || "").trim()
      if (!descripcion) return null
      return { codigo, descripcion, abreviatura }
    })
    .filter(Boolean)
}

/**
 * Parse summary tareo XLSX with hours and costs per period.
 */
export function parseResumenTareo(fileBuffer) {
  const wb = XLSX.read(fileBuffer, { type: "array", cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(sheet, { defval: "" })

  return data.map((row) => {
    const nombre = row["Apellidos y Nombres"] || ""
    const proyecto = row["Proyecto"] || ""
    const anio = row["Año"] || row["A\u00f1o"] || ""
    const periodoSemanal = row["Periodo Semanal"] || ""
    const partidaControl = row["Partida de Control"] || ""
    const parcial = parseFloat(row["Parcial"] || "0") || 0
    const tipoNomina = row["Tipo de Nómina"] || row["Tipo de N\u00f3mina"] || ""
    const codigo = row["Código"] || row["C\u00f3digo"] || ""
    const fecha = row["Fecha"] || ""
    const horasLaboradas = parseFloat(row["Horas laboradas"] || "0") || 0
    const horasDescanso = parseFloat(row["Horas descanso"] || "0") || 0
    const codigoPartida = row["Código Partida de Control"] || row["C\u00f3digo Partida de Control"] || ""
    const tipoHora = row["Tipo Hora"] || ""
    const costoHHNormal = parseFloat(row["Costo HH Normal"] || "0") || 0
    const costoHHExtra60 = parseFloat(row["Costo HH Extra60"] || "0") || 0
    const costoHHExtra100 = parseFloat(row["Costo HH Extra100"] || "0") || 0

    return {
      nombre: String(nombre).trim(),
      proyecto: String(proyecto).trim(),
      anio: String(anio).trim(),
      periodoSemanal: String(periodoSemanal).trim(),
      partidaControl: String(partidaControl).trim(),
      parcial,
      tipoNomina: String(tipoNomina).trim(),
      codigo: String(codigo).trim(),
      fecha: fecha instanceof Date
        ? fecha.toLocaleDateString("es-PE")
        : String(fecha).trim(),
      horasLaboradas,
      horasDescanso,
      codigoPartida: String(codigoPartida).trim(),
      tipoHora: String(tipoHora).trim(),
      costoHHNormal,
      costoHHExtra60,
      costoHHExtra100,
    }
  }).filter(r => r.nombre && r.codigo)
}

/**
 * Extract workers list from a model XLS file (from day sheets).
 */
export function parseWorkersFromModelXLS(fileBuffer) {
  const wb = XLSX.read(fileBuffer, { type: "array" })
  const workers = new Map()

  // Day sheets are the first 7
  const daySheets = wb.SheetNames.slice(0, 7)
  for (const sheetName of daySheets) {
    const sheet = wb.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })

    // Workers start at row 7 (index 6) - rows: Cat | Código | Nombre ...
    for (let i = 6; i < data.length; i++) {
      const row = data[i]
      const categoria = String(row[0] || "").trim()
      const codigo = String(row[1] || "").trim()
      const nombre = String(row[2] || "").trim()

      if (codigo && nombre && !workers.has(codigo)) {
        workers.set(codigo, {
          id: codigo,
          codigo,
          nombre,
          categoria,
        })
      }
    }
  }

  return Array.from(workers.values())
}

/**
 * Read a file input as ArrayBuffer
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(new Uint8Array(e.target.result))
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Parse 'Partida de Control por Proyecto' XLS (hierarchical format).
 * Extracts leaf-level partidas (codes with 8+ digits).
 */
export function parsePartidasProyectoXLS(fileBuffer) {
  const wb = XLSX.read(fileBuffer, { type: "array" })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })

  const partidas = []
  for (const row of data) {
    // Try column A first, then column B for the code
    let code = String(row[0] || "").trim()
    let nombre = String(row[1] || "").trim()

    if (!code) {
      code = String(row[1] || "").trim()
      nombre = String(row[2] || "").trim()
    }

    // Only leaf-level partidas (8+ digit codes)
    const digits = code.replace(/[^0-9]/g, "")
    if (digits.length >= 8 && nombre && nombre !== "Descripción" && nombre !== "Abreviatura") {
      partidas.push({ id: code, nombre })
    }
  }
  return partidas
}

/**
 * Merge imported workers with existing ones.
 * - Updates data for workers with matching código
 * - Adds new workers not in the current list
 * - Keeps workers that are in existing but not in imported (unless replaceAll=true)
 */
export function mergeWorkers(existing, imported, replaceAll = false) {
  if (replaceAll) return imported

  const merged = new Map()

  // Add existing workers
  for (const w of existing) {
    merged.set(w.codigo || w.id, w)
  }

  // Update/add imported workers
  for (const w of imported) {
    merged.set(w.codigo || w.id, w)
  }

  return Array.from(merged.values())
}

