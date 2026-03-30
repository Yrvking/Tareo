import { useEffect, useMemo, useRef, useState } from "react"
import {
  fetchContractorCompanies,
  fetchContractorRoster,
  saveContractorCompanies,
  saveContractorRoster,
} from "../utils/supabaseClient"
import { useAuth } from "../contexts/AuthContext"
import {
  canAccessConfig,
  normalizeRole,
} from "../utils/accessControl"
import {
  buildContractorQrDataUrl,
  buildContractorQrValue,
  downloadContractorPadronTemplate,
  getContractorPortalCompanies,
  mergeContractorWorkers,
  normalizeContractorCompany,
  normalizeContractorWorker,
  parseContractorPadronXLSX,
} from "../utils/contractorPortal"
import { CheckIcon, DownloadIcon, PlusIcon, SearchIcon, TrashIcon, UploadIcon } from "./Icons"

function createCompanyDraft() {
  return {
    id: "",
    nombre: "",
    ruc: "",
    contacto: "",
    telefono: "",
    portalEmails: "",
    estado: "apto",
  }
}

function createWorkerDraft(selectedCompany = null) {
  return {
    id: "",
    dni: "",
    apellidos: "",
    nombres: "",
    categoria: "",
    cargo: "",
    supervisor: "",
    telefono: "",
    fechaIngreso: "",
    estado: "pendiente",
    contractorDocuments: {},
    companyId: selectedCompany?.id || "",
    empresa: selectedCompany?.nombre || "",
  }
}

function formatPortalEmails(value) {
  return Array.isArray(value) ? value.join(", ") : ""
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 KB"
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function statusTone(status) {
  if (status === "apto") return { color: "var(--green-accent)", background: "rgba(34,197,94,0.12)" }
  if (status === "bloqueado") return { color: "var(--red-accent)", background: "rgba(239,68,68,0.12)" }
  return { color: "var(--accent-gold)", background: "rgba(212,165,90,0.14)" }
}

function countUploadedContractorDocuments(worker) {
  return Object.keys(worker?.contractorDocuments || {}).length
}

export default function ContractorPortalPanel() {
  const { user, profile } = useAuth()
  const currentRole = normalizeRole(profile?.role)
  const isAdminUser = canAccessConfig(currentRole)
  const fileInputRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [companies, setCompanies] = useState([])
  const [roster, setRoster] = useState([])
  const [selectedCompanyId, setSelectedCompanyId] = useState("")
  const [companyDraft, setCompanyDraft] = useState(createCompanyDraft())
  const [workerDraft, setWorkerDraft] = useState(createWorkerDraft())
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [editingWorkerId, setEditingWorkerId] = useState("")
  const [editingCompanyId, setEditingCompanyId] = useState("")
  const [selectedQrWorkerId, setSelectedQrWorkerId] = useState("")
  const [selectedQrDataUrl, setSelectedQrDataUrl] = useState("")

  useEffect(() => {
    let mounted = true

    async function loadPortalData() {
      setLoading(true)
      const storedCompanies = await fetchContractorCompanies()
      const storedRoster = await fetchContractorRoster(storedCompanies)
      if (!mounted) return

      setCompanies(storedCompanies)
      setRoster(storedRoster)
      setLoading(false)
    }

    loadPortalData()
    return () => {
      mounted = false
    }
  }, [])

  const showFeedback = (type, message) => {
    setFeedback({ type, message })
    window.clearTimeout(showFeedback.timeoutId)
    showFeedback.timeoutId = window.setTimeout(() => setFeedback(null), 4000)
  }

  const visibleCompanies = useMemo(
    () => getContractorPortalCompanies(companies, user?.email || "", currentRole),
    [companies, user?.email, currentRole]
  )

  useEffect(() => {
    if (visibleCompanies.length === 0) {
      setSelectedCompanyId("")
      setWorkerDraft(createWorkerDraft())
      return
    }

    if (!visibleCompanies.some((company) => company.id === selectedCompanyId)) {
      setSelectedCompanyId(visibleCompanies[0].id)
    }
  }, [visibleCompanies, selectedCompanyId])

  const selectedCompany = useMemo(
    () => visibleCompanies.find((company) => company.id === selectedCompanyId) || visibleCompanies[0] || null,
    [visibleCompanies, selectedCompanyId]
  )

  useEffect(() => {
    setWorkerDraft((current) => ({
      ...createWorkerDraft(selectedCompany),
      ...current,
      companyId: selectedCompany?.id || "",
      empresa: selectedCompany?.nombre || "",
      fechaIngreso: current.fechaIngreso || current.fechaAutorizada || "",
      contractorDocuments: current.contractorDocuments || {},
    }))
  }, [selectedCompany?.id, selectedCompany?.nombre])

  const companyWorkerCounts = useMemo(() => {
    const counts = new Map()
    roster.forEach((worker) => {
      counts.set(worker.companyId, (counts.get(worker.companyId) || 0) + 1)
    })
    return counts
  }, [roster])

  const visibleRoster = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return roster.filter((worker) => {
      if (selectedCompany && worker.companyId !== selectedCompany.id) return false
      if (statusFilter !== "all" && worker.estado !== statusFilter) return false
      if (!query) return true

      return (
        worker.nombreCompleto.toLowerCase().includes(query) ||
        worker.dni.includes(query) ||
        worker.empresa.toLowerCase().includes(query) ||
        worker.supervisor.toLowerCase().includes(query)
      )
    })
  }, [roster, searchQuery, statusFilter, selectedCompany])

  const rosterSummary = useMemo(() => {
    return visibleRoster.reduce((summary, worker) => {
      summary.total += 1
      if (worker.estado === "apto") summary.apto += 1
      else if (worker.estado === "bloqueado") summary.bloqueado += 1
      else summary.pendiente += 1
      return summary
    }, { total: 0, apto: 0, pendiente: 0, bloqueado: 0 })
  }, [visibleRoster])

  const selectedQrWorker = useMemo(
    () => visibleRoster.find((worker) => worker.id === selectedQrWorkerId) || roster.find((worker) => worker.id === selectedQrWorkerId) || null,
    [visibleRoster, roster, selectedQrWorkerId]
  )
  const canManageExistingRoster = isAdminUser

  useEffect(() => {
    let active = true

    async function generateQrPreview() {
      if (!selectedQrWorker) {
        setSelectedQrDataUrl("")
        return
      }

      try {
        const dataUrl = await buildContractorQrDataUrl(selectedQrWorker)
        if (active) setSelectedQrDataUrl(dataUrl)
      } catch {
        if (active) setSelectedQrDataUrl("")
      }
    }

    generateQrPreview()
    return () => {
      active = false
    }
  }, [selectedQrWorker])

  const persistCompanies = async (nextCompanies) => {
    const saved = await saveContractorCompanies(nextCompanies)
    setCompanies(saved)
    return saved
  }

  const persistRoster = async (nextRoster, nextCompanies = companies) => {
    const saved = await saveContractorRoster(nextRoster, nextCompanies)
    setRoster(saved)
    return saved
  }

  const resetCompanyDraft = () => {
    setCompanyDraft(createCompanyDraft())
    setEditingCompanyId("")
  }

  const resetWorkerDraft = () => {
    setWorkerDraft(createWorkerDraft(selectedCompany))
    setEditingWorkerId("")
  }

  const handleSaveCompany = async () => {
    if (!isAdminUser) return
    const normalized = normalizeContractorCompany({
      ...companyDraft,
      id: editingCompanyId || companyDraft.id,
      portalEmails: companyDraft.portalEmails,
    })

    if (!normalized.nombre) {
      showFeedback("error", "Ingresa el nombre de la empresa o subcontrata.")
      return
    }

    setSaving(true)
    const nextCompanies = companies.filter((company) => company.id !== normalized.id)
    nextCompanies.push({
      ...normalized,
      createdAt: companies.find((company) => company.id === normalized.id)?.createdAt || normalized.createdAt,
      updatedAt: new Date().toISOString(),
    })
    const savedCompanies = await persistCompanies(nextCompanies)
    setSaving(false)
    resetCompanyDraft()
    showFeedback("success", `Empresa ${normalized.nombre} guardada.`)

    if (!selectedCompanyId && savedCompanies.length > 0) {
      setSelectedCompanyId(savedCompanies[0].id)
    }
  }

  const handleEditCompany = (company) => {
    if (!isAdminUser) {
      showFeedback("error", "Solo admin y superadmin pueden modificar empresas contratistas.")
      return
    }
    setEditingCompanyId(company.id)
    setCompanyDraft({
      ...company,
      portalEmails: formatPortalEmails(company.portalEmails),
    })
  }

  const handleSaveWorker = async () => {
    if (!selectedCompany) {
      showFeedback("error", "Primero selecciona o crea una empresa para cargar el padrón.")
      return
    }

    const normalized = normalizeContractorWorker({
      ...workerDraft,
      id: editingWorkerId || workerDraft.id,
      companyId: selectedCompany.id,
      empresa: selectedCompany.nombre,
      fechaAutorizada: workerDraft.fechaIngreso,
      vigenciaDesde: "",
      vigenciaHasta: "",
      contractorDocuments: workerDraft.contractorDocuments || {},
      createdBy: user?.email || "",
      updatedBy: user?.email || "",
      updatedAt: new Date().toISOString(),
    }, new Map([[selectedCompany.id, selectedCompany]]))

    if (!normalized.dni || !normalized.nombreCompleto) {
      showFeedback("error", "Completa al menos DNI, apellidos y nombres del trabajador.")
      return
    }

    setSaving(true)
    const nextRoster = roster.filter((worker) => worker.id !== normalized.id)
    nextRoster.push({
      ...normalized,
      createdAt: roster.find((worker) => worker.id === normalized.id)?.createdAt || normalized.createdAt,
    })
    await persistRoster(nextRoster)
    setSelectedQrWorkerId(normalized.id)
    setSaving(false)
    resetWorkerDraft()
    showFeedback("success", `Trabajador ${normalized.nombreCompleto} guardado en el padrón.`)
  }

  const handleEditWorker = (worker) => {
    if (!canManageExistingRoster) {
      showFeedback("error", "Solo admin y superadmin pueden modificar trabajadores ya registrados.")
      return
    }
    setEditingWorkerId(worker.id)
    setSelectedCompanyId(worker.companyId)
    setWorkerDraft({
      ...worker,
      fechaIngreso: worker.fechaAutorizada || worker.fechaIngreso || "",
      contractorDocuments: worker.contractorDocuments || {},
    })
  }

  const handleContractorDocumentUpload = (documentKey, file) => {
    if (!file) return
    setWorkerDraft((current) => ({
      ...current,
      contractorDocuments: {
        ...(current.contractorDocuments || {}),
        [documentKey]: {
          name: file.name,
          type: file.type || "",
          size: file.size || 0,
          uploadedAt: new Date().toISOString(),
          uploadedBy: user?.email || "",
          sourceRole: currentRole || "contratista",
        },
      },
    }))
  }

  const handleRemoveContractorDocument = (documentKey) => {
    setWorkerDraft((current) => {
      const nextDocuments = { ...(current.contractorDocuments || {}) }
      delete nextDocuments[documentKey]
      return {
        ...current,
        contractorDocuments: nextDocuments,
      }
    })
  }

  const handleDeleteWorker = async (workerId) => {
    if (!canManageExistingRoster) {
      showFeedback("error", "Solo admin y superadmin pueden eliminar trabajadores del padrón.")
      return
    }
    setSaving(true)
    await persistRoster(roster.filter((worker) => worker.id !== workerId))
    setSaving(false)
    if (selectedQrWorkerId === workerId) {
      setSelectedQrWorkerId("")
      setSelectedQrDataUrl("")
    }
    if (editingWorkerId === workerId) {
      resetWorkerDraft()
    }
    showFeedback("success", "Trabajador retirado del padrón digital.")
  }

  const handleImportPadron = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!selectedCompany && !isAdminUser) {
      showFeedback("error", "No hay empresa asignada para este portal.")
      event.target.value = ""
      return
    }

    setSaving(true)
    try {
      const buffer = await file.arrayBuffer()
      const imported = parseContractorPadronXLSX(buffer, companies, selectedCompany, user?.email || "")
      const merged = mergeContractorWorkers(roster, imported, companies)
      await persistRoster(merged)
      showFeedback("success", `Se importaron ${imported.length} trabajadores al padrón digital.`)
    } catch (error) {
      showFeedback("error", error?.message || "No se pudo importar el padrón del contratista.")
    }
    setSaving(false)
    event.target.value = ""
  }

  const handleCopyQrValue = async () => {
    if (!selectedQrWorker) return
    try {
      await navigator.clipboard.writeText(buildContractorQrValue(selectedQrWorker))
      showFeedback("success", "Código QR copiado al portapapeles.")
    } catch {
      showFeedback("error", "No se pudo copiar el código QR.")
    }
  }

  if (loading) {
    return <div className="empty-state">Cargando portal del contratista...</div>
  }

  if (!isAdminUser && visibleCompanies.length === 0) {
    return (
      <div className="card">
        <div className="label" style={{ marginBottom: 12 }}>PORTAL DEL CONTRATISTA</div>
        <div className="empty-state">
          Tu correo aún no está vinculado a una empresa contratista. Pide a un admin que registre la empresa y agregue tu correo como acceso del portal.
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-shell">
      <div className="dashboard-kpi-grid">
        <div className="dashboard-metric-card dashboard-tone-blue">
          <span className="dashboard-metric-label">Empresas habilitadas</span>
          <strong className="dashboard-metric-value">{visibleCompanies.length}</strong>
          <span className="dashboard-metric-sub">{isAdminUser ? "Vista administrativa total" : "Empresas asignadas a tu portal"}</span>
        </div>
        <div className="dashboard-metric-card dashboard-tone-green">
          <span className="dashboard-metric-label">Padrón visible</span>
          <strong className="dashboard-metric-value">{rosterSummary.total}</strong>
          <span className="dashboard-metric-sub">{rosterSummary.apto} aptos · {rosterSummary.pendiente} pendientes por revisión</span>
        </div>
        <div className="dashboard-metric-card dashboard-tone-neutral">
          <span className="dashboard-metric-label">QR listos</span>
          <strong className="dashboard-metric-value">{visibleRoster.length}</strong>
          <span className="dashboard-metric-sub">Acceso principal por QR y respaldo por DNI en portería</span>
        </div>
      </div>

      {feedback && (
        <div className={`feedback-banner ${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      <div className="dashboard-topbar">
        <div className="dashboard-project-strip">
          <div className="dashboard-project-head">
            <span className="dashboard-eyebrow">Portal Digital</span>
            <strong style={{ color: "var(--text-main)", fontSize: 20 }}>
              {selectedCompany?.nombre || "Empresas contratistas"}
            </strong>
            <div className="dashboard-project-meta">
              <span><span>RUC:</span><strong>{selectedCompany?.ruc || "No registrado"}</strong></span>
              <span><span>Contacto:</span><strong>{selectedCompany?.contacto || "No registrado"}</strong></span>
              <span><span>Correos portal:</span><strong>{selectedCompany?.portalEmails?.join(", ") || "Sin correos"}</strong></span>
            </div>
          </div>
          <div className="dashboard-topbar-actions">
            {visibleCompanies.length > 1 && (
              <select
                className="input-field dashboard-input"
                value={selectedCompanyId}
                onChange={(event) => setSelectedCompanyId(event.target.value)}
                style={{ minWidth: 260 }}
              >
                {visibleCompanies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.nombre}
                  </option>
                ))}
              </select>
            )}
            <button className="btn-secondary dashboard-export-btn" onClick={() => downloadContractorPadronTemplate(selectedCompany)}>
              <DownloadIcon /> PLANTILLA EXCEL
            </button>
            <button className="btn-secondary dashboard-export-btn" onClick={() => fileInputRef.current?.click()}>
              <UploadIcon /> IMPORTAR PADRÓN
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={handleImportPadron}
            />
          </div>
        </div>
      </div>

      <div
        className="desktop-grid"
        style={!isAdminUser ? { display: "flex", flexDirection: "column", gap: 20 } : undefined}
      >
        <section>
          {isAdminUser && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="label" style={{ marginBottom: 12 }}>EMPRESAS / SUBCONTRATAS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <input className="input-field" placeholder="Nombre de empresa" value={companyDraft.nombre} onChange={(event) => setCompanyDraft((current) => ({ ...current, nombre: event.target.value }))} />
                <input className="input-field" placeholder="RUC" value={companyDraft.ruc} onChange={(event) => setCompanyDraft((current) => ({ ...current, ruc: event.target.value }))} />
                <input className="input-field" placeholder="Contacto principal" value={companyDraft.contacto} onChange={(event) => setCompanyDraft((current) => ({ ...current, contacto: event.target.value }))} />
                <input className="input-field" placeholder="Teléfono" value={companyDraft.telefono} onChange={(event) => setCompanyDraft((current) => ({ ...current, telefono: event.target.value }))} />
                <input className="input-field" placeholder="Correos portal separados por coma" value={companyDraft.portalEmails} onChange={(event) => setCompanyDraft((current) => ({ ...current, portalEmails: event.target.value }))} />
                <select className="input-field" value={companyDraft.estado} onChange={(event) => setCompanyDraft((current) => ({ ...current, estado: event.target.value }))}>
                  <option value="apto">Activa</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="bloqueado">Bloqueada</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <button className="btn-primary" onClick={handleSaveCompany} disabled={saving}>
                  <PlusIcon /> {editingCompanyId ? "GUARDAR EMPRESA" : "AGREGAR EMPRESA"}
                </button>
                {editingCompanyId && (
                  <button className="btn-secondary" onClick={resetCompanyDraft}>
                    CANCELAR
                  </button>
                )}
              </div>

              <div className="dashboard-rank-list" style={{ marginTop: 14 }}>
                {companies.length === 0 ? (
                  <div className="empty-state">Aún no hay empresas contratistas registradas.</div>
                ) : (
                  companies.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      className="dashboard-list-row-static"
                      onClick={() => {
                        setSelectedCompanyId(company.id)
                        handleEditCompany(company)
                      }}
                      style={{ cursor: "pointer", textAlign: "left", appearance: "none", width: "100%" }}
                    >
                      <div>
                        <div className="dashboard-list-title">{company.nombre}</div>
                        <div className="dashboard-list-subtitle">{company.portalEmails.join(", ") || "Sin correos de portal"}</div>
                      </div>
                      <div className="dashboard-list-metric">
                        <strong style={{ color: "var(--text-main)" }}>{companyWorkerCounts.get(company.id) || 0}</strong>
                        <span>Padrón</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="card">
            <div className="label" style={{ marginBottom: 12 }}>PADRÓN DIGITAL DEL CONTRATISTA</div>
            {!selectedCompany ? (
              <div className="empty-state">Selecciona una empresa para registrar su padrón.</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 300px) minmax(260px, 300px) minmax(220px, 240px)", gap: 18, alignItems: "start", width: "100%", maxWidth: 900 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ minHeight: 50 }}>
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                        Completa la ficha base del trabajador antes de adjuntar su documentación digital.
                      </div>
                    </div>
                    {[
                      ["DNI", "dni", "text"],
                      ["APELLIDOS", "apellidos", "text"],
                      ["NOMBRES", "nombres", "text"],
                      ["CATEGORÍA", "categoria", "text"],
                      ["CARGO", "cargo", "text"],
                      ["SUPERVISOR", "supervisor", "text"],
                      ["TELÉFONO", "telefono", "text"],
                    ].map(([label, key, type]) => (
                      <label key={key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 11, color: "var(--accent-gold)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                          {label}
                        </span>
                        <input
                          className="input-field"
                          type={type}
                          value={workerDraft[key]}
                          onChange={(event) => setWorkerDraft((current) => ({ ...current, [key]: event.target.value }))}
                        />
                      </label>
                    ))}
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--accent-gold)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                        FECHA DE INGRESO
                      </span>
                      <input
                        className="input-field"
                        type="date"
                        value={workerDraft.fechaIngreso}
                        onChange={(event) => setWorkerDraft((current) => ({ ...current, fechaIngreso: event.target.value }))}
                      />
                    </label>

                  </div>

                  <div style={{ width: "100%" }}>
                    <div style={{ minHeight: 50, marginBottom: 14 }}>
                      <div className="label" style={{ marginBottom: 10, fontSize: 12 }}>DOCUMENTOS A ADJUNTAR</div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                        Sube los archivos digitales del trabajador. `Prevención` y `admin` revisarán lo cargado después.
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
                      {[
                        ["dni", "DNI"],
                        ["sctr", "SCTR"],
                        ["induccion", "Inducción"],
                        ["examenMedico", "Examen médico"],
                        ["fotocheck", "Fotocheck"],
                        ["epp", "EPP / constancia"],
                      ].map(([key, label]) => {
                        const documentInfo = workerDraft.contractorDocuments?.[key]
                        return (
                          <div
                            key={key}
                            style={{
                              border: "1px solid var(--border-dim)",
                              borderRadius: 14,
                              padding: "10px 12px",
                              background: "rgba(255,255,255,0.03)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              minHeight: 86,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-main)", flex: 1 }}>{label}</div>
                              <label
                                className="btn-secondary"
                                style={{
                                  justifyContent: "center",
                                  cursor: "pointer",
                                  padding: "8px 12px",
                                  minWidth: 104,
                                  flexShrink: 0,
                                }}
                              >
                                <UploadIcon /> {documentInfo ? "REEMPLAZAR" : "SUBIR"}
                                <input
                                  type="file"
                                  style={{ display: "none" }}
                                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                                  onChange={(event) => {
                                    handleContractorDocumentUpload(key, event.target.files?.[0])
                                    event.target.value = ""
                                  }}
                                />
                              </label>
                            </div>
                            {documentInfo ? (
                              <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.35 }}>
                                <div style={{ color: "var(--text-main)" }}>{documentInfo.name}</div>
                                <div>{formatBytes(documentInfo.size)} · {documentInfo.uploadedBy || "Sin usuario"}</div>
                              </div>
                            ) : (
                              <div style={{ fontSize: 10, color: "var(--text-dim)" }}>Sin archivo cargado todavía.</div>
                            )}
                            {documentInfo && (
                              <button className="btn-secondary" type="button" onClick={() => handleRemoveContractorDocument(key)} style={{ alignSelf: "flex-start", padding: "7px 10px" }}>
                                QUITAR ARCHIVO
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <aside className="dashboard-executive-card" style={{ minHeight: 420, position: "sticky", top: 90 }}>
                    <span className="dashboard-eyebrow">QR de acceso</span>
                    <div
                      style={{
                        marginTop: 10,
                        width: "100%",
                        aspectRatio: "1 / 1",
                        borderRadius: 18,
                        border: "1px dashed rgba(96,165,250,0.35)",
                        background: "rgba(255,255,255,0.03)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {selectedQrWorker ? (
                        selectedQrDataUrl ? (
                          <img src={selectedQrDataUrl} alt={`QR ${selectedQrWorker.nombreCompleto}`} style={{ width: "100%", maxWidth: 190, borderRadius: 12, background: "rgba(248,250,252,0.96)", padding: 10 }} />
                        ) : (
                          <div className="empty-state">Generando QR...</div>
                        )
                      ) : (
                        <div className="empty-state" style={{ padding: 18 }}>
                          QR no generado
                        </div>
                      )}
                    </div>
                    {selectedQrWorker ? (
                      <>
                        <strong style={{ color: "var(--text-main)", fontSize: 16, marginTop: 12 }}>{selectedQrWorker.nombreCompleto}</strong>
                        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{selectedQrWorker.empresa}</div>
                        <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-dim)", wordBreak: "break-word" }}>
                          {buildContractorQrValue(selectedQrWorker)}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                          <button className="btn-primary" onClick={handleCopyQrValue}>
                            COPIAR CÓDIGO
                          </button>
                          <button className="btn-secondary" onClick={() => setSelectedQrWorkerId("")}>
                            CERRAR
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="dashboard-executive-copy">
                        <p>El QR aparecerá aquí cuando guardes un trabajador o pulses `VER QR` en el padrón.</p>
                        <p>Sirve para el ingreso principal en portería; el `DNI` queda como respaldo si el trabajador no tiene su código a la mano.</p>
                      </div>
                    )}
                  </aside>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 16,
                    padding: "12px 14px",
                    borderRadius: 14,
                    border: "1px solid rgba(96,165,250,0.28)",
                    background: "rgba(59,130,246,0.08)",
                    color: "var(--text-main)",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Documentación y validación</div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
                    El contratista registra al trabajador, su fecha de ingreso y debe subir la documentación digital de su personal.
                    ` Prevención ` revisará y validará esa documentación, y un ` admin ` podrá completar o cargar documentos adicionales
                    cuando lleguen por correo u otros medios.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <button className="btn-primary" onClick={handleSaveWorker} disabled={saving}>
                  <CheckIcon /> {editingWorkerId ? "GUARDAR TRABAJADOR" : "REGISTRAR TRABAJADOR"}
                </button>
                {editingWorkerId && canManageExistingRoster && (
                  <button className="btn-secondary" onClick={resetWorkerDraft}>
                    CANCELAR
                  </button>
                )}
              </div>
              </>
            )}
          </div>
        </section>

        <section>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="label" style={{ marginBottom: 12 }}>FILTROS DEL PADRÓN</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
              Estos filtros le sirven al contratista para ubicar rápido a un trabajador, revisar si ya fue observado o aprobado por `Prevención`, volver a abrir su QR y completar datos o documentos sin perder tiempo.
            </div>
            <div className="dashboard-filter-grid">
              <div className="dashboard-filter-field">
                <span>Buscar</span>
                <div style={{ position: "relative" }}>
                  <SearchIcon />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="input-field dashboard-input"
                    placeholder="Nombre, DNI, empresa o supervisor..."
                    style={{ paddingLeft: 38 }}
                  />
                </div>
              </div>
              <div className="dashboard-filter-field">
                <span>Estado</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-field dashboard-input">
                  <option value="all">Todos</option>
                  <option value="apto">Aptos</option>
                  <option value="pendiente">Pendientes</option>
                  <option value="bloqueado">Bloqueados</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="label" style={{ marginBottom: 12 }}>TRABAJADORES REGISTRADOS</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
              El QR de acceso se visualiza desde esta lista con `VER QR`, idealmente cuando el trabajador ya fue validado por `Prevención`.
            </div>
            {visibleRoster.length === 0 ? (
              <div className="empty-state">
                Todavía no hay trabajadores cargados para la empresa seleccionada. Puedes registrarlos manualmente o importarlos desde la plantilla Excel.
                Cuando el trabajador ya esté registrado, aparecerá aquí y desde esta misma lista podrás usar `VER QR` para mostrar su código de acceso.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {visibleRoster.map((worker) => {
                    const tone = statusTone(worker.estado)
                    return (
                      <div
                        key={worker.id}
                        style={{
                          border: "1px solid var(--border-dim)",
                          borderRadius: 14,
                          padding: 14,
                          background: "rgba(255,255,255,0.02)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                          <div>
                            <div style={{ fontWeight: 700, color: "var(--text-main)" }}>{worker.nombreCompleto}</div>
                            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                              DNI {worker.dni} · {worker.categoria || "Sin categoría"} · {worker.cargo || "Sin cargo"}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>
                              Supervisor: {worker.supervisor || "No registrado"} · Fecha de ingreso: {worker.fechaAutorizada || worker.fechaIngreso || "Sin fecha"}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ padding: "6px 10px", borderRadius: 999, ...tone, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                              {worker.estado}
                            </span>
                            <button className="btn-secondary" onClick={() => setSelectedQrWorkerId(worker.id)}>
                              VER QR
                            </button>
                            {canManageExistingRoster && (
                              <button className="btn-secondary" onClick={() => handleEditWorker(worker)}>
                                EDITAR
                              </button>
                            )}
                            {canManageExistingRoster && (
                              <button className="btn-secondary" onClick={() => handleDeleteWorker(worker.id)} style={{ color: "var(--red-accent)" }}>
                                <TrashIcon /> QUITAR
                              </button>
                            )}
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, fontSize: 11, color: "var(--text-dim)" }}>
                          <div>Fecha de ingreso: <strong style={{ color: "var(--text-main)" }}>{worker.fechaAutorizada || worker.fechaIngreso || "Sin fecha"}</strong></div>
                          <div>Teléfono: <strong style={{ color: "var(--text-main)" }}>{worker.telefono || "--"}</strong></div>
                          <div>Validación documental: <strong style={{ color: "var(--text-main)" }}>{worker.estado || "pendiente"}</strong></div>
                          <div>Docs subidos por contratista: <strong style={{ color: "var(--text-main)" }}>{countUploadedContractorDocuments(worker)}</strong></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
