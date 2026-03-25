function normalizeCategoryValue(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim()
}

function mapCategoryAbbreviation(value) {
  const normalized = normalizeCategoryValue(value).toLowerCase()
  if (!normalized) return ""

  const known = {
    ope: "Operario",
    peo: "Peon",
    tec: "Tecnico",
    cap: "Capataz",
    ofi: "Oficial",
  }

  return known[normalized] || normalized.toUpperCase()
}

export function extractWorkerCategoryCode(worker = {}) {
  const explicitCode = normalizeCategoryValue(worker.categoriaCode)
  if (explicitCode) return explicitCode

  const categoria = normalizeCategoryValue(worker.categoria)
  const match = categoria.match(/^(\d+)\s+/)
  return match?.[1] || ""
}

export function extractWorkerCategoryName(worker = {}) {
  const explicitName = normalizeCategoryValue(worker.categoriaNombre)
  if (explicitName && !/^\d+$/.test(explicitName)) return explicitName

  const categoria = normalizeCategoryValue(worker.categoria)
  if (categoria) {
    const withoutCode = categoria.replace(/^\d+\s*/, "").trim()
    if (withoutCode && !/^\d+$/.test(withoutCode)) return withoutCode
  }

  const abbreviation = mapCategoryAbbreviation(worker.abrevCategoria)
  if (abbreviation) return abbreviation

  if (categoria && !/^\d+$/.test(categoria)) return categoria
  return ""
}

export function getWorkerCategoryLabel(worker = {}, options = {}) {
  const {
    includeCode = false,
    fallback = "Sin categoria",
  } = options

  const fullCategory = normalizeCategoryValue(worker.categoria)
  const code = extractWorkerCategoryCode(worker)
  const name = extractWorkerCategoryName(worker)

  if (includeCode && code && name) return `${code} ${name}`.trim()
  if (name) return name
  if (includeCode && code) return code
  if (fullCategory) return includeCode ? fullCategory : fullCategory.replace(/^\d+\s*/, "").trim() || fullCategory

  const abbreviation = mapCategoryAbbreviation(worker.abrevCategoria)
  if (abbreviation) return abbreviation

  return fallback
}

export function hasWorkerCategory(worker = {}) {
  return Boolean(getWorkerCategoryLabel(worker, { includeCode: true, fallback: "" }))
}

export function normalizeWorkerRecord(worker) {
  if (!worker || typeof worker !== "object") return worker

  const categoriaCode = extractWorkerCategoryCode(worker)
  const categoriaNombre = extractWorkerCategoryName(worker)
  const categoria = getWorkerCategoryLabel(worker, { includeCode: true, fallback: "" })
  const abrevCategoria = normalizeCategoryValue(worker.abrevCategoria)

  return {
    ...worker,
    categoriaCode: categoriaCode || worker.categoriaCode || "",
    categoriaNombre: categoriaNombre || worker.categoriaNombre || "",
    categoria: categoria || worker.categoria || "",
    abrevCategoria: abrevCategoria || worker.abrevCategoria || "",
  }
}

export function normalizeWorkersCollection(workers = []) {
  return Array.isArray(workers) ? workers.map((worker) => normalizeWorkerRecord(worker)) : []
}
