import * as XLSX from "xlsx"
import QRCode from "qrcode"
import {
  DEFAULT_ACCESS_CHECKLIST,
  createChecklistState,
  normalizeRole,
} from "./accessControl"

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim()
}

function normalizeCompact(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[._/\\-]+/g, " ")
    .replace(/\s+/g, "")
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeBoolean(value) {
  const normalized = normalizeCompact(value)
  if (!normalized) return false
  return ["1", "si", "sí", "true", "ok", "apto", "cumple", "vigente"].includes(normalized)
}

function createId(prefix = "ctr") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function buildWorkerId(companyId, dni) {
  const normalizedCompanyId = normalizeText(companyId) || "sin-empresa"
  const normalizedDni = normalizeText(dni).replace(/\s+/g, "") || createId("tmp")
  return `ext-${normalizedCompanyId}-${normalizedDni}`
}

function buildQrToken(existingToken = "") {
  return normalizeText(existingToken) || `QR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

export function buildContractorQrValue(worker = {}) {
  return [
    "PADOVA",
    "ACCESS",
    normalizeText(worker.companyId),
    normalizeText(worker.id),
    normalizeText(worker.dni),
    buildQrToken(worker.qrToken),
  ].join("|")
}

export async function buildContractorQrDataUrl(worker = {}) {
  return QRCode.toDataURL(buildContractorQrValue(worker), {
    width: 280,
    margin: 1,
    errorCorrectionLevel: "M",
    color: {
      dark: "#0f172a",
      light: "#f8fafc",
    },
  })
}

function normalizePortalEmails(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[;,]/)
  return Array.from(new Set(source.map((item) => normalizeEmail(item)).filter(Boolean)))
}

function normalizeStatus(value) {
  const normalized = normalizeCompact(value)
  if (["apto", "habilitado", "activo", "ok"].includes(normalized)) return "apto"
  if (["bloqueado", "observado", "rechazado", "inactivo"].includes(normalized)) return "bloqueado"
  return "pendiente"
}

function normalizeDocumentEntry(entry = {}) {
  if (!entry || typeof entry !== "object") return null
  const name = normalizeText(entry.name || entry.fileName || entry.nombre)
  if (!name) return null

  return {
    name,
    type: normalizeText(entry.type || entry.mimeType),
    size: Number(entry.size || entry.bytes || 0) || 0,
    uploadedAt: entry.uploadedAt || entry.fechaCarga || new Date().toISOString(),
    uploadedBy: normalizeText(entry.uploadedBy || entry.subidoPor),
    sourceRole: normalizeText(entry.sourceRole || entry.rolOrigen || "contratista"),
  }
}

function normalizeContractorDocuments(documents = {}) {
  return DEFAULT_ACCESS_CHECKLIST.reduce((acc, item) => {
    const normalized = normalizeDocumentEntry(documents?.[item.key])
    if (normalized) acc[item.key] = normalized
    return acc
  }, {})
}

function formatFullName(apellidos, nombres) {
  const cleanApellidos = normalizeText(apellidos)
  const cleanNombres = normalizeText(nombres)
  return [cleanApellidos, cleanNombres].filter(Boolean).join(", ")
}

export function normalizeContractorCompany(company = {}) {
  const id = normalizeText(company.id) || createId("emp")
  return {
    id,
    nombre: normalizeText(company.nombre || company.empresa || company.companyName),
    ruc: normalizeText(company.ruc),
    contacto: normalizeText(company.contacto || company.supervisor),
    telefono: normalizeText(company.telefono),
    portalEmails: normalizePortalEmails(company.portalEmails || company.emailPortal || company.emails),
    estado: normalizeStatus(company.estado || "apto"),
    createdAt: company.createdAt || new Date().toISOString(),
    updatedAt: company.updatedAt || new Date().toISOString(),
  }
}

export function normalizeContractorCompanies(companies = []) {
  const byId = new Map()
  ;(Array.isArray(companies) ? companies : []).forEach((company) => {
    const normalized = normalizeContractorCompany(company)
    if (!normalized.nombre) return

    const previous = byId.get(normalized.id)
    byId.set(normalized.id, {
      ...previous,
      ...normalized,
      portalEmails: normalizePortalEmails([
        ...(previous?.portalEmails || []),
        ...(normalized.portalEmails || []),
      ]),
    })
  })

  return Array.from(byId.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
}

export function normalizeContractorWorker(worker = {}, companyLookup = new Map()) {
  const companyId = normalizeText(worker.companyId || worker.empresaId)
  const company = companyLookup.get(companyId)
  const dni = normalizeText(worker.dni).replace(/\s+/g, "")
  const apellidos = normalizeText(worker.apellidos)
  const nombres = normalizeText(worker.nombres)
  const nombreCompleto = normalizeText(worker.nombreCompleto || worker.workerNombre || formatFullName(apellidos, nombres))
  const checklist = createChecklistState({
    ...worker.documentos,
    ...worker.checklist,
  })
  const id = normalizeText(worker.id) || buildWorkerId(companyId, dni)
  const qrToken = buildQrToken(worker.qrToken)

  const normalized = {
    id,
    companyId,
    empresa: normalizeText(worker.empresa || company?.nombre || "Sin empresa"),
    dni,
    apellidos,
    nombres,
    nombreCompleto,
    categoria: normalizeText(worker.categoria),
    cargo: normalizeText(worker.cargo || worker.ocupacion),
    supervisor: normalizeText(worker.supervisor),
    telefono: normalizeText(worker.telefono),
    fechaAutorizada: normalizeText(worker.fechaAutorizada || worker.fecha || worker.fechaIngresoObra),
    vigenciaDesde: normalizeText(worker.vigenciaDesde),
    vigenciaHasta: normalizeText(worker.vigenciaHasta),
    estado: normalizeStatus(worker.estado),
    documentos: checklist,
    contractorDocuments: normalizeContractorDocuments(worker.contractorDocuments || worker.documentosContratista),
    qrToken,
    createdBy: normalizeText(worker.createdBy),
    updatedBy: normalizeText(worker.updatedBy),
    createdAt: worker.createdAt || new Date().toISOString(),
    updatedAt: worker.updatedAt || new Date().toISOString(),
  }

  return {
    ...normalized,
    qrValue: buildContractorQrValue({ ...normalized, qrToken }),
  }
}

export function normalizeContractorWorkers(workers = [], companies = []) {
  const companyLookup = new Map(normalizeContractorCompanies(companies).map((company) => [company.id, company]))
  const byId = new Map()

  ;(Array.isArray(workers) ? workers : []).forEach((worker) => {
    const normalized = normalizeContractorWorker(worker, companyLookup)
    if (!normalized.companyId || !normalized.nombreCompleto) return

    const previous = byId.get(normalized.id)
    byId.set(normalized.id, {
      ...previous,
      ...normalized,
      documentos: createChecklistState({
        ...(previous?.documentos || {}),
        ...(normalized.documentos || {}),
      }),
      contractorDocuments: {
        ...(previous?.contractorDocuments || {}),
        ...(normalized.contractorDocuments || {}),
      },
    })
  })

  return Array.from(byId.values()).sort((a, b) => {
    if (a.empresa !== b.empresa) return a.empresa.localeCompare(b.empresa)
    return a.nombreCompleto.localeCompare(b.nombreCompleto)
  })
}

export function getContractorPortalCompanies(companies = [], email = "", role = "user") {
  const normalizedRole = normalizeRole(role)
  const normalizedEmail = normalizeEmail(email)
  const allCompanies = normalizeContractorCompanies(companies)

  if (normalizedRole === "admin" || normalizedRole === "super_admin") return allCompanies
  if (normalizedRole !== "contratista") return []

  return allCompanies.filter((company) => company.portalEmails.includes(normalizedEmail))
}

export function mergeContractorWorkers(existingWorkers = [], incomingWorkers = [], companies = []) {
  const existing = normalizeContractorWorkers(existingWorkers, companies)
  const incoming = normalizeContractorWorkers(incomingWorkers, companies)
  const byId = new Map(existing.map((worker) => [worker.id, worker]))

  incoming.forEach((worker) => {
    const previous = byId.get(worker.id)
    byId.set(worker.id, normalizeContractorWorker({
      ...previous,
      ...worker,
      qrToken: previous?.qrToken || worker.qrToken,
      createdAt: previous?.createdAt || worker.createdAt,
      updatedAt: new Date().toISOString(),
      documentos: {
        ...(previous?.documentos || {}),
        ...(worker.documentos || {}),
      },
      contractorDocuments: {
        ...(previous?.contractorDocuments || {}),
        ...(worker.contractorDocuments || {}),
      },
    }, new Map(normalizeContractorCompanies(companies).map((company) => [company.id, company]))))
  })

  return Array.from(byId.values()).sort((a, b) => {
    if (a.empresa !== b.empresa) return a.empresa.localeCompare(b.empresa)
    return a.nombreCompleto.localeCompare(b.nombreCompleto)
  })
}

function downloadWorkbook(workbook, filename) {
  const out = XLSX.write(workbook, { bookType: "xlsx", type: "array" })
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadContractorPadronTemplate(selectedCompany = null) {
  const workbook = XLSX.utils.book_new()
  const header = [
    "EMPRESA",
    "DNI",
    "APELLIDOS",
    "NOMBRES",
    "CATEGORIA",
    "CARGO",
    "SUPERVISOR",
    "TELEFONO",
    "FECHA AUTORIZADA",
    "VIGENCIA DESDE",
    "VIGENCIA HASTA",
    "DNI OK",
    "SCTR",
    "INDUCCION",
    "EXAMEN MEDICO",
    "FOTOCHECK",
    "EPP",
    "ESTADO",
  ]
  const example = [
    selectedCompany?.nombre || "SUBCONTRATA TOPOGRAFIA SAC",
    "76451234",
    "PEREZ QUISPE",
    "JUAN CARLOS",
    "Operario",
    "Topografo",
    "Ing. Ramirez",
    "999888777",
    "2026-03-27",
    "2026-03-27",
    "2026-04-03",
    "SI",
    "SI",
    "SI",
    "SI",
    "SI",
    "SI",
    "Apto",
  ]
  const sheet = XLSX.utils.aoa_to_sheet([header, example])
  sheet["!cols"] = header.map((title) => ({ wch: Math.max(14, title.length + 2) }))
  XLSX.utils.book_append_sheet(workbook, sheet, "Padron Contratista")

  const checklistData = [
    ["CAMPO", "DESCRIPCION"],
    ...DEFAULT_ACCESS_CHECKLIST.map((item) => [item.label, "Marcar SI cuando el documento o requisito fue declarado por la subcontrata."]),
  ]
  const checklistSheet = XLSX.utils.aoa_to_sheet(checklistData)
  checklistSheet["!cols"] = [{ wch: 24 }, { wch: 72 }]
  XLSX.utils.book_append_sheet(workbook, checklistSheet, "Checklist")

  downloadWorkbook(workbook, "plantilla_padron_contratista.xlsx")
}

function findColumnIndex(headerRow, aliases) {
  const normalizedAliases = aliases.map(normalizeCompact)

  const exactIndex = headerRow.findIndex((cell) => normalizedAliases.includes(normalizeCompact(cell)))
  if (exactIndex >= 0) return exactIndex

  return headerRow.findIndex((cell) => {
    const normalizedCell = normalizeCompact(cell)
    return normalizedAliases.some((alias) => normalizedCell.includes(alias))
  })
}

function findHeaderRow(rows, fields, maxRows = 15) {
  let bestIndex = -1
  let bestScore = 0

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, maxRows); rowIndex += 1) {
    const row = rows[rowIndex]
    const score = fields.reduce((total, field) => total + (findColumnIndex(row, field.aliases) >= 0 ? 1 : 0), 0)
    if (score > bestScore) {
      bestIndex = rowIndex
      bestScore = score
    }
  }

  return bestScore >= 3 ? bestIndex : -1
}

export function parseContractorPadronXLSX(buffer, companies = [], selectedCompany = null, currentUserEmail = "") {
  const workbook = XLSX.read(buffer, { type: "array" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })

  const fields = [
    { key: "empresa", required: false, aliases: ["empresa", "contratista", "subcontrata"] },
    { key: "dni", required: true, aliases: ["dni", "documento", "documento identidad", "nro dni"] },
    { key: "apellidos", required: true, aliases: ["apellidos", "apellido paterno", "apellidos y nombres"] },
    { key: "nombres", required: true, aliases: ["nombres", "nombre"] },
    { key: "categoria", aliases: ["categoria", "categoria laboral"] },
    { key: "cargo", aliases: ["cargo", "ocupacion"] },
    { key: "supervisor", aliases: ["supervisor", "responsable"] },
    { key: "telefono", aliases: ["telefono", "celular"] },
    { key: "fechaAutorizada", aliases: ["fecha autorizada", "fecha ingreso", "fecha"] },
    { key: "vigenciaDesde", aliases: ["vigencia desde", "desde"] },
    { key: "vigenciaHasta", aliases: ["vigencia hasta", "hasta"] },
    { key: "dniOk", aliases: ["dni ok", "dni"] },
    { key: "sctr", aliases: ["sctr"] },
    { key: "induccion", aliases: ["induccion", "inducción"] },
    { key: "examenMedico", aliases: ["examen medico", "examen médico"] },
    { key: "fotocheck", aliases: ["fotocheck"] },
    { key: "epp", aliases: ["epp"] },
    { key: "estado", aliases: ["estado", "estatus"] },
  ]

  const headerRowIndex = findHeaderRow(rows, fields)
  if (headerRowIndex < 0) {
    throw new Error("El padrón del contratista no es válido. Debe incluir al menos DNI, Apellidos y Nombres.")
  }

  const headerRow = rows[headerRowIndex]
  const columnMap = Object.fromEntries(fields.map((field) => [field.key, findColumnIndex(headerRow, field.aliases)]))
  const companyLookup = new Map(normalizeContractorCompanies(companies).map((company) => [company.nombre.toLowerCase(), company]))
  const fallbackCompany = selectedCompany ? normalizeContractorCompany(selectedCompany) : null

  const workers = rows
    .slice(headerRowIndex + 1)
    .map((row) => {
      const getValue = (key) => {
        const index = columnMap[key]
        return typeof index === "number" && index >= 0 ? normalizeText(row[index]) : ""
      }

      const empresa = getValue("empresa") || fallbackCompany?.nombre || ""
      const company = fallbackCompany && (!empresa || fallbackCompany.nombre.toLowerCase() === empresa.toLowerCase())
        ? fallbackCompany
        : companyLookup.get(empresa.toLowerCase())

      const dni = getValue("dni").replace(/\s+/g, "")
      const apellidos = getValue("apellidos")
      const nombres = getValue("nombres")

      if (!company?.id || !dni || !apellidos || !nombres) return null

      return normalizeContractorWorker({
        id: buildWorkerId(company.id, dni),
        companyId: company.id,
        empresa: company.nombre,
        dni,
        apellidos,
        nombres,
        categoria: getValue("categoria"),
        cargo: getValue("cargo"),
        supervisor: getValue("supervisor"),
        telefono: getValue("telefono"),
        fechaAutorizada: getValue("fechaAutorizada"),
        vigenciaDesde: getValue("vigenciaDesde"),
        vigenciaHasta: getValue("vigenciaHasta"),
        estado: getValue("estado") || "pendiente",
        documentos: {
          dni: normalizeBoolean(getValue("dniOk")) || Boolean(dni),
          sctr: normalizeBoolean(getValue("sctr")),
          induccion: normalizeBoolean(getValue("induccion")),
          examenMedico: normalizeBoolean(getValue("examenMedico")),
          fotocheck: normalizeBoolean(getValue("fotocheck")),
          epp: normalizeBoolean(getValue("epp")),
        },
        createdBy: currentUserEmail,
        updatedBy: currentUserEmail,
      }, new Map([[company.id, company]]))
    })
    .filter(Boolean)

  if (workers.length === 0) {
    throw new Error("No se encontraron filas válidas para importar en el padrón del contratista.")
  }

  return workers
}
