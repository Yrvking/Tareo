import { useState } from "react"
import { SearchIcon, CheckIcon, PencilIcon } from "./Icons"
import Select from "react-select"
import { insertRegistro, updateRegistro } from "../utils/supabaseClient"
import { selectStyles } from "../utils/selectTheme"
import { getWeekRange } from "../utils/dateUtils"
import { getWorkerCategoryLabel } from "../utils/workerCategory"
import { getNormalHourCap, getExtraHourCap } from "../utils/tareoLogic"

export default function WeeklyControl({ 
  workers, partidas, actividades, setActividades, frentes, 
  registros, setRegistros, fechaTareo 
}) {
  const normalCap = getNormalHourCap(fechaTareo)
  const extraCap = getExtraHourCap(fechaTareo)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDay, setSelectedDay] = useState(null) // { workerId, date }
  const [newActivity, setNewActivity] = useState(null)
  const [newHn, setNewHn] = useState(0)
  const [newHe, setNewHe] = useState(0)
  const [feedbackMessage, setFeedbackMessage] = useState(null)
  const [editingAssignment, setEditingAssignment] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  const partidaOptions = partidas.map((partida) => ({
    value: partida.id,
    label: `${partida.id} - ${partida.nombre}`,
    nombre: partida.nombre,
  }))

  const showFeedback = (type, message) => {
    setFeedbackMessage({ type, message })
    setTimeout(() => setFeedbackMessage(null), 4000)
  }

  const getPartidaById = (partidaId) => partidas.find((partida) => String(partida.id) === String(partidaId))
  const getActividadById = (actividadId) => actividades.find((actividad) => String(actividad.id) === String(actividadId))

  const buildSyntheticActivity = (partida) => ({
    id: `PARTIDA-${partida.id}`,
    nombre: partida.nombre,
    partidaId: partida.id,
  })

  const buildActivityOption = (actividad) => ({
    value: actividad.id,
    label: `${actividad.id} - ${actividad.nombre}`,
    partidaId: actividad.partidaId,
    nombre: actividad.nombre,
  })

  const getActivityOptionsForPartida = (partidaId) => {
    const matchedActivities = actividades
      .filter((actividad) => String(actividad.partidaId) === String(partidaId))
      .map(buildActivityOption)

    if (matchedActivities.length > 0) return matchedActivities

    const partida = getPartidaById(partidaId)
    if (!partida) return []
    return [buildActivityOption(buildSyntheticActivity(partida))]
  }

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

  const resetDayEntry = () => {
    setSelectedDay(null)
    setNewActivity(null)
    setNewHn(0)
    setNewHe(0)
    setEditingAssignment(null)
  }

  const getDayTotal = (workerId, date) => {
    return getDayRecords(workerId, date).reduce((regSum, reg) => (
      reg.assignments.reduce((sum, a) => ({
        hn: sum.hn + (a.horasNormales || 0),
        he: sum.he + (a.horasExtras || 0)
      }), regSum)
    ), { hn: 0, he: 0 })
  }

  const handleSaveDay = async () => {
    if (isSaving || !selectedDay || !newActivity) return

    const { workerId, date } = selectedDay
    const worker = workers.find(w => w.id === workerId)
    if (!worker) return

    setIsSaving(true)
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
      const savedReg = result?.record ? { ...newReg, ...result.record } : { ...newReg }
      if (result?.id) savedReg.id = result.id
      if (result?.syncStatus) savedReg.syncStatus = result.syncStatus
      setRegistros(prev => [...prev, savedReg])
      resetDayEntry()
      showFeedback("success", `Registro agregado para ${worker.nombre}.`)
    } catch (err) {
      showFeedback("error", err.message || "No se pudo guardar el registro.")
    } finally {
      setIsSaving(false)
    }
  }

  const startEditingAssignment = (record, assignment, assignmentIndex) => {
    const partidaId = assignment?.partidaId || getActividadById(assignment?.actividadId)?.partidaId || ""
    const selectedPartida = getPartidaById(partidaId)
    const partidaOption = selectedPartida
      ? {
          value: selectedPartida.id,
          label: `${selectedPartida.id} - ${selectedPartida.nombre}`,
          nombre: selectedPartida.nombre,
        }
      : null

    const activityOptions = getActivityOptionsForPartida(partidaId)
    const currentActivity = activityOptions.find((option) => String(option.value) === String(assignment?.actividadId)) || activityOptions[0] || null

    setEditingAssignment({
      recordId: record.id,
      assignmentIndex,
      partidaOption,
      activityOption: currentActivity,
      horasNormales: String(assignment?.horasNormales ?? 0),
      horasExtras: String(assignment?.horasExtras ?? 0),
    })
  }

  const handleEditingPartidaChange = (selectedPartida) => {
    const nextActivity = selectedPartida ? getActivityOptionsForPartida(selectedPartida.value)[0] || null : null
    setEditingAssignment((prev) => (
      prev
        ? {
            ...prev,
            partidaOption: selectedPartida,
            activityOption: nextActivity,
          }
        : prev
    ))
  }

  const handleSaveAssignmentEdit = async () => {
    if (isSaving || !editingAssignment?.recordId || editingAssignment.assignmentIndex == null) return
    if (!editingAssignment.partidaOption || !editingAssignment.activityOption) {
      showFeedback("error", "Selecciona la nueva partida y actividad.")
      return
    }

    const targetRecord = registros.find((record) => String(record.id) === String(editingAssignment.recordId))
    if (!targetRecord) {
      showFeedback("error", "No se encontró el registro a editar.")
      return
    }

    const selectedPartida = getPartidaById(editingAssignment.partidaOption.value)
    if (!selectedPartida) {
      showFeedback("error", "La partida seleccionada ya no existe.")
      return
    }

    setIsSaving(true)
    const syntheticActivity =
      getActividadById(editingAssignment.activityOption.value) ||
      (String(editingAssignment.activityOption.partidaId) === String(selectedPartida.id)
        ? buildSyntheticActivity(selectedPartida)
        : null)

    const updatedAssignments = (targetRecord.assignments || []).map((assignment, index) => (
      index === editingAssignment.assignmentIndex
        ? {
            ...assignment,
            actividadId: editingAssignment.activityOption.value,
            partidaId: selectedPartida.id,
            horasNormales: parseFloat(editingAssignment.horasNormales) || 0,
            horasExtras: parseFloat(editingAssignment.horasExtras) || 0,
          }
        : assignment
    ))

    const updatedRecord = {
      ...targetRecord,
      assignments: updatedAssignments,
      raw: targetRecord.raw || "Edición manual de asignación",
    }

    try {
      const result = await updateRegistro(updatedRecord, {
        source: "weekly_assignment_edit",
        beforeData: targetRecord,
      })

      const savedRecord = result?.record
        ? { ...updatedRecord, ...result.record }
        : updatedRecord

      if (result?.id) savedRecord.id = result.id
      if (result?.syncStatus) savedRecord.syncStatus = result.syncStatus

      if (syntheticActivity && typeof setActividades === "function") {
        setActividades((prev) => (
          prev.some((activity) => String(activity.id) === String(syntheticActivity.id))
            ? prev
            : [...prev, syntheticActivity]
        ))
      }

      setRegistros((prev) => prev.map((record) => (
        String(record.id) === String(savedRecord.id) ? savedRecord : record
      )))
      setEditingAssignment(null)
      showFeedback("success", `Asignación actualizada a ${selectedPartida.nombre}.`)
    } catch (error) {
      showFeedback("error", error.message || "No se pudo actualizar la asignación.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="weekly-control-container">
      {feedbackMessage && (
        <div className={`feedback-banner ${feedbackMessage.type}`} style={{ marginBottom: 16 }}>
          {feedbackMessage.message}
        </div>
      )}

      <div className="search-container" style={{ marginBottom: 20 }}>
        <SearchIcon />
        <input 
          type="text" 
          placeholder="Buscar trabajador para tarear semana..." 
          className="search-input"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          disabled={isSaving}
        />
      </div>

      <div className="worker-cards-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 24 }}>
        {filteredWorkers.map(w => (
          <div key={w.id} className="worker-weekly-card card" style={{ marginBottom: 0, padding: '12px 16px' }}>
            {/* Header: nombre + meta en una sola fila */}
            <div className="worker-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                  {w.nombre}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {getWorkerCategoryLabel(w, { fallback: "PEÓN" }).toUpperCase()}
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
                    onClick={() => {
                      if (isSaving) return
                      setEditingAssignment(null)
                      setSelectedDay({ workerId: w.id, date: day.date })
                    }}
                    style={{
                      flex: 1,
                      minWidth: '46px',
                      background: isActive ? 'var(--accent-blue)' : (hasHours ? 'rgba(37, 99, 235, 0.1)' : 'rgba(255,255,255,0.03)'),
                      border: '1px solid ' + (isActive ? 'var(--accent-blue)' : (hasHours ? 'rgba(37,99,235,0.3)' : 'var(--border-dim)')),
                      borderRadius: '8px',
                      padding: '5px 2px',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s',
                      textAlign: 'center',
                      opacity: isSaving ? 0.7 : 1
                    }}
                    disabled={isSaving}
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
                  const dayAssignments = dayRecords.flatMap((reg) => (
                    (reg.assignments || []).map((assignment, assignmentIndex) => ({
                      assignment,
                      assignmentIndex,
                      record: reg,
                    }))
                  ))

                  if (dayAssignments.length === 0) return null

                  return (
                    <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dim)' }}>
                      <div className="field-label-sm" style={{ marginBottom: 8 }}>
                        REGISTROS EXISTENTES ({dayRecords.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {dayAssignments.map(({ assignment, assignmentIndex, record }, index) => {
                          const actividad = getActividadById(assignment.actividadId)
                          const partida = getPartidaById(assignment.partidaId || actividad?.partidaId)
                          const total = (assignment.horasNormales || 0) + (assignment.horasExtras || 0)
                          return (
                            <div
                              key={`${record.id || "reg"}-${assignment.actividadId}-${index}`}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 10,
                                flexWrap: 'wrap',
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.06)',
                                background: 'rgba(15,23,42,0.55)',
                                opacity: isSaving ? 0.7 : 1
                              }}
                            >
                              <div style={{ display: 'grid', gap: 3 }}>
                                <div className="hora-badge" style={{ width: 'fit-content' }}>
                                  <span style={{ color: 'var(--accent-blue)' }}>{total}h</span>
                                  <span style={{ opacity: 0.35 }}>|</span>
                                  <span>{actividad?.nombre || assignment.actividadId}</span>
                                </div>
                                <div className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                                  {partida ? `${partida.id} - ${partida.nombre}` : assignment.partidaId || "Sin partida"}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn-pill-sm"
                                onClick={() => !isSaving && startEditingAssignment(record, assignment, assignmentIndex)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                disabled={isSaving}
                              >
                                <PencilIcon /> Editar partida
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {editingAssignment && selectedDay?.workerId === w.id && (
                  <div style={{ marginBottom: 14, padding: '12px', borderRadius: 10, background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.3)' }}>
                    <div className="field-label-sm" style={{ marginBottom: 10, color: 'var(--accent-blue)' }}>
                      EDITAR ASIGNACIÓN EXISTENTE
                    </div>

                    <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label className="field-label-sm">Partida</label>
                        <Select
                          options={partidaOptions}
                          value={editingAssignment.partidaOption}
                          onChange={handleEditingPartidaChange}
                          styles={selectStyles}
                          placeholder="Seleccione partida..."
                          isDisabled={isSaving}
                        />
                      </div>

                      <div>
                        <label className="field-label-sm">Actividad</label>
                        <Select
                          options={getActivityOptionsForPartida(editingAssignment.partidaOption?.value)}
                          value={editingAssignment.activityOption}
                          onChange={(selectedOption) => setEditingAssignment((prev) => prev ? { ...prev, activityOption: selectedOption } : prev)}
                          styles={selectStyles}
                          placeholder="Seleccione actividad..."
                          isDisabled={!editingAssignment.partidaOption || isSaving}
                        />
                      </div>
                    </div>

                    <div className="weekly-hour-grid">
                      <div className="weekly-hour-field">
                        <label className="field-label-sm">Hrs. Normales/Noct. (max {normalCap})</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max={normalCap}
                          className="input-field"
                          value={editingAssignment.horasNormales}
                          onChange={(e) => setEditingAssignment((prev) => prev ? { ...prev, horasNormales: e.target.value } : prev)}
                          style={{ width: '100%', boxSizing: 'border-box' }}
                          disabled={isSaving}
                        />
                      </div>
                      <div className="weekly-hour-field">
                        <label className="field-label-sm">Horas Extras (max {extraCap})</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max={extraCap}
                          className="input-field"
                          value={editingAssignment.horasExtras}
                          onChange={(e) => setEditingAssignment((prev) => prev ? { ...prev, horasExtras: e.target.value } : prev)}
                          style={{ width: '100%', boxSizing: 'border-box', borderColor: '#ef4444' }}
                          disabled={isSaving}
                        />
                      </div>
                    </div>

                    <div className="weekly-action-row">
                      <button 
                        onClick={handleSaveAssignmentEdit} 
                        className="btn-primary weekly-action-primary"
                        disabled={isSaving}
                        style={{ opacity: isSaving ? 0.7 : 1 }}
                      >
                        <CheckIcon /> {isSaving ? "GUARDANDO..." : "GUARDAR CAMBIO"}
                      </button>
                      <button onClick={() => setEditingAssignment(null)} className="btn-pill-sm weekly-action-secondary" disabled={isSaving}>
                        CANCELAR
                      </button>
                    </div>
                  </div>
                )}
                
                <div style={{ marginBottom: 12 }}>
                  <label className="field-label-sm">Actividad</label>
                  <Select
                    options={actividades.map(a => ({ value: a.id, label: `${a.id} - ${a.nombre}`, partidaId: a.partidaId }))}
                    value={newActivity}
                    onChange={setNewActivity}
                    styles={selectStyles}
                    placeholder="Seleccione..."
                    isDisabled={isSaving}
                  />
                </div>

                <div className="weekly-hour-grid">
                  <div className="weekly-hour-field">
                    <label className="field-label-sm">Hrs. Normales/Noct. (max {normalCap})</label>
                    <input type="number" step="0.5" min="0" max={normalCap} className="input-field" value={newHn} onChange={e => setNewHn(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} disabled={isSaving} />
                  </div>
                  <div className="weekly-hour-field">
                    <label className="field-label-sm">Horas Extras (max {extraCap})</label>
                    <input type="number" step="0.5" min="0" max={extraCap} className="input-field" value={newHe} onChange={e => setNewHe(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', borderColor: '#ef4444' }} disabled={isSaving} />
                  </div>
                </div>

                <div className="weekly-action-row">
                  <button 
                    onClick={handleSaveDay} 
                    className="btn-primary weekly-action-primary"
                    disabled={isSaving}
                    style={{ opacity: isSaving ? 0.7 : 1 }}
                  >
                    <CheckIcon /> {isSaving ? "AGREGANDO..." : "AGREGAR REGISTRO"}
                  </button>
                  <button onClick={resetDayEntry} className="btn-pill-sm weekly-action-secondary" disabled={isSaving}>
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
