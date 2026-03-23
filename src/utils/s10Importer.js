import * as XLSX from "xlsx"

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[._/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeCompact(value) {
  return normalizeText(value).replace(/\s+/g, "")
}

function getSheetRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })
}

function findColumnIndex(headerRow, aliases) {
  const normalizedAliases = aliases.map(normalizeCompact)
  return headerRow.findIndex((cell) => {
    const normalizedCell = normalizeCompact(cell)
    return normalizedAliases.some((alias) => normalizedCell.includes(alias))
  })
}

function findHeaderRowIndex(rows, fields, maxRows = 20) {
  let bestRowIndex = -1
  let bestScore = 0

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, maxRows); rowIndex++) {
    const row = rows[rowIndex]
    const score = fields.reduce((total, field) => {
      return total + (findColumnIndex(row, field.aliases) >= 0 ? 1 : 0)
    }, 0)

    if (score > bestScore) {
      bestScore = score
      bestRowIndex = rowIndex
    }
  }

  return bestScore >= Math.min(2, fields.length) ? bestRowIndex : -1
}

function createColumnMap(headerRow, fields) {
  return Object.fromEntries(
    fields.map((field) => [field.key, findColumnIndex(headerRow, field.aliases)])
  )
}

function getMissingRequiredFields(fields, columnMap) {
  return fields
    .filter((field) => field.required && (columnMap[field.key] ?? -1) < 0)
    .map((field) => field.label)
}

function getRowValue(row, columnMap, key) {
  const index = columnMap[key]
  if (typeof index !== "number" || index < 0) return ""
  return String(row[index] ?? "").trim()
}

function isLikelyHeaderValue(value) {
  const normalized = normalizeCompact(value)
  return [
    "codigo",
    "descripcion",
    "abreviatura",
    "nombre",
    "partida",
    "partidadecontrol",
    "tipohora",
  ].includes(normalized)
}

function findTextNearCode(row, codeIndex) {
  const cells = row.map((cell) => String(cell ?? "").trim())
  const candidates = []

  for (let index = 0; index < cells.length; index++) {
    if (index === codeIndex) continue
    const value = cells[index]
    if (!value || isLikelyHeaderValue(value)) continue
    const digits = value.replace(/[^0-9]/g, "")
    if (digits.length >= 8) continue
    candidates.push({
      value,
      distance: Math.abs(index - codeIndex),
      index,
    })
  }

  candidates.sort((a, b) => a.distance - b.distance || a.index - b.index)
  return candidates[0]?.value || ""
}

/**
 * Parse the personnel XLSX file from S10.
 * Extracts key fields: código, nombre, categoría, dni, costoHora, fechaIngreso, ocupación
 */
export function parsePersonalXLSX(fileBuffer) {
  const wb = XLSX.read(fileBuffer, { type: "array" })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = getSheetRows(sheet)
  const fields = [
    { key: "codigo", label: "Código", required: true, aliases: ["codigo", "codigopersonal", "cod"] },
    { key: "nombre", label: "Nombre", required: true, aliases: ["nombre", "apellidos y nombres", "trabajador"] },
    { key: "categoriaCode", label: "Código categoría", aliases: ["codigo categoria", "cod categoria", "codigocategoria"] },
    { key: "categoria", label: "Categoría", aliases: ["categoria", "categoria laboral"] },
    { key: "abrevCategoria", label: "Abreviatura Categoría", aliases: ["abreviatura categoria", "abreviacion categoria", "abrev categoria"] },
    { key: "dni", label: "DNI", aliases: ["dni", "documento identidad", "nro dni", "numero dni"] },
    { key: "costoHora", label: "Costo hora promedio", aliases: ["costo hora promedio", "costo hh promedio", "costo hora", "costohorapromedio"] },
    { key: "fechaIngreso", label: "Fecha Ingreso", aliases: ["fecha ingreso", "fecha de ingreso", "f ingreso"] },
    { key: "ocupacion", label: "Ocupación", aliases: ["ocupacion", "cargo"] },
    { key: "activo", label: "Activo Proyecto", aliases: ["activo proyecto", "activo en proyecto", "proyecto activo"] },
  ]

  const headerRowIndex = findHeaderRowIndex(rows, fields)
  if (headerRowIndex < 0) {
    throw new Error("Archivo Personal S10 no válido. Debe incluir al menos los encabezados Código y Nombre.")
  }

  const columnMap = createColumnMap(rows[headerRowIndex], fields)
  const missingRequired = getMissingRequiredFields(fields, columnMap)
  if (missingRequired.length > 0) {
    throw new Error(`Archivo Personal S10 incompleto. Faltan encabezados obligatorios: ${missingRequired.join(", ")}.`)
  }

  const workers = rows
    .slice(headerRowIndex + 1)
    .map((row) => {
      const codigo = getRowValue(row, columnMap, "codigo")
      const nombre = getRowValue(row, columnMap, "nombre")
      const costoHora = parseFloat(getRowValue(row, columnMap, "costoHora") || "0") || 0

      return {
        id: codigo,
        codigo,
        nombre,
        categoriaCode: getRowValue(row, columnMap, "categoriaCode"),
        categoria: getRowValue(row, columnMap, "categoria"),
        abrevCategoria: getRowValue(row, columnMap, "abrevCategoria"),
        dni: getRowValue(row, columnMap, "dni"),
        costoHora,
        fechaIngreso: getRowValue(row, columnMap, "fechaIngreso"),
        ocupacion: getRowValue(row, columnMap, "ocupacion"),
        activo: getRowValue(row, columnMap, "activo"),
      }
    })
    .filter((worker) => worker.codigo && worker.nombre)

  if (workers.length === 0) {
    throw new Error("El archivo Personal S10 no contiene filas válidas con Código y Nombre.")
  }

  return workers
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
  if (!sheetName) {
    throw new Error("No se encontró una hoja de partidas en el archivo Modelo TMO.")
  }

  const sheet = wb.Sheets[sheetName]
  const data = getSheetRows(sheet)
  const fields = [
    { key: "codigo", label: "Código", required: true, aliases: ["codigo", "codigo partida", "codigo partida control", "partida control"] },
    { key: "nombre", label: "Descripción o Nombre", required: true, aliases: ["descripcion", "nombre", "partida", "descripcion partida"] },
  ]
  const headerRowIndex = findHeaderRowIndex(data, fields)

  if (headerRowIndex >= 0) {
    const columnMap = createColumnMap(data[headerRowIndex], fields)
    const missingRequired = getMissingRequiredFields(fields, columnMap)
    if (missingRequired.length > 0) {
      throw new Error(`Hoja de partidas incompleta. Faltan encabezados obligatorios: ${missingRequired.join(", ")}.`)
    }

    const partidas = data
      .slice(headerRowIndex + 1)
      .map((row) => {
        const id = getRowValue(row, columnMap, "codigo")
        const nombre = getRowValue(row, columnMap, "nombre")
        if (!id || !nombre || isLikelyHeaderValue(id) || isLikelyHeaderValue(nombre)) return null
        return { id, nombre }
      })
      .filter(Boolean)

    if (partidas.length === 0) {
      throw new Error("La hoja de partidas no contiene filas válidas con Código y Descripción.")
    }

    return partidas
  }

  const partidas = data
    .map((row) => {
      const id = String(row[1] || "").trim()
      const nombre = String(row[2] || "").trim()
      if (!id || !nombre || isLikelyHeaderValue(id) || isLikelyHeaderValue(nombre)) return null
      return { id, nombre }
    })
    .filter(Boolean)

  if (partidas.length === 0) {
    throw new Error("No se encontraron partidas válidas. Verifica que el archivo tenga Código y Descripción o Nombre.")
  }

  return partidas
}

/**
 * Parse 'TipoHora' sheet from an S10 model XLS file.
 */
export function parseTipoHoraFromXLS(fileBuffer) {
  const wb = XLSX.read(fileBuffer, { type: "array" })

  const sheetName = wb.SheetNames.find(
    (n) => n.toLowerCase().includes("tipohora") || n.toLowerCase().includes("tipo hora")
  )
  if (!sheetName) {
    throw new Error("No se encontró la hoja TipoHora en el archivo Modelo TMO.")
  }

  const sheet = wb.Sheets[sheetName]
  const data = getSheetRows(sheet)
  const fields = [
    { key: "codigo", label: "Código", aliases: ["codigo", "cod", "codigo tipo hora"] },
    { key: "descripcion", label: "Descripción", required: true, aliases: ["descripcion", "tipo hora", "nombre"] },
    { key: "abreviatura", label: "Abreviatura", aliases: ["abreviatura", "abrev", "sigla"] },
  ]
  const headerRowIndex = findHeaderRowIndex(data, fields)

  if (headerRowIndex >= 0) {
    const columnMap = createColumnMap(data[headerRowIndex], fields)
    const missingRequired = getMissingRequiredFields(fields, columnMap)
    if (missingRequired.length > 0) {
      throw new Error(`Hoja TipoHora incompleta. Faltan encabezados obligatorios: ${missingRequired.join(", ")}.`)
    }

    const tipos = data
      .slice(headerRowIndex + 1)
      .map((row) => {
        const codigo = getRowValue(row, columnMap, "codigo")
        const descripcion = getRowValue(row, columnMap, "descripcion")
        const abreviatura = getRowValue(row, columnMap, "abreviatura")
        if (!descripcion || isLikelyHeaderValue(descripcion)) return null
        return { codigo, descripcion, abreviatura }
      })
      .filter(Boolean)

    if (tipos.length === 0) {
      throw new Error("La hoja TipoHora no contiene filas válidas con al menos la Descripción.")
    }

    return tipos
  }

  const tipos = data
    .map((row) => {
      const codigo = String(row[1] || "").trim()
      const descripcion = String(row[2] || "").trim()
      const abreviatura = String(row[3] || "").trim()
      if (!descripcion || isLikelyHeaderValue(descripcion)) return null
      return { codigo, descripcion, abreviatura }
    })
    .filter(Boolean)

  if (tipos.length === 0) {
    throw new Error("No se encontraron tipos de hora válidos. Verifica que exista la columna Descripción.")
  }

  return tipos
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
  const data = getSheetRows(sheet)

  const partidas = []
  for (const row of data) {
    const cells = row.map((cell) => String(cell ?? "").trim())
    const codeIndex = cells.findIndex((cell) => cell.replace(/[^0-9]/g, "").length >= 8)
    if (codeIndex < 0) continue

    const code = cells[codeIndex]
    const nombre = findTextNearCode(cells, codeIndex)
    if (nombre) {
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
