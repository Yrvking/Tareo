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

function getParsedRows(rows, fields, invalidFileMessage) {
  const headerRowIndex = findHeaderRowIndex(rows, fields)
  if (headerRowIndex < 0) {
    throw new Error(invalidFileMessage)
  }

  const columnMap = createColumnMap(rows[headerRowIndex], fields)
  const missingRequired = getMissingRequiredFields(fields, columnMap)
  if (missingRequired.length > 0) {
    throw new Error(`Faltan encabezados obligatorios: ${missingRequired.join(", ")}.`)
  }

  return {
    rows: rows.slice(headerRowIndex + 1),
    columnMap,
  }
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

  const { rows: dataRows, columnMap } = getParsedRows(
    rows,
    fields,
    "Archivo Personal S10 no válido. Debe incluir al menos los encabezados Código y Nombre."
  )

  const workers = dataRows
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
    const { rows: dataRows, columnMap } = getParsedRows(
      data,
      fields,
      "Hoja de partidas no válida."
    )

    const partidas = dataRows
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
    const { rows: dataRows, columnMap } = getParsedRows(
      data,
      fields,
      "Hoja TipoHora no válida."
    )

    const tipos = dataRows
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
  const rows = getSheetRows(sheet)
  const fields = [
    { key: "nombre", label: "Apellidos y Nombres", required: true, aliases: ["apellidos y nombres", "nombre", "trabajador"] },
    { key: "proyecto", label: "Proyecto", aliases: ["proyecto"] },
    { key: "anio", label: "Año", aliases: ["ano", "año"] },
    { key: "periodoSemanal", label: "Periodo Semanal", aliases: ["periodo semanal", "periodosemanal"] },
    { key: "partidaControl", label: "Partida de Control", required: true, aliases: ["partida de control", "partidacontrol"] },
    { key: "parcial", label: "Parcial", aliases: ["parcial"] },
    { key: "tipoNomina", label: "Tipo de Nómina", aliases: ["tipo de nomina", "tiponomina"] },
    { key: "codigo", label: "Código", required: true, aliases: ["codigo", "cod"] },
    { key: "fecha", label: "Fecha", required: true, aliases: ["fecha"] },
    { key: "horasLaboradas", label: "Horas laboradas", required: true, aliases: ["horas laboradas", "horaslaboradas"] },
    { key: "horasDescanso", label: "Horas descanso", aliases: ["horas descanso", "horasdescanso"] },
    { key: "codigoPartida", label: "Código Partida de Control", required: true, aliases: ["codigo partida de control", "codigopartidadecontrol"] },
    { key: "tipoHora", label: "Tipo Hora", required: true, aliases: ["tipo hora", "tipohora"] },
    { key: "costoHHNormal", label: "Costo HH Normal", required: true, aliases: ["costo hh normal", "costohhnormal"] },
    { key: "costoHHExtra60", label: "Costo HH Extra60", aliases: ["costo hh extra60", "costohhextra60", "costo hh extra 60"] },
    { key: "costoHHExtra100", label: "Costo HH Extra100", aliases: ["costo hh extra100", "costohhextra100", "costo hh extra 100"] },
  ]

  const { rows: dataRows, columnMap } = getParsedRows(
    rows,
    fields,
    "Archivo de consolidado de costos no válido. Debe incluir al menos Código y Apellidos y Nombres."
  )

  const parsed = dataRows.map((row) => {
    const fecha = getRowValue(row, columnMap, "fecha")
    return {
      nombre: getRowValue(row, columnMap, "nombre"),
      proyecto: getRowValue(row, columnMap, "proyecto"),
      anio: getRowValue(row, columnMap, "anio"),
      periodoSemanal: getRowValue(row, columnMap, "periodoSemanal"),
      partidaControl: getRowValue(row, columnMap, "partidaControl"),
      parcial: parseFloat(getRowValue(row, columnMap, "parcial") || "0") || 0,
      tipoNomina: getRowValue(row, columnMap, "tipoNomina"),
      codigo: getRowValue(row, columnMap, "codigo"),
      fecha,
      horasLaboradas: parseFloat(getRowValue(row, columnMap, "horasLaboradas") || "0") || 0,
      horasDescanso: parseFloat(getRowValue(row, columnMap, "horasDescanso") || "0") || 0,
      codigoPartida: getRowValue(row, columnMap, "codigoPartida"),
      tipoHora: getRowValue(row, columnMap, "tipoHora"),
      costoHHNormal: parseFloat(getRowValue(row, columnMap, "costoHHNormal") || "0") || 0,
      costoHHExtra60: parseFloat(getRowValue(row, columnMap, "costoHHExtra60") || "0") || 0,
      costoHHExtra100: parseFloat(getRowValue(row, columnMap, "costoHHExtra100") || "0") || 0,
    }
  }).filter(r => r.nombre && r.codigo)

  if (parsed.length === 0) {
    throw new Error("El consolidado de costos no contiene filas válidas con Código y Apellidos y Nombres.")
  }

  return parsed
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

export function mergeWorkerCosts(existing, importedRows = []) {
  const costMap = new Map()

  for (const row of importedRows) {
    const key = String(row.codigo || "").trim()
    if (!key) continue
    const detectedCost = row.costoHHNormal || row.costoHHExtra60 || row.costoHHExtra100 || 0
    if (!detectedCost) continue
    if (!costMap.has(key)) {
      costMap.set(key, {
        costoHora: detectedCost,
        nombre: row.nombre,
      })
    }
  }

  return existing.map((worker) => {
    const workerKey = String(worker.codigo || worker.id || "").trim()
    const imported = costMap.get(workerKey)
    if (!imported) return worker
    return {
      ...worker,
      costoHora: imported.costoHora,
    }
  })
}
