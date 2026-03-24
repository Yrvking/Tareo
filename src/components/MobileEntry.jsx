import { useState, useMemo } from "react"
import Select from "react-select"
import { SearchIcon, CheckIcon, PlusIcon, UserGroupIcon, TrashIcon } from "./Icons"
import { insertRegistro, fetchRegistros } from "../utils/supabaseClient"
import { getWeekRange } from "../utils/dateUtils"
import { getNormalHourCap } from "../utils/tareoLogic"
import { selectStyles } from "../utils/selectTheme"

export default function MobileEntry({ workers, frentes, actividades, setRegistros, fechaTareo }) {
  const cap = getNormalHourCap(fechaTareo)
  const [selectedWorkers, setSelectedWorkers] = useState([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [selectedFrente, setSelectedFrente] = useState(null)
  const [hn, setHn] = useState(cap)
  const [he, setHe] = useState("")
  const [feedback, setFeedback] = useState(null)

  const showFeedback = (type, message) => {
    setFeedback({ type, message })
    setTimeout(() => setFeedback(null), 3000)
  }

  const filteredWorkers = useMemo(() => {
    return workers.filter(w => 
      w.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.categoria?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [workers, searchQuery])

  const toggleWorker = (id) => {
    setSelectedWorkers(prev => 
      prev.includes(id) ? prev.filter(wid => wid !== id) : [...prev, id]
    )
  }

  const handleRegisterBatch = async () => {
    if (selectedWorkers.length === 0 || !selectedActivity) {
      showFeedback("error", "Seleccione trabajadores y una actividad")
      return
    }

    const currentFrenteObj = selectedFrente ? frentes.find(f => f.id === selectedFrente.value) : null
    const currentActObj = actividades.find(a => a.id === selectedActivity.value)

    let successCount = 0
    let pendingCount = 0
    let adjustedCount = 0
    let adjustedHours = 0
    for (const workerId of selectedWorkers) {
      const worker = workers.find(w => w.id === workerId)
      if (!worker) continue

      const newReg = {
        id: Date.now() + Math.random(),
        workerId: worker.id,
        workerNombre: worker.nombre,
        frenteId: currentFrenteObj?.id || null,
        frenteNombre: currentFrenteObj?.nombre || null,
        assignments: [{
          actividadId: currentActObj.id,
          partidaId: currentActObj.partidaId || null,
          horasNormales: parseFloat(hn) || 0,
          horasExtras: parseFloat(he) || 0,
        }],
        date: fechaTareo,
        timestamp: new Date().toLocaleTimeString("es-PE"),
        raw: "Carga Grupal (S10 Style)",
      }

      try {
        const result = await insertRegistro(newReg)
        const savedReg = result?.record ? { ...newReg, ...result.record } : { ...newReg }
        if (result?.id) savedReg.id = result.id
        if (result?.syncStatus) savedReg.syncStatus = result.syncStatus
        setRegistros(prev => [...prev, savedReg])
        successCount++
        if (result?.syncStatus && result.syncStatus !== "synced") {
          pendingCount++
        }
        if (result?.adjustment?.adjusted) {
          adjustedCount++
          adjustedHours += result.adjustment.movedToExtra || 0
        }
      } catch (e) {
        console.error("Error batch save", e)
      }
    }

    // Re-sincronizar desde Supabase para que Planilla refleje los nuevos registros
    try {
      const { dates } = getWeekRange(fechaTareo)
      const fresh = await fetchRegistros(dates[0], dates[dates.length - 1])
      setRegistros(fresh)
    } catch { /* no bloquear feedback si el re-fetch falla */ }

    showFeedback(
      "success",
      `${pendingCount > 0
        ? `✓ ${successCount} trabajadores registrados. ${pendingCount} quedaron pendientes de sincronización.`
        : `✓ Se registraron ${successCount} trabajadores`}${adjustedCount > 0 ? ` ${adjustedCount} registros ajustaron ${adjustedHours}h a Horas Extras por superar 8.5 HN diarias.` : ""}`
    )
    setSelectedWorkers([])
    setSearchQuery("")
  }

  return (
    <div className="mobile-entry-container">
      <div className="desktop-grid">
        {/* Left Column: Group Configuration */}
        <section>
          <div className="sidebar-brand" style={{ margin: '0 0 16px 0', padding: 0 }}>
            <span className="label" style={{ color: 'var(--accent-blue)' }}>CONFIGURACIÓN GLOBAL</span>
          </div>
          
          <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
            <div className="label">DETALLES DE LA TAREA</div>
            
            <div style={{ marginBottom: '16px' }}>
              <label className="field-label-sm" htmlFor="mobile-actividad">Actividad / Partida</label>
              <Select
                inputId="mobile-actividad"
                aria-label="Actividad o partida"
                options={actividades.map(a => ({ value: a.id, label: `${a.id} - ${a.nombre}` }))}
                value={selectedActivity}
                onChange={setSelectedActivity}
                placeholder="Seleccione actividad..."
                styles={selectStyles}
                isClearable={false}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label className="field-label-sm" htmlFor="mobile-frente">Frente / Sector</label>
              <Select
                inputId="mobile-frente"
                aria-label="Frente o sector"
                options={frentes.map(f => ({ value: f.id, label: f.nombre }))}
                value={selectedFrente}
                onChange={setSelectedFrente}
                placeholder="Seleccione frente..."
                styles={selectStyles}
                isClearable={false}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label className="field-label-sm" htmlFor="mobile-hn">Horas Normales (HN)</label>
                <input 
                  id="mobile-hn"
                  aria-label="Horas normales"
                  type="number" 
                  value={hn} 
                  onChange={e => setHn(e.target.value)}
                  className="input-field mono"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label-sm" htmlFor="mobile-he" style={{ color: '#ef4444' }}>Horas Extras (HE)</label>
                <input 
                  id="mobile-he"
                  aria-label="Horas extras"
                  type="number" 
                  value={he} 
                  onChange={e => setHe(e.target.value)}
                  className="input-field mono"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 'auto' }}>
            {feedback && (
              <div className={`feedback-banner ${feedback.type}`} style={{ marginBottom: '16px' }}>
                {feedback.message}
              </div>
            )}
            <button 
              onClick={handleRegisterBatch}
              className="btn-primary" 
              style={{ width: '100%', padding: '18px', fontSize: '16px', borderRadius: '14px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}
              disabled={selectedWorkers.length === 0}
            >
              <UserGroupIcon /> REGISTRAR TAREO GRUPAL
            </button>
          </div>
        </section>

        {/* Right Column: Worker Selection */}
        <section>
          <div className="sidebar-brand" style={{ margin: '0 0 16px 0', padding: 0 }}>
            <span className="label">SELECCIÓN DE PERSONAL</span>
          </div>

          <div className="search-container" style={{ marginBottom: '16px' }}>
            <SearchIcon />
            <input 
              aria-label="Buscar personal"
              type="text" 
              placeholder="Buscar por nombre, código o categoría..." 
              className="search-input"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="worker-list-container" style={{ maxHeight: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
              <span className="label" style={{ margin: 0, color: 'var(--text-dim)' }}>
                {selectedWorkers.length} DE {filteredWorkers.length} SELECCIONADOS
              </span>
              <button 
                onClick={() => setSelectedWorkers(selectedWorkers.length === filteredWorkers.length ? [] : filteredWorkers.map(w => w.id))}
                style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: '11px', fontWeight: '800', cursor: 'pointer', textTransform: 'uppercase' }}
              >
                {selectedWorkers.length === filteredWorkers.length ? "Deseleccionar" : "Seleccionar Todo"}
              </button>
            </div>

            {filteredWorkers.map(w => (
              <div 
                key={w.id} 
                onClick={() => toggleWorker(w.id)}
                className={`worker-row-selectable ${selectedWorkers.includes(w.id) ? 'selected' : ''}`}
              >
                <div className="checkbox-circle">
                  {selectedWorkers.includes(w.id) && <CheckIcon />}
                </div>
                <div className="worker-info">
                  <div className="worker-name">{w.nombre}</div>
                  <div className="worker-cat">{w.categoria || "CARGO NO DEF."} • <span className="mono" style={{ color: 'var(--accent-gold)' }}>{w.id}</span></div>
                </div>
              </div>
            ))}

            {filteredWorkers.length === 0 && (
              <div className="empty-state" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                No se encontraron resultados para "{searchQuery}"
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
