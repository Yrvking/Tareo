import { useState, useMemo } from "react"
import Select from "react-select"
import { SearchIcon, CheckIcon, PlusIcon, UserGroupIcon, TrashIcon } from "./Icons"
import { insertRegistro } from "../utils/supabaseClient"
import { getNormalHourCap } from "../utils/tareoLogic"

const selectStyles = {
  control: (base, state) => ({
    ...base,
    backgroundColor: '#0f172a',
    borderColor: state.isFocused ? '#2563eb' : '#334155',
    color: '#f8fafc',
    borderRadius: '10px',
    padding: '2px',
    boxShadow: state.isFocused ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none',
    '&:hover': {
      borderColor: '#2563eb',
    }
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '10px',
    zIndex: 100
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? 'rgba(37, 99, 235, 0.15)' : 'transparent',
    color: state.isFocused ? '#2563eb' : '#94a3b8',
    cursor: 'pointer',
    '&:active': {
      backgroundColor: 'rgba(37, 99, 235, 0.25)'
    }
  }),
  singleValue: (base) => ({
    ...base,
    color: '#f8fafc'
  }),
  input: (base) => ({
    ...base,
    color: '#f8fafc'
  })
}

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
        const dbId = await insertRegistro(newReg)
        if (dbId) newReg.id = dbId
        setRegistros(prev => [...prev, newReg])
        successCount++
      } catch (e) {
        console.error("Error batch save", e)
      }
    }

    showFeedback("success", `✓ Se registraron ${successCount} trabajadores`)
    setSelectedWorkers([])
    setSearchQuery("")
  }

  return (
    <div className="mobile-entry-container">
      {/* Group Configuration Card */}
      <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
        <div className="label">CONFIGURACIÓN DE CARGA</div>
        
        <div style={{ marginBottom: '12px' }}>
          <label className="field-label-sm">Actividad / Partida</label>
          <Select
            options={actividades.map(a => ({ value: a.id, label: a.nombre }))}
            value={selectedActivity}
            onChange={setSelectedActivity}
            placeholder="Buscar actividad..."
            styles={selectStyles}
            isClearable
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <label className="field-label-sm">Frente / Sector</label>
            <Select
              options={frentes.map(f => ({ value: f.id, label: f.nombre }))}
              value={selectedFrente}
              onChange={setSelectedFrente}
              placeholder="Frente..."
              styles={selectStyles}
              isClearable
            />
          </div>
          <div style={{ width: '80px' }}>
            <label className="field-label-sm">HN</label>
            <input 
              type="number" 
              value={hn} 
              onChange={e => setHn(e.target.value)}
              className="input-field mono"
              style={{ padding: '8px' }}
            />
          </div>
          <div style={{ width: '80px' }}>
            <label className="field-label-sm" style={{ color: '#ef4444' }}>HE</label>
            <input 
              type="number" 
              value={he} 
              onChange={e => setHe(e.target.value)}
              className="input-field mono"
              style={{ padding: '8px' }}
            />
          </div>
        </div>
      </div>

      {/* Worker Search & List */}
      <div className="search-container">
        <SearchIcon />
        <input 
          type="text" 
          placeholder="Buscar personal por nombre o categoría..." 
          className="search-input"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="worker-list-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span className="label" style={{ margin: 0 }}>PERSONAL ({selectedWorkers.length} seleccionados)</span>
          <button 
            onClick={() => setSelectedWorkers(selectedWorkers.length === filteredWorkers.length ? [] : filteredWorkers.map(w => w.id))}
            style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
          >
            {selectedWorkers.length === filteredWorkers.length ? "DESELECCIONAR TODO" : "SELECCIONAR TODO"}
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
              <div className="worker-cat">{w.categoria || "S/CAT"} • {w.id}</div>
            </div>
          </div>
        ))}

        {filteredWorkers.length === 0 && (
          <div className="empty-state">No se encontraron trabajadores que coincidan.</div>
        )}
      </div>

      {/* Actions */}
      <div style={{ marginTop: '20px' }}>
        {feedback && (
          <div className={`feedback-banner ${feedback.type}`} style={{ marginBottom: '16px' }}>
            {feedback.message}
          </div>
        )}
        <button 
          onClick={handleRegisterBatch}
          className="btn-primary" 
          style={{ width: '100%', padding: '16px', fontSize: '16px', borderRadius: '14px' }}
          disabled={selectedWorkers.length === 0}
        >
          <UserGroupIcon /> REGISTRAR TAREO GRUPAL
        </button>
      </div>
    </div>
  )
}
