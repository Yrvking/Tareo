import { useEffect, useMemo, useState } from "react"
import { fetchAccessEntries, saveAccessEntries } from "../utils/supabaseClient"
import { DEFAULT_ACCESS_CHECKLIST } from "../utils/accessControl"

function isChecklistComplete(entry) {
  return DEFAULT_ACCESS_CHECKLIST.every((item) => Boolean(entry?.checklist?.[item.key]))
}

function buildCompanySummary(entries = []) {
  const companyMap = new Map()

  entries.forEach((entry) => {
    const key = entry.empresa || "Sin empresa"
    const current = companyMap.get(key) || {
      empresa: key,
      total: 0,
      completos: 0,
      pendientes: 0,
    }

    current.total += 1
    if (isChecklistComplete(entry)) current.completos += 1
    else current.pendientes += 1
    companyMap.set(key, current)
  })

  return Array.from(companyMap.values()).sort((a, b) => b.total - a.total || a.empresa.localeCompare(b.empresa))
}

export default function PrevencionPanel({ workers, fechaTareo }) {
  const [entries, setEntries] = useState([])
  const [searchQuery, setSearchQuery] = useState("")
  const [companyFilter, setCompanyFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadEntries() {
      setLoading(true)
      const storedEntries = await fetchAccessEntries()
      if (mounted) {
        setEntries(storedEntries)
        setLoading(false)
      }
    }

    loadEntries()
    return () => {
      mounted = false
    }
  }, [])

  const todayEntries = useMemo(() => entries.filter((entry) => entry.date === fechaTareo), [entries, fechaTareo])
  const companySummary = useMemo(() => buildCompanySummary(todayEntries), [todayEntries])
  const companyOptions = useMemo(() => ["all", ...companySummary.map((item) => item.empresa)], [companySummary])

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return todayEntries.filter((entry) => {
      const checklistOk = isChecklistComplete(entry)
      const matchesCompany = companyFilter === "all" || entry.empresa === companyFilter
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "complete" && checklistOk) ||
        (statusFilter === "pending" && !checklistOk)
      const matchesQuery =
        !query ||
        entry.workerNombre.toLowerCase().includes(query) ||
        entry.empresa.toLowerCase().includes(query) ||
        entry.workerId.toLowerCase().includes(query)

      return matchesCompany && matchesStatus && matchesQuery
    })
  }, [todayEntries, searchQuery, companyFilter, statusFilter])

  const totalComplete = filteredEntries.filter((entry) => isChecklistComplete(entry)).length
  const totalPending = filteredEntries.length - totalComplete

  const showFeedback = (type, message) => {
    setFeedback({ type, message })
    window.clearTimeout(showFeedback.timeoutId)
    showFeedback.timeoutId = window.setTimeout(() => setFeedback(null), 2500)
  }

  const persistEntries = async (nextEntries, successMessage = "") => {
    const saved = await saveAccessEntries(nextEntries)
    setEntries(saved)
    if (successMessage) showFeedback("success", successMessage)
  }

  const updateEntryChecklist = async (entryId, fieldKey, checked) => {
    const nextEntries = entries.map((entry) => (
      entry.id !== entryId
        ? entry
        : {
            ...entry,
            checklist: {
              ...entry.checklist,
              [fieldKey]: checked,
            },
            updatedAt: new Date().toISOString(),
          }
    ))

    await persistEntries(nextEntries, "Checklist actualizado.")
  }

  const updateEntryNotes = async (entryId, nextNotes) => {
    const nextEntries = entries.map((entry) => (
      entry.id !== entryId
        ? entry
        : {
            ...entry,
            notes: nextNotes,
            updatedAt: new Date().toISOString(),
          }
    ))

    await persistEntries(nextEntries)
  }

  return (
    <div className="dashboard-shell">
      <div className="dashboard-kpi-grid">
        <div className="dashboard-metric-card dashboard-tone-blue">
          <span className="dashboard-metric-label">Personal controlado</span>
          <strong className="dashboard-metric-value">{filteredEntries.length}</strong>
          <span className="dashboard-metric-sub">Fecha operativa: {fechaTareo}</span>
        </div>
        <div className="dashboard-metric-card dashboard-tone-green">
          <span className="dashboard-metric-label">Checklist completo</span>
          <strong className="dashboard-metric-value">{totalComplete}</strong>
          <span className="dashboard-metric-sub">Personas listas para validación</span>
        </div>
        <div className="dashboard-metric-card dashboard-tone-alert">
          <span className="dashboard-metric-label">Checklist pendiente</span>
          <strong className="dashboard-metric-value">{totalPending}</strong>
          <span className="dashboard-metric-sub">Documentación o revisión pendiente</span>
        </div>
      </div>

      <div className="card">
        <div className="label" style={{ marginBottom: 12 }}>FILTROS PREVENCIÓN</div>
        {feedback && (
          <div className={`feedback-banner ${feedback.type}`} style={{ marginBottom: 12 }}>
            {feedback.message}
          </div>
        )}
        <div className="dashboard-filter-grid">
          <div className="dashboard-filter-field">
            <span>Buscar</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="input-field dashboard-input"
              placeholder="Trabajador, empresa o código..."
            />
          </div>
          <div className="dashboard-filter-field">
            <span>Empresa</span>
            <select
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
              className="input-field dashboard-input"
            >
              {companyOptions.map((company) => (
                <option key={company} value={company}>
                  {company === "all" ? "Todas" : company}
                </option>
              ))}
            </select>
          </div>
          <div className="dashboard-filter-field">
            <span>Estado checklist</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="input-field dashboard-input"
            >
              <option value="all">Todos</option>
              <option value="complete">Completo</option>
              <option value="pending">Pendiente</option>
            </select>
          </div>
        </div>
      </div>

      <div className="desktop-grid">
        <section>
          <div className="card">
            <div className="label" style={{ marginBottom: 12 }}>RESUMEN POR EMPRESA</div>
            {companySummary.length === 0 ? (
              <div className="empty-state">Sin datos de vigilancia para esta fecha.</div>
            ) : (
              <div className="dashboard-rank-list">
                {companySummary.map((company) => (
                  <div key={company.empresa} className="dashboard-list-row-static">
                    <div>
                      <div className="dashboard-list-title">{company.empresa}</div>
                      <div className="dashboard-list-subtitle">{company.total} personas registradas</div>
                    </div>
                    <div className="dashboard-list-metric">
                      <strong style={{ color: "var(--green-accent)" }}>{company.completos}</strong>
                      <span>Completos</span>
                    </div>
                    <div className="dashboard-list-metric">
                      <strong style={{ color: "var(--red-accent)" }}>{company.pendientes}</strong>
                      <span>Pendientes</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="card">
            <div className="label" style={{ marginBottom: 12 }}>CHECKLIST DOCUMENTAL</div>
            {loading ? (
              <div className="empty-state">Cargando registros de vigilancia...</div>
            ) : filteredEntries.length === 0 ? (
              <div className="empty-state">No hay personal para revisar con los filtros actuales.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredEntries.map((entry) => {
                  const worker = workers.find((item) => String(item.id) === String(entry.workerId))
                  return (
                    <div
                      key={entry.id}
                      style={{
                        border: "1px solid var(--border-dim)",
                        borderRadius: 14,
                        padding: 14,
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, color: "var(--text-main)" }}>{entry.workerNombre}</div>
                          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                            {entry.categoria || "Sin categoria"} · {entry.empresa}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>
                            DNI: {worker?.dni || entry?.dni || "No registrado"} · Ingreso: {entry.checkInTime || "--:--"} · Egreso: {entry.checkOutTime || "Pendiente"}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: isChecklistComplete(entry) ? "var(--green-accent)" : "var(--accent-gold)", fontWeight: 700 }}>
                          {isChecklistComplete(entry) ? "Checklist completo" : "Checklist pendiente"}
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                        {DEFAULT_ACCESS_CHECKLIST.map((item) => (
                          <label
                            key={item.key}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 10px",
                              borderRadius: 10,
                              background: "rgba(15,23,42,0.55)",
                              border: "1px solid rgba(148,163,184,0.18)",
                              fontSize: 12,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(entry.checklist?.[item.key])}
                              onChange={(event) => updateEntryChecklist(entry.id, item.key, event.target.checked)}
                            />
                            <span>{item.label}</span>
                          </label>
                        ))}
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <label className="field-label-sm">Observación documental</label>
                        <textarea
                          defaultValue={entry.notes || ""}
                          onBlur={(event) => updateEntryNotes(entry.id, event.target.value)}
                          className="input-field"
                          rows={2}
                          placeholder="Observación de Prevención / SOMA..."
                          style={{ resize: "vertical", minHeight: 72 }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
