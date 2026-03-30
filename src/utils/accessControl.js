export const SUPER_ADMIN_EMAIL = "yleon@padovasac.com"

export const ROLE_OPTIONS = [
  { value: "super_admin", label: "Superadmin" },
  { value: "admin", label: "Admin" },
  { value: "user", label: "Usuario" },
  { value: "contratista", label: "Contratista" },
  { value: "vigilancia", label: "User Vigilancia" },
  { value: "prevencion", label: "Prevencion" },
]

export const DEFAULT_ACCESS_CHECKLIST = [
  { key: "dni", label: "DNI" },
  { key: "sctr", label: "SCTR" },
  { key: "induccion", label: "Induccion" },
  { key: "examenMedico", label: "Examen Medico" },
  { key: "fotocheck", label: "Fotocheck" },
  { key: "epp", label: "EPP" },
]

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase()
}

export function isSuperAdminEmail(email) {
  return normalizeEmail(email) === SUPER_ADMIN_EMAIL
}

export function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase()

  if (!normalized) return "user"

  const aliases = {
    superadmin: "super_admin",
    "super admin": "super_admin",
    super_admin: "super_admin",
    administrator: "admin",
    usuario: "user",
    contratista: "contratista",
    contractor: "contratista",
    subcontrata: "contratista",
    subcontratista: "contratista",
    vigilancia: "vigilancia",
    vigilante: "vigilancia",
    prevencion: "prevencion",
    prevención: "prevencion",
    soma: "prevencion",
  }

  return aliases[normalized] || normalized
}

export function getRoleLabel(role) {
  return ROLE_OPTIONS.find((option) => option.value === normalizeRole(role))?.label || "Usuario"
}

export function isAdminLikeRole(role) {
  const normalized = normalizeRole(role)
  return normalized === "admin" || normalized === "super_admin"
}

export function canAccessConfig(role) {
  return isAdminLikeRole(role)
}

export function canDeleteTareos(role) {
  return isAdminLikeRole(role)
}

export function canAccessOperationalModules(role) {
  const normalized = normalizeRole(role)
  return normalized === "user" || isAdminLikeRole(normalized)
}

export function canAccessContractorPortal(role) {
  const normalized = normalizeRole(role)
  return normalized === "contratista" || isAdminLikeRole(normalized)
}

export function canAccessVigilancia(role) {
  const normalized = normalizeRole(role)
  return normalized === "vigilancia" || isAdminLikeRole(normalized)
}

export function canAccessPrevencion(role) {
  const normalized = normalizeRole(role)
  return normalized === "prevencion" || isAdminLikeRole(normalized)
}

export function resolveEffectiveRole({ email, storedRole, profileRole }) {
  if (isSuperAdminEmail(email)) return "super_admin"

  const hasStoredRole = storedRole !== null && storedRole !== undefined && String(storedRole).trim() !== ""
  if (hasStoredRole) return normalizeRole(storedRole)

  const profile = normalizeRole(profileRole)
  if (profile) return profile

  return "user"
}

export function createChecklistState(checklist = {}) {
  return DEFAULT_ACCESS_CHECKLIST.reduce((acc, item) => {
    acc[item.key] = Boolean(checklist?.[item.key])
    return acc
  }, {})
}

export function normalizeManagedUser(entry = {}) {
  const email = normalizeEmail(entry.email)
  const role = isSuperAdminEmail(email)
    ? "super_admin"
    : normalizeRole(entry.role || entry.profileRole || "user")

  return {
    id: entry.id || "",
    email,
    role,
    displayName: String(entry.displayName || entry.nombre || "").trim(),
    lastSeenAt: entry.lastSeenAt || "",
    createdAt: entry.createdAt || "",
    updatedAt: entry.updatedAt || "",
    source: entry.source || "app_settings",
  }
}

export function normalizeManagedUsers(users = []) {
  const byKey = new Map()

  users.forEach((entry) => {
    const normalized = normalizeManagedUser(entry)
    const key = normalized.id || normalized.email
    if (!key) return

    const previous = byKey.get(key)
    byKey.set(key, {
      ...previous,
      ...normalized,
      id: normalized.id || previous?.id || "",
      email: normalized.email || previous?.email || "",
      role: normalized.role || previous?.role || "user",
      displayName: normalized.displayName || previous?.displayName || "",
      lastSeenAt: normalized.lastSeenAt || previous?.lastSeenAt || "",
      source: normalized.source || previous?.source || "app_settings",
    })
  })

  if (!Array.from(byKey.values()).some((entry) => isSuperAdminEmail(entry.email))) {
    const now = new Date().toISOString()
    byKey.set(SUPER_ADMIN_EMAIL, normalizeManagedUser({
      email: SUPER_ADMIN_EMAIL,
      role: "super_admin",
      source: "reserved",
      createdAt: now,
      updatedAt: now,
    }))
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.role !== b.role) return a.role.localeCompare(b.role)
    return a.email.localeCompare(b.email)
  })
}

export function normalizeAccessEntry(entry = {}) {
  const company = String(entry.empresa || entry.company || "").trim()
  const checkInTime = String(entry.checkInTime || "").trim()
  const checkOutTime = String(entry.checkOutTime || "").trim()

  return {
    id: entry.id || `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    workerId: String(entry.workerId || "").trim(),
    workerNombre: String(entry.workerNombre || "").trim(),
    categoria: String(entry.categoria || "").trim(),
    workerSource: String(entry.workerSource || entry.source || "").trim(),
    companyId: String(entry.companyId || "").trim(),
    empresa: company || "Sin empresa",
    dni: String(entry.dni || "").trim(),
    qrToken: String(entry.qrToken || "").trim(),
    date: String(entry.date || "").trim(),
    checkInTime,
    checkOutTime,
    status: checkOutTime ? "completed" : "inside",
    notes: String(entry.notes || "").trim(),
    checklist: createChecklistState(entry.checklist),
    createdBy: String(entry.createdBy || "").trim(),
    updatedBy: String(entry.updatedBy || "").trim(),
    createdAt: entry.createdAt || "",
    updatedAt: entry.updatedAt || "",
  }
}

export function normalizeAccessEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeAccessEntry(entry))
    .sort((a, b) => {
      if (a.date !== b.date) return String(b.date).localeCompare(String(a.date))
      return String(b.checkInTime || "").localeCompare(String(a.checkInTime || ""))
    })
}
