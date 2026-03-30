import { useEffect, useMemo, useState } from "react"
import Select from "react-select"
import { CheckIcon, SearchIcon } from "./Icons"
import {
  fetchAccessEntries,
  fetchContractorCompanies,
  fetchContractorRoster,
  saveAccessEntries,
} from "../utils/supabaseClient"
import { selectStyles } from "../utils/selectTheme"
import { useAuth } from "../contexts/AuthContext"
import { createChecklistState } from "../utils/accessControl"
import { getWorkerCategoryLabel } from "../utils/workerCategory"
import { buildContractorQrValue } from "../utils/contractorPortal"

function nowTimeString() {
  return new Date().toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function buildCompanySummary(entries = []) {
  const companyMap = new Map()

  entries.forEach((entry) => {
    const key = entry.empresa || "Sin empresa"
    const current = companyMap.get(key) || { empresa: key, total: 0, dentro: 0 }
    current.total += 1
    if (!entry.checkOutTime) current.dentro += 1
    companyMap.set(key, current)
  })

  return Array.from(companyMap.values()).sort((a, b) => b.total - a.total || a.empresa.localeCompare(b.empresa))
}

function formatWorkerForAccess(worker, source = "interno") {
  if (source === "contratista") {
    return {
      ...worker,
      nombre: worker.nombreCompleto,
      nombreAcceso: worker.nombreCompleto,
      workerSource: "contratista",
    }
  }

  return {
    ...worker,
    nombreAcceso: worker.nombre,
    workerSource: "interno",
  }
}

export default function VigilanciaPanel({ workers, fechaTareo }) {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [contractorRoster, setContractorRoster] = useState([])
  const [selectedWorker, setSelectedWorker] = useState(null)
  const [empresa, setEmpresa] = useState("")
  const [notes, setNotes] = useState("")
  const [accessCode, setAccessCode] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadEntries() {
      setLoading(true)
      const [storedEntries, contractorCompanies] = await Promise.all([
        fetchAccessEntries(),
        fetchContractorCompanies(),
      ])
      const storedRoster = await fetchContractorRoster(contractorCompanies)

      if (mounted) {
        setEntries(storedEntries)
        setContractorRoster(storedRoster)
        setLoading(false)
      }
    }

    loadEntries()
    return () => {
      mounted = false
    }
  }, [])

  const workerOptions = useMemo(() => {
    const internalOptions = workers.map((worker) => ({
      value: worker.id,
      label: `${worker.nombre} · ${worker.codigo || worker.id}${worker.dni ? ` · DNI ${worker.dni}` : ""}`,
      worker: formatWorkerForAccess(worker, "interno"),
    }))

    const externalOptions = contractorRoster.map((worker) => ({
      value: worker.id,
      label: `${worker.nombreCompleto} · DNI ${worker.dni} · ${worker.empresa}`,
      worker: formatWorkerForAccess(worker, "contratista"),
    }))

    return [...internalOptions, ...externalOptions]
  }, [workers, contractorRoster])

  const todayEntries = useMemo(() => entries.filter((entry) => entry.date === fechaTareo), [entries, fechaTareo])

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return todayEntries

    return todayEntries.filter((entry) => (
      entry.workerNombre.toLowerCase().includes(query) ||
      entry.empresa.toLowerCase().includes(query) ||
      entry.workerId.toLowerCase().includes(query) ||
      String(entry.dni || "").includes(query)
    ))
  }, [todayEntries, searchQuery])

  const openEntries = useMemo(() => todayEntries.filter((entry) => !entry.checkOutTime), [todayEntries])

  const selectedOpenEntry = useMemo(() => {
    if (!selectedWorker) return null
    return openEntries.find((entry) => String(entry.workerId) === String(selectedWorker.value)) || null
  }, [openEntries, selectedWorker])

  const companySummary = useMemo(() => buildCompanySummary(todayEntries), [todayEntries])

  const showFeedback = (type, message) => {
    setFeedback({ type, message })
    window.clearTimeout(showFeedback.timeoutId)
    showFeedback.timeoutId = window.setTimeout(() => setFeedback(null), 3500)
  }

  const persistEntries = async (nextEntries) => {
    const saved = await saveAccessEntries(nextEntries)
    setEntries(saved)
  }

  const resolveWorkerFromAccessCode = () => {
    const query = accessCode.trim()
    if (!query) {
      showFeedback("error", "Escanea un QR o escribe DNI/código para resolver el acceso.")
      return
    }

    const normalizedQuery = query.toLowerCase()
    const contractorMatch = contractorRoster.find((worker) => (
      worker.dni === query ||
      String(worker.id) === query ||
      String(worker.qrToken).toLowerCase() === normalizedQuery ||
      String(worker.qrValue).toLowerCase() === normalizedQuery ||
      buildContractorQrValue(worker).toLowerCase() === normalizedQuery
    ))

    if (contractorMatch) {
      const nextSelectedWorker = {
        value: contractorMatch.id,
        label: `${contractorMatch.nombreCompleto} · DNI ${contractorMatch.dni} · ${contractorMatch.empresa}`,
        worker: formatWorkerForAccess(contractorMatch, "contratista"),
      }
      setSelectedWorker(nextSelectedWorker)
      setEmpresa(contractorMatch.empresa)
      showFeedback("success", `Acceso resuelto para ${contractorMatch.nombreCompleto}.`)
      return
    }

    const internalMatch = workers.find((worker) => (
      String(worker.id) === query ||
      String(worker.codigo || "") === query ||
      String(worker.dni || "") === query
    ))

    if (internalMatch) {
      const nextSelectedWorker = {
        value: internalMatch.id,
        label: `${internalMatch.nombre} · ${internalMatch.codigo || internalMatch.id}`,
        worker: formatWorkerForAccess(internalMatch, "interno"),
      }
      setSelectedWorker(nextSelectedWorker)
      showFeedback("success", `Acceso resuelto para ${internalMatch.nombre}.`)
      return
    }

    showFeedback("error", "No se encontró un trabajador activo con ese QR, DNI o código.")
  }

  const handleRegisterIngreso = async () => {
    if (!selectedWorker?.worker) {
      showFeedback("error", "Selecciona un trabajador para registrar su ingreso.")
      return
    }

    if (selectedOpenEntry) {
      showFeedback("error", `${selectedWorker.worker.nombreAcceso || selectedWorker.worker.nombre} ya figura dentro de obra en esta fecha.`)
      return
    }

    if (selectedWorker.worker.workerSource === "contratista" && selectedWorker.worker.estado !== "apto") {
      showFeedback("error", `El trabajador ${selectedWorker.worker.nombreAcceso} no está habilitado. Estado actual: ${selectedWorker.worker.estado}.`)
      return
    }

    const nextEntry = {
      workerId: String(selectedWorker.worker.id),
      workerNombre: selectedWorker.worker.nombreAcceso || selectedWorker.worker.nombre,
      categoria: selectedWorker.worker.workerSource === "contratista"
        ? selectedWorker.worker.categoria || selectedWorker.worker.cargo || "Sin categoria"
        : getWorkerCategoryLabel(selectedWorker.worker, { fallback: "Sin categoria" }),
      workerSource: selectedWorker.worker.workerSource || "interno",
      companyId: selectedWorker.worker.companyId || "",
      empresa: selectedWorker.worker.workerSource === "contratista"
        ? selectedWorker.worker.empresa
        : (empresa.trim() || "Sin empresa"),
      dni: selectedWorker.worker.dni || "",
      qrToken: selectedWorker.worker.qrToken || "",
      date: fechaTareo,
      checkInTime: nowTimeString(),
      checkOutTime: "",
      notes: notes.trim(),
      checklist: createChecklistState(
        selectedWorker.worker.workerSource === "contratista"
          ? selectedWorker.worker.documentos
          : {}
      ),
      createdBy: user?.email || "",
      updatedBy: user?.email || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await persistEntries([...entries, nextEntry])
    showFeedback("success", `Ingreso registrado para ${selectedWorker.worker.nombreAcceso || selectedWorker.worker.nombre}.`)
    setNotes("")
    setAccessCode("")
  }

  const handleRegisterEgreso = async (targetEntry = selectedOpenEntry) => {
    if (!targetEntry) {
      showFeedback("error", "No hay ingreso abierto para registrar egreso.")
      return
    }

    const nextEntries = entries.map((entry) => (
      entry.id !== targetEntry.id
        ? entry
        : {
            ...entry,
            checkOutTime: nowTimeString(),
            status: "completed",
            updatedBy: user?.email || "",
            updatedAt: new Date().toISOString(),
          }
    ))

    await persistEntries(nextEntries)
    showFeedback("success", `Egreso registrado para ${targetEntry.workerNombre}.`)
  }

  return (
    <div className="dashboard-shell">
      <div className="dashboard-kpi-grid">
        <div className="dashboard-metric-card dashboard-tone-blue">
          <span className="dashboard-metric-label">Ingresos del día</span>
          <strong className="dashboard-metric-value">{todayEntries.length}</strong>
          <span className="dashboard-metric-sub">Fecha operativa: {fechaTareo}</span>
        </div>
        <div className="dashboard-metric-card dashboard-tone-gold">
          <span className="dashboard-metric-label">Dentro de obra</span>
          <strong className="dashboard-metric-value">{openEntries.length}</strong>
          <span className="dashboard-metric-sub">Personal con ingreso y sin egreso</span>
        </div>
        <div className="dashboard-metric-card dashboard-tone-neutral">
          <span className="dashboard-metric-label">Empresas del día</span>
          <strong className="dashboard-metric-value">{companySummary.length}</strong>
          <span className="dashboard-metric-sub">Control por contratista y subcontrata</span>
        </div>
      </div>

      <div className="desktop-grid">
        <section>
          <div className="card">
            <div className="label" style={{ marginBottom: 12 }}>REGISTRO DE INGRESO / EGRESO</div>

            {feedback && (
              <div className={`feedback-banner ${feedback.type}`} style={{ marginBottom: 12 }}>
                {feedback.message}
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label className="field-label-sm">QR / DNI / Código</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                <input
                  type="text"
                  value={accessCode}
                  onChange={(event) => setAccessCode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      resolveWorkerFromAccessCode()
                    }
                  }}
                  className="input-field"
                  placeholder="Escanea QR, pega el token o escribe DNI..."
                />
                <button className="btn-secondary" onClick={resolveWorkerFromAccessCode}>
                  RESOLVER
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="field-label-sm">Trabajador</label>
              <Select
                options={workerOptions}
                value={selectedWorker}
                onChange={(nextOption) => {
                  setSelectedWorker(nextOption)
                  setEmpresa(nextOption?.worker?.empresa || "")
                }}
                styles={selectStyles}
                placeholder="Buscar trabajador..."
                isClearable
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
              <div>
                <label className="field-label-sm">Empresa / Contratista</label>
                <input
                  type="text"
                  value={selectedOpenEntry ? selectedOpenEntry.empresa : empresa}
                  onChange={(event) => setEmpresa(event.target.value)}
                  className="input-field"
                  placeholder="Ej. Contratista Topografía SAC"
                  disabled={Boolean(selectedOpenEntry) || selectedWorker?.worker?.workerSource === "contratista"}
                />
              </div>
              <div>
                <label className="field-label-sm">Observación</label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="input-field"
                  rows={3}
                  placeholder="Observación breve del ingreso o egreso..."
                  style={{ resize: "vertical", minHeight: 84 }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              <button onClick={handleRegisterIngreso} className="btn-primary">
                <CheckIcon /> REGISTRAR INGRESO
              </button>
              <button onClick={() => handleRegisterEgreso()} className="btn-secondary">
                REGISTRAR EGRESO
              </button>
            </div>

            {selectedOpenEntry && (
              <div className="alert-info" style={{ marginTop: 14 }}>
                {selectedOpenEntry.workerNombre} ya ingresó hoy a las {selectedOpenEntry.checkInTime}. El siguiente paso disponible es registrar su egreso.
              </div>
            )}
          </div>

          <div className="card">
            <div className="label" style={{ marginBottom: 12 }}>RESUMEN POR EMPRESA</div>
            {companySummary.length === 0 ? (
              <div className="empty-state">Todavía no hay ingresos registrados para esta fecha.</div>
            ) : (
              <div className="dashboard-rank-list">
                {companySummary.map((company) => (
                  <div key={company.empresa} className="dashboard-list-row-static">
                    <div>
                      <div className="dashboard-list-title">{company.empresa}</div>
                      <div className="dashboard-list-subtitle">Ingresaron {company.total} personas</div>
                    </div>
                    <div className="dashboard-list-metric">
                      <strong style={{ color: "var(--text-main)" }}>{company.dentro}</strong>
                      <span>Dentro</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="card">
            <div className="label" style={{ marginBottom: 12 }}>MOVIMIENTO DEL DÍA</div>
            <div className="search-container" style={{ marginBottom: 14 }}>
              <SearchIcon />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="search-input"
                placeholder="Buscar por nombre, empresa o código..."
              />
            </div>

            {loading ? (
              <div className="empty-state">Cargando ingresos y egresos...</div>
            ) : filteredEntries.length === 0 ? (
              <div className="empty-state">No hay registros para mostrar en esta fecha.</div>
            ) : (
              <div className="dashboard-rank-list">
                {filteredEntries.map((entry) => (
                  <div key={entry.id} className="dashboard-list-row-static">
                    <div>
                      <div className="dashboard-list-title">{entry.workerNombre}</div>
                      <div className="dashboard-list-subtitle">
                        {entry.categoria} · {entry.empresa}
                      </div>
                      <div className="dashboard-list-subtitle">
                        {entry.dni ? `DNI ${entry.dni}` : "Sin DNI"} · {entry.workerSource === "contratista" ? "Contratista" : "Interno"}
                      </div>
                    </div>
                    <div className="dashboard-list-metric">
                      <strong style={{ color: "var(--text-main)" }}>{entry.checkInTime || "--:--"}</strong>
                      <span>Ingreso</span>
                    </div>
                    <div className="dashboard-list-metric">
                      <strong style={{ color: entry.checkOutTime ? "var(--text-main)" : "var(--accent-gold)" }}>
                        {entry.checkOutTime || "Pendiente"}
                      </strong>
                      <span>Egreso</span>
                    </div>
                    {!entry.checkOutTime && (
                      <button onClick={() => handleRegisterEgreso(entry)} className="btn-pill-sm">
                        Marcar egreso
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
