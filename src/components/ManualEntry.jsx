import { useState } from "react"
import Select from "react-select"
import { PlusIcon, TrashIcon } from "./Icons"
import { insertRegistro } from "../utils/supabaseClient"
import { getNormalHourCap } from "../utils/tareoLogic"
import { selectStyles } from "../utils/selectTheme"

export default function ManualEntry({ workers, partidas, actividades, frentes, setRegistros, fechaTareo }) {
  const cap = getNormalHourCap(fechaTareo)
  const [manualWorker, setManualWorker] = useState(null)
  const [manualFrente, setManualFrente] = useState(null)
  const [manualEntries, setManualEntries] = useState([{ actividad: null, horasNormales: cap, horasExtras: "" }])
  const [feedbackMessage, setFeedbackMessage] = useState(null)

  const workerOptions = workers.map(w => ({ value: w.id, label: w.nombre }))
  const frenteOptions = frentes.map(f => ({ value: f.id, label: `${f.id} - ${f.nombre}` }))
  const actividadOptions = actividades.map(a => ({ value: a.id, label: a.nombre }))

  const showFeedback = (type, message) => {
    setFeedbackMessage({ type, message })
    setTimeout(() => setFeedbackMessage(null), 4000)
  }

  const addManualEntry = async () => {
    if (!manualWorker) {
      showFeedback("error", "Faltan datos. Requerido: 1) Trabajador")
      return
    }
    const worker = workers.find((w) => String(w.id) === String(manualWorker.value))
    if (!worker) return

    const validEntries = manualEntries.filter(
      (e) => e.actividad && (parseFloat(e.horasNormales) > 0 || parseFloat(e.horasExtras) > 0)
    )

    if (validEntries.length === 0) {
      showFeedback("error", "Faltan datos. Requerido: 2) Actividad y 3) Horas (mayor a 0)")
      return
    }

    const frente = manualFrente ? frentes.find((f) => f.id === manualFrente.value) : null

    const newReg = {
      id: Date.now(),
      workerId: worker.id,
      workerNombre: worker.nombre,
      frenteId: frente?.id || null,
      frenteNombre: frente?.nombre || null,
      assignments: validEntries.map((e) => {
        const act = actividades.find(a => a.id === e.actividad.value)
        return {
          actividadId: act.id,
          partidaId: act?.partidaId || null,
          horasNormales: parseFloat(e.horasNormales) || 0,
          horasExtras: parseFloat(e.horasExtras) || 0,
        }
      }),
      date: fechaTareo,
      timestamp: new Date().toLocaleTimeString("es-PE"),
      raw: "Ingreso manual",
    }

    try {
      const result = await insertRegistro(newReg)
      if (result?.id) newReg.id = result.id
      if (result?.syncStatus) newReg.syncStatus = result.syncStatus

      setRegistros((prev) => [...prev, newReg])
      setManualEntries([{ actividad: null, horasNormales: "", horasExtras: "" }])
      setManualWorker(null)
      
      showFeedback(
        "success",
        result?.syncStatus === "synced"
          ? `✓ Registro guardado para ${worker.nombre}`
          : `✓ Registro guardado localmente para ${worker.nombre}. Se sincronizará cuando vuelva internet.`
      )
    } catch (e) {
      showFeedback("error", "No se pudo guardar el registro.")
    }
  }

  return (
    <div className="card">
      <div className="label" style={{ marginBottom: 16 }}>INGRESO MANUAL DE HORAS</div>

      {feedbackMessage && (
        <div className={`feedback-banner ${feedbackMessage.type}`} style={{ marginBottom: 16, padding: "10px", borderRadius: "4px" }}>
          {feedbackMessage.message}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label className="field-label">Trabajador</label>
          <Select
            options={workerOptions}
            value={manualWorker}
            onChange={setManualWorker}
            placeholder="Buscar trabajador..."
            styles={selectStyles}
            isClearable
          />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label className="field-label">Frente / Sector</label>
          <Select
            options={frenteOptions}
            value={manualFrente}
            onChange={setManualFrente}
            placeholder="Seleccionar frente..."
            styles={selectStyles}
            isClearable
          />
        </div>
      </div>

      {manualEntries.map((entry, idx) => (
        <div key={idx} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <label className="field-label-sm">Actividad</label>
            <Select
              options={actividadOptions}
              value={entry.actividad}
              onChange={(selectedOption) => {
                const updated = [...manualEntries]
                updated[idx].actividad = selectedOption
                setManualEntries(updated)
              }}
              placeholder="Buscar actividad..."
              styles={selectStyles}
              isClearable
            />
          </div>
          <div style={{ flex: 1, minWidth: 80 }}>
            <label className="field-label-sm">Horas Norm.</label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={entry.horasNormales}
              onChange={(e) => {
                const updated = [...manualEntries]
                updated[idx].horasNormales = e.target.value
                setManualEntries(updated)
              }}
              placeholder="0"
              className="input-field mono"
            />
          </div>
          <div style={{ flex: 1, minWidth: 80 }}>
            <label className="field-label-sm" style={{ color: "#e88" }}>Horas Ext.</label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={entry.horasExtras}
              onChange={(e) => {
                const updated = [...manualEntries]
                updated[idx].horasExtras = e.target.value
                setManualEntries(updated)
              }}
              placeholder="0"
              className="input-field mono"
            />
          </div>
          {manualEntries.length > 1 && (
            <button
              onClick={() => setManualEntries(manualEntries.filter((_, i) => i !== idx))}
              className="btn-icon-danger"
              style={{ padding: "10px 4px", alignSelf: "center", marginBottom: "4px" }}
            >
              <TrashIcon />
            </button>
          )}
        </div>
      ))}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button
          onClick={() => setManualEntries([...manualEntries, { actividad: null, horasNormales: cap, horasExtras: "" }])}
          className="btn-dashed"
        >
          <PlusIcon /> Otra actividad
        </button>
        <button onClick={addManualEntry} className="btn-primary" style={{ marginLeft: "auto" }}>
          Registrar
        </button>
      </div>
    </div>
  )
}
