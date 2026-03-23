import { useState } from "react"
import { SearchIcon, PlusIcon, TrashIcon, CheckIcon } from "./Icons"
import Select from "react-select"
import { insertRegistro, updateRegistro } from "../utils/supabaseClient"
import { selectStyles } from "../utils/selectTheme"

export default function WeeklyControl({ 
  workers, partidas, actividades, frentes, 
  registros, setRegistros, fechaTareo 
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDay, setSelectedDay] = useState(null) // { workerId, date }
  const [newActivity, setNewActivity] = useState(null)
  const [newHn, setNewHn] = useState(0)
  const [newHe, setNewHe] = useState(0)

  // Calculate current week range (Mon-Sat)
  const baseDate = new Date(fechaTareo)
  const day = baseDate.getDay() 
  const diffToMonday = baseDate.getDate() - (day === 0 ? 6 : day - 1)
  const weekDays = []
  const dayNamesShort = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"]
  
  for (let i = 0; i < 6; i++) {
    const d = new Date(new Date(fechaTareo).setDate(diffToMonday + i))
    weekDays.push({
      date: d.toISOString().split("T")[0],
      label: dayNamesShort[i],
      dayNum: d.getDate()
    })
  }

  const filteredWorkers = workers.filter(w => 
    w.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (w.codigo || w.id).toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getDayTotal = (workerId, date) => {
    const reg = registros.find(r => r.workerId === workerId && r.date === date)
    if (!reg) return { hn: 0, he: 0 }
    return reg.assignments.reduce((sum, a) => ({
      hn: sum.hn + (a.horasNormales || 0),
      he: sum.he + (a.horasExtras || 0)
    }), { hn: 0, he: 0 })
  }

  const handleSaveDay = async () => {
    if (!selectedDay || !newActivity) return

    const { workerId, date } = selectedDay
    const worker = workers.find(w => w.id === workerId)
    
    // Check if record exists for that day
    const existingIdx = registros.findIndex(r => r.workerId === workerId && r.date === date)
    let updatedReg = existingIdx >= 0 ? JSON.parse(JSON.stringify(registros[existingIdx])) : {
      workerId,
      workerNombre: worker.nombre,
      date,
      frenteId: null,
      frenteNombre: null,
      assignments: [],
      timestamp: new Date().toLocaleTimeString("es-PE")
    }

    updatedReg.assignments.push({
      actividadId: newActivity.value,
      partidaId: newActivity.partidaId,
      horasNormales: parseFloat(newHn) || 0,
      horasExtras: parseFloat(newHe) || 0
    })

    try {
      if (existingIdx >= 0 && updatedReg.id) {
        await updateRegistro(updatedReg, { source: "weekly_control_edit" })
      } else {
        const dbId = await insertRegistro(updatedReg)
        if (dbId) updatedReg.id = dbId
      }
      
      if (existingIdx >= 0) {
        const newRegs = [...registros]
        newRegs[existingIdx] = updatedReg
        setRegistros(newRegs)
      } else {
        setRegistros(prev => [...prev, updatedReg])
      }
      
      setSelectedDay(null)
      setNewActivity(null)
      setNewHn(0)
      setNewHe(0)
    } catch (err) {
      alert("Error guardando registro")
    }
  }

  return (
    <div className="weekly-control-container">
      <div className="search-container" style={{ marginBottom: 20 }}>
        <SearchIcon />
        <input 
          type="text" 
          placeholder="Buscar trabajador para tarear semana..." 
          className="search-input"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="worker-cards-list" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filteredWorkers.slice(0, 15).map(w => (
          <div key={w.id} className="worker-weekly-card card">
            <div className="worker-card-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div className="worker-name" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>
                  {w.nombre}
                </div>
                <div className="worker-cat" style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.5px' }}>
                  {w.categoria?.toUpperCase() || "PEÓN"} • <span className="mono" style={{ color: 'var(--accent-gold)' }}>{w.codigo || w.id}</span>
                </div>
              </div>
              <div className="worker-total-week mono" style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>TOTAL SEMANA</div>
                <div style={{ fontSize: 16, color: 'var(--accent-blue)', fontWeight: 800 }}>
                  {weekDays.reduce((sum, d) => sum + getDayTotal(w.id, d.date).hn, 0)}h
                </div>
              </div>
            </div>

            <div className="week-grid-compact" style={{ display: 'flex', gap: 4, width: '100%', overflowX: 'auto', paddingBottom: 4 }}>
              {weekDays.map(day => {
                const totals = getDayTotal(w.id, day.date)
                const isActive = selectedDay?.workerId === w.id && selectedDay?.date === day.date
                const hasHours = totals.hn > 0 || totals.he > 0
                
                return (
                  <button 
                    key={day.date}
                    onClick={() => setSelectedDay({ workerId: w.id, date: day.date })}
                    className={`day-pill ${isActive ? 'active' : ''} ${hasHours ? 'has-hours' : ''}`}
                    style={{ 
                      flex: 1, 
                      minWidth: '50px',
                      background: isActive ? 'var(--accent-blue)' : (hasHours ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-card)'),
                      border: '1px solid ' + (isActive ? 'var(--accent-blue)' : 'var(--border-dim)'),
                      borderRadius: '12px',
                      padding: '8px 4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontSize: 9, color: isActive ? 'white' : 'var(--text-dim)', fontWeight: 700 }}>{day.label} {day.dayNum}</div>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: isActive ? 'white' : (hasHours ? 'var(--text-main)' : 'var(--text-dim)') }}>
                      {totals.hn || '0'}
                    </div>
                    {totals.he > 0 && <div className="mono" style={{ fontSize: 9, color: isActive ? 'white' : '#ef4444' }}>+{totals.he}</div>}
                  </button>
                )
              })}
            </div>

            {/* Expanded Day Entry */}
            {selectedDay?.workerId === w.id && (
              <div className="day-entry-overlay" style={{ marginTop: 16, padding: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: '1px dashed var(--accent-blue)' }}>
                <div className="label" style={{ marginBottom: 12, color: 'var(--accent-blue)' }}>
                  AGREGAR TAREA: {weekDays.find(d => d.date === selectedDay.date)?.label} {weekDays.find(d => d.date === selectedDay.date)?.dayNum}
                </div>
                
                <div style={{ marginBottom: 12 }}>
                  <label className="field-label-sm">Actividad</label>
                  <Select
                    options={actividades.map(a => ({ value: a.id, label: `${a.id} - ${a.nombre}`, partidaId: a.partidaId }))}
                    value={newActivity}
                    onChange={setNewActivity}
                    styles={selectStyles}
                    placeholder="Seleccione..."
                  />
                </div>

                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label className="field-label-sm">Horas Normales</label>
                    <input type="number" className="input-field" value={newHn} onChange={e => setNewHn(e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="field-label-sm">Horas Extras</label>
                    <input type="number" className="input-field" value={newHe} onChange={e => setNewHe(e.target.value)} style={{ borderColor: '#ef4444' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleSaveDay} className="btn-primary" style={{ flex: 1 }}>
                    <CheckIcon /> GUARDAR DÍA
                  </button>
                  <button onClick={() => setSelectedDay(null)} className="btn-pill-sm" style={{ padding: '0 16px' }}>
                    CANCELAR
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {filteredWorkers.length === 0 && (
          <div className="empty-state">No se encontró personal con "{searchQuery}"</div>
        )}
      </div>

      <style jsx>{`
        .day-pill:hover:not(.active) {
          background: rgba(255,255,255,0.05) !important;
          transform: translateY(-2px);
        }
        .day-pill.active {
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
        }
      `}</style>
    </div>
  )
}
