import { useState } from "react"
import { PlusIcon, TrashIcon } from "./Icons"
import { insertRegistro } from "../utils/supabaseClient"

export default function ManualEntry({ workers, partidas, actividades, frentes, setRegistros, fechaTareo }) {
  const [manualWorker, setManualWorker] = useState("")
  const [manualFrente, setManualFrente] = useState("")
  const [manualEntries, setManualEntries] = useState([{ actividadId: "", horasNormales: "", horasExtras: "" }])
  const [feedbackMessage, setFeedbackMessage] = useState(null)

  const showFeedback = (type, message) => {
    setFeedbackMessage({ type, message })
    setTimeout(() => setFeedbackMessage(null), 4000)
  }

  const addManualEntry = async () => {
    if (!manualWorker) {
      showFeedback("error", "Faltan datos. Requerido: 1) Trabajador")
      return
    }
    const worker = workers.find((w) => String(w.id) === String(manualWorker))
    if (!worker) return

    const validEntries = manualEntries.filter(
      (e) => e.actividadId && (parseFloat(e.horasNormales) > 0 || parseFloat(e.horasExtras) > 0)
    )

    if (validEntries.length === 0) {
      showFeedback("error", "Faltan datos. Requerido: 2) Actividad y 3) Horas (mayor a 0)")
      return
    }

    const frente = frentes.find((f) => f.id === manualFrente)

    const newReg = {
      id: Date.now(),
      workerId: worker.id,
      workerNombre: worker.nombre,
      frenteId: frente?.id || null,
      frenteNombre: frente?.nombre || null,
      assignments: validEntries.map((e) => {
        const act = actividades.find(a => a.id === e.actividadId)
        return {
          actividadId: e.actividadId,
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
      const dbId = await insertRegistro(newReg)
      if (dbId) newReg.id = dbId

      setRegistros((prev) => [...prev, newReg])
      setManualEntries([{ actividadId: "", horasNormales: "", horasExtras: "" }])
      setManualWorker("")
      
      showFeedback("success", `✓ Registro guardado para ${worker.nombre}`)
    } catch (e) {
      showFeedback("error", "Error al guardar en la nube (Verifique su conexión)")
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
          <select
            value={manualWorker}
            onChange={(e) => setManualWorker(e.target.value)}
            className="input-field"
          >
            <option value="">Seleccionar trabajador...</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>{w.nombre}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label className="field-label">Frente / Sector</label>
          <select
            value={manualFrente}
            onChange={(e) => setManualFrente(e.target.value)}
            className="input-field"
          >
            <option value="">Sin frente</option>
            {frentes.map((f) => (
              <option key={f.id} value={f.id}>{f.id} - {f.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {manualEntries.map((entry, idx) => (
        <div key={idx} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <label className="field-label-sm">Actividad</label>
            <select
              value={entry.actividadId}
              onChange={(e) => {
                const updated = [...manualEntries]
                updated[idx].actividadId = e.target.value
                setManualEntries(updated)
              }}
              className="input-field"
            >
              <option value="">Seleccionar...</option>
              {actividades.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
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
              style={{ padding: "10px 4px" }}
            >
              <TrashIcon />
            </button>
          )}
        </div>
      ))}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button
          onClick={() => setManualEntries([...manualEntries, { actividadId: "", horasNormales: "", horasExtras: "" }])}
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
