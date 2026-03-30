import { useEffect, useMemo, useState } from "react"
import { PlusIcon } from "./Icons"
import {
  fetchManagedUsers,
  saveManagedUserRole,
} from "../utils/supabaseClient"
import {
  canManageUsers,
  ROLE_OPTIONS,
  getRoleLabel,
  isSuperAdminEmail,
  normalizeRole,
} from "../utils/accessControl"
import { useAuth } from "../contexts/AuthContext"

const NON_SUPERADMIN_ROLE_OPTIONS = ROLE_OPTIONS.filter((option) => option.value !== "super_admin")

function formatSeenAt(value) {
  if (!value) return "Sin ingreso"

  try {
    return new Date(value).toLocaleString("es-PE", {
      dateStyle: "short",
      timeStyle: "short",
    })
  } catch {
    return value
  }
}

export default function UserManagementPanel() {
  const { profile } = useAuth()
  const currentRole = normalizeRole(profile?.role)
  const canEditUsers = canManageUsers(currentRole)
  const [managedUsers, setManagedUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [newEmail, setNewEmail] = useState("")
  const [newRole, setNewRole] = useState("user")

  const visibleUsers = useMemo(() => managedUsers.slice().sort((a, b) => a.email.localeCompare(b.email)), [managedUsers])

  useEffect(() => {
    let mounted = true

    async function loadUsers() {
      setLoading(true)
      const users = await fetchManagedUsers()
      if (mounted) {
        setManagedUsers(users)
        setLoading(false)
      }
    }

    loadUsers()
    return () => {
      mounted = false
    }
  }, [])

  const showFeedback = (type, message) => {
    setFeedback({ type, message })
    window.clearTimeout(showFeedback.timeoutId)
    showFeedback.timeoutId = window.setTimeout(() => setFeedback(null), 4000)
  }

  const refreshUsers = async () => {
    const users = await fetchManagedUsers()
    setManagedUsers(users)
  }

  const handleRoleChange = async (entry, nextRole) => {
    if (!entry?.email || !canEditUsers) return
    setSaving(true)
    await saveManagedUserRole(entry, nextRole)
    await refreshUsers()
    setSaving(false)
    showFeedback("success", `Rol actualizado para ${entry.email}.`)
  }

  const handleCreateUser = async () => {
    if (!canEditUsers) {
      showFeedback("error", "Solo el superadmin puede agregar usuarios o cambiar roles.")
      return
    }

    const email = String(newEmail || "").trim().toLowerCase()
    if (!email) {
      showFeedback("error", "Ingresa un correo para crear o preparar el acceso.")
      return
    }

    if (!email.includes("@")) {
      showFeedback("error", "El correo no parece válido.")
      return
    }

    setSaving(true)
    const targetRole = isSuperAdminEmail(email) ? "super_admin" : newRole
    await saveManagedUserRole({ email, source: "app_settings" }, targetRole)
    await refreshUsers()
    setNewEmail("")
    setNewRole("user")
    setSaving(false)
    showFeedback("success", `Usuario ${email} preparado con rol ${getRoleLabel(targetRole)}.`)
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="label" style={{ marginBottom: 12 }}>USUARIOS DEL SISTEMA</div>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 0, marginBottom: 14 }}>
        El superadmin reservado es <strong style={{ color: "var(--text-main)" }}>yleon@padovasac.com</strong>. Solo ese rol puede agregar usuarios o cambiar permisos.
      </p>

      {feedback && (
        <div className={`feedback-banner ${feedback.type}`} style={{ marginBottom: 14 }}>
          {feedback.message}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.5fr) minmax(170px, 0.8fr) auto", gap: 10, marginBottom: 14 }}>
        <input
          type="email"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          placeholder="nuevo.usuario@empresa.com"
          className="input-field"
          disabled={!canEditUsers || saving}
        />
        <select
          value={isSuperAdminEmail(newEmail) ? "super_admin" : newRole}
          onChange={(event) => setNewRole(event.target.value)}
          className="input-field"
          disabled={!canEditUsers || isSuperAdminEmail(newEmail) || saving}
        >
          {(isSuperAdminEmail(newEmail) ? ROLE_OPTIONS : NON_SUPERADMIN_ROLE_OPTIONS).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleCreateUser}
          className="btn-primary"
          disabled={!canEditUsers || saving}
        >
          <PlusIcon /> AGREGAR
        </button>
      </div>

      {!canEditUsers && (
        <div style={{ marginBottom: 14, fontSize: 11, color: "var(--text-dim)" }}>
          Estás viendo la lista en modo consulta. La administración de usuarios y roles está reservada al <strong style={{ color: "var(--text-main)" }}>superadmin</strong>.
        </div>
      )}

      <div style={{ border: "1px solid var(--border-dim)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.5fr) minmax(160px, 0.8fr) minmax(160px, 0.8fr)", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.03)", fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>
          <span>Correo</span>
          <span>Rol</span>
          <span>Último ingreso</span>
        </div>

        {loading ? (
          <div className="empty-state">Cargando usuarios...</div>
        ) : visibleUsers.length === 0 ? (
          <div className="empty-state">Aún no hay usuarios registrados en la configuración.</div>
        ) : (
          visibleUsers.map((entry) => {
            const lockedSuperAdmin = isSuperAdminEmail(entry.email)
            const roleOptions = lockedSuperAdmin ? ROLE_OPTIONS : NON_SUPERADMIN_ROLE_OPTIONS

            return (
              <div
                key={entry.id || entry.email}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 1.5fr) minmax(160px, 0.8fr) minmax(160px, 0.8fr)",
                  gap: 10,
                  padding: "12px",
                  borderTop: "1px solid rgba(148,163,184,0.15)",
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {entry.email}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>
                    {lockedSuperAdmin ? "Superadmin reservado" : entry.source === "profiles" ? "Perfil existente" : "Configurado en sistema"}
                  </div>
                </div>

                <select
                  value={entry.role}
                  onChange={(event) => handleRoleChange(entry, event.target.value)}
                  className="input-field"
                  disabled={!canEditUsers || lockedSuperAdmin || saving}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {formatSeenAt(entry.lastSeenAt)}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 12 }}>
        `Usuario` no podrá eliminar tareos ni ver Config. `Contratista` usa su portal y padrón digital. `Vigilancia` solo usa ingreso/egreso. `Prevencion` visualiza accesos y checklist documental.
      </div>
    </div>
  )
}
