import { useState } from "react"
import { SearchIcon, CheckIcon } from "./Icons"
import Select from "react-select"
import { insertRegistro } from "../utils/supabaseClient"
import { selectStyles } from "../utils/selectTheme"
import { getWeekRange } from "../utils/dateUtils"

export default function WeeklyControl({ 
  workers, partidas, actividades, frentes, 
  registros, setRegistros, fechaTareo 
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDay, setSelectedDay] = useState(null) // { workerId, date }
  const [newActivity, setNewActivity] = useState(null)
  const [newHn, setNewHn] = useState(0)
  const [newHe, setNewHe] = useState(0)

  // Calculate current week range (Mon-Sat) — usando hora local para evitar bug UTC
  const dayNamesShort = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"]
  const { dates: weekDates } = getWeekRange(fechaTareo)
  const weekDays = weekDates.map((date, i) => {
    const d = new Date(date + "T12:00:00")
    return { date, label: dayNamesShort[i], dayNum: d.getDate() }
  })

  const filteredWorkers = workers.filter(w => 
    w.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (w.codigo || w.id).toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getDayRecords = (workerId, date) => (
    registros.filter(r => String(r.workerId) === String(workerId) && r.date === date)
  )

  const getDayTotal = (workerId, date) => {
    return getDayRecords(workerId, date).reduce((regSum, reg) => (
      reg.assignments.reduce((sum, a) => ({
        hn: sum.hn + (a.horasNormales || 0),
        he: sum.he + (a.horasExtras || 0)
      }), regSum)
    ), { hn: 0, he: 0 })
  }

  const handleSaveDay = async () => {
    if (!selectedDay || !newActivity) return

    const { workerId, date } = selectedDay
    const worker = workers.find(w => w.id === workerId)
    if (!worker) return

    const newReg = {
      workerId,
      workerNombre: worker.nombre,
      date,
      frenteId: null,
      frenteNombre: null,
      assignments: [{
        actividadId: newActivity.value,
        partidaId: newActivity.partidaId,
        horasNormales: parseFloat(newHn) || 0,
        horasExtras: parseFloat(newHe) || 0
      }],
      timestamp: new Date().toLocaleTimeString("es-PE")
    }

    try {
      const result = await insertRegistro(newReg)
      if (result?.id) newReg.id = result.id
      if (result?.syncStatus) newReg.syncStatus = result.syncStatus
      setRegistros(prev => [...prev, newReg])
      
      setSelectedDay(null)
      setNewActivity(null)
      setNewHn(0)
      setNewHe(0)
    } catch (err) {
      alert("No se pudo guardar el registro.")
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

      <div className="worker-cards-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredWorkers.slice(0, 50).map(w => (
          <div key={w.id} className="worker-weekly-card card" style={{ marginBottom: 0, padding: '12px 16px' }}>
            {/* Header: nombre + meta en una sola fila */}
            <div className="worker-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                  {w.nombre}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {w.categoria?.toUpperCase() || "PEÓN"}
                </span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--accent-gold)', whiteSpace: 'nowrap' }}>
                  {w.codigo || w.id}
                </span>
              </div>
              <div className="mono" style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                {(() => {
                  const weekTotals = weekDays.reduce((sum, d) => {
                    const current = getDayTotal(w.id, d.date)
                    return {
                      hn: sum.hn + current.hn,
                      he: sum.he + current.he
                    }
                  }, { hn: 0, he: 0 })

                  return (
                    <>
                      <div>
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>SEM </span>
                        <span style={{ fontSize: 15, color: 'var(--accent-blue)', fontWeight: 800 }}>
                          {weekTotals.hn + weekTotals.he}h
                        </span>
                      </div>
                      {weekTotals.he > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--red-accent)' }}>HE {weekTotals.he}h</div>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>

            <div className="week-grid-compact" style={{ display: 'flex', gap: 4, width: '100%', overflowX: 'auto', paddingBottom: 2 }}>
              {weekDays.map(day => {
                const totals = getDayTotal(w.id, day.date)
                const isActive = selectedDay?.workerId === w.id && selectedDay?.date === day.date
                const hasHours = totals.hn > 0 || totals.he > 0

                return (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDay({ workerId: w.id, date: day.date })}
                    style={{
                      flex: 1,
                      minWidth: '46px',
                      background: isActive ? 'var(--accent-blue)' : (hasHours ? 'rgba(37, 99, 235, 0.1)' : 'rgba(255,255,255,0.03)'),
                      border: '1px solid ' + (isActive ? 'var(--accent-blue)' : (hasHours ? 'rgba(37,99,235,0.3)' : 'var(--border-dim)')),
                      borderRadius: '8px',
                      padding: '5px 2px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: 9, color: isActive ? 'white' : 'var(--text-dim)', fontWeight: 700 }}>{day.label} {day.dayNum}</div>
                    <div className="mono" style={{ fontSize: 12, fontWeight: 800, color: isActive ? 'white' : (hasHours ? 'var(--text-main)' : 'var(--text-dim)') }}>
                      {totals.hn || '—'}
                    </div>
                    {totals.he > 0 && <div className="mono" style={{ fontSize: 9, color: isActive ? 'white' : 'var(--red-accent)' }}>+{totals.he}</div>}
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

                {(() => {
                  const dayRecords = getDayRecords(w.id, selectedDay.date)
                  const dayAssignments = dayRecords.flatMap(reg => reg.assignments || [])

                  if (dayAssignments.length === 0) return null

                  return (
                    <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dim)' }}>
                      <div className="field-label-sm" style={{ marginBottom: 8 }}>
                        REGISTROS EXISTENTES ({dayRecords.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {dayAssignments.map((assignment, index) => {
                          const actividad = actividades.find(a => a.id === assignment.actividadId)
                          const total = (assignment.horasNormales || 0) + (assignment.horasExtras || 0)
                          return (
                            <span key={`${assignment.actividadId}-${index}`} className="hora-badge">
                              <span style={{ color: 'var(--accent-blue)' }}>{total}h</span>
                              <span style={{ opacity: 0.35 }}>|</span>
                              <span>{actividad?.nombre || assignment.actividadId}</span>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
                
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
                    <CheckIcon /> AGREGAR REGISTRO
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
