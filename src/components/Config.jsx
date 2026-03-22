import { useState, useRef } from "react"
import Select from "react-select"
import { PlusIcon, TrashIcon, UploadIcon } from "./Icons"
import {
  parsePersonalXLSX,
  parsePartidasFromXLS,
  parsePartidasProyectoXLS,
  parseTipoHoraFromXLS,
  mergeWorkers,
  readFileAsArrayBuffer,
} from "../utils/s10Importer"

export default function Config({
  workers, setWorkers,
  partidas, setPartidas,
  frentes, setFrentes,
  actividades, setActividades,
  tiposHora, setTiposHora,
  projectConfig, setProjectConfig,
}) {
  const [newWorkerName, setNewWorkerName] = useState("")
  const [newPartidaId, setNewPartidaId] = useState("")
  const [newPartidaNombre, setNewPartidaNombre] = useState("")
  const [newActividadNombre, setNewActividadNombre] = useState("")
  const [newActividadPartida, setNewActividadPartida] = useState(null)
  const [newFrenteId, setNewFrenteId] = useState("")
  const [newFrenteNombre, setNewFrenteNombre] = useState("")
  const [importFeedback, setImportFeedback] = useState(null)
  const [importMode, setImportMode] = useState("merge") // "merge" or "replace"
  
  // Selection States for Batch Delete
  const [selectedWorkers, setSelectedWorkers] = useState([])
  const [selectedPartidas, setSelectedPartidas] = useState([])
  const [selectedActividades, setSelectedActividades] = useState([])
  const [isCompactMode, setIsCompactMode] = useState(true)

  const personalFileRef = useRef(null)
  const partidasFileRef = useRef(null)
  const modeloFileRef = useRef(null)

  const showFeedback = (msg, type = "success") => {
    setImportFeedback({ message: msg, type })
    setTimeout(() => setImportFeedback(null), 5000)
  }

  // --- Import Logic (Same as before) ---
  const handleImportPersonal = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buffer = await readFileAsArrayBuffer(file)
      const imported = parsePersonalXLSX(buffer)
      if (imported.length === 0) {
        showFeedback("No se encontraron trabajadores en el archivo", "error")
        return
      }
      const isReplace = importMode === "replace"
      const result = isReplace ? imported : mergeWorkers(workers, imported)
      setWorkers(result)
      showFeedback(isReplace ? `✓ Cargados ${result.length} trabajadores.` : `✓ Sincronizados ${imported.length} trabajadores.`)
    } catch (err) {
      showFeedback(`Error: ${err.message}`, "error")
    }
    e.target.value = ""
  }

  const handleImportPartidas = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buffer = await readFileAsArrayBuffer(file)
      let imported = parsePartidasProyectoXLS(buffer)
      if (imported.length === 0) imported = parsePartidasFromXLS(buffer)
      if (imported.length === 0) { showFeedback("No se encontraron partidas", "error"); return; }
      setPartidas(imported)
      showFeedback(`✓ ${imported.length} partidas importadas.`)
    } catch (err) {
      showFeedback(`Error: ${err.message}`, "error")
    }
    e.target.value = ""
  }

  const handleImportModelo = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buffer = await readFileAsArrayBuffer(file)
      const importedPartidas = parsePartidasFromXLS(buffer)
      if (importedPartidas.length > 0) setPartidas(importedPartidas)
      const importedTipos = parseTipoHoraFromXLS(buffer)
      if (importedTipos.length > 0) setTiposHora(importedTipos)
      showFeedback(`✓ Modelo ${file.name} cargado.`)
    } catch (err) {
      showFeedback(`Error: ${err.message}`, "error")
    }
    e.target.value = ""
  }

  // --- Deletion Logic ---
  const deleteSelectedWorkers = () => {
    setWorkers(prev => prev.filter(w => !selectedWorkers.includes(w.id)))
    setSelectedWorkers([])
    showFeedback("Trabajadores eliminados")
  }

  const deleteSelectedPartidas = () => {
    setPartidas(prev => prev.filter(p => !selectedPartidas.includes(p.id)))
    setSelectedPartidas([])
    showFeedback("Partidas eliminadas")
  }

  const deleteSelectedActividades = () => {
    setActividades(prev => prev.filter(a => !selectedActividades.includes(a.id)))
    setSelectedActividades([])
    showFeedback("Actividades eliminadas")
  }

  return (
    <div className="config-container">
      {/* Feedback */}
      {importFeedback && (
        <div className={`alert-${importFeedback.type === "error" ? "error" : "success"}`} style={{ marginBottom: 16 }}>
          {importFeedback.message}
        </div>
      )}

      {/* S10 Import Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 16 }}>SISTEMA S10 - IMPORTACIÓN</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={() => personalFileRef.current?.click()} className="btn-import" style={{ flex: 1 }}>
            <UploadIcon /> Personal
          </button>
          <button onClick={() => partidasFileRef.current?.click()} className="btn-import" style={{ flex: 1 }}>
            <UploadIcon /> Partidas
          </button>
          <button onClick={() => modeloFileRef.current?.click()} className="btn-import" style={{ flex: 1 }}>
            <UploadIcon /> Modelo TMO
          </button>
        </div>
        <input ref={personalFileRef} type="file" hidden onChange={handleImportPersonal} />
        <input ref={partidasFileRef} type="file" hidden onChange={handleImportPartidas} />
        <input ref={modeloFileRef} type="file" hidden onChange={handleImportModelo} />
      </div>

      {/* Workers Management Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span>TRABAJADORES ({workers.length})</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={() => setIsCompactMode(!isCompactMode)}
              className="btn-pill-sm"
              style={{ background: isCompactMode ? 'var(--accent-blue)' : 'transparent' }}
            >
              {isCompactMode ? "MODO COMPACTO" : "VER CÓDIGOS"}
            </button>
            {selectedWorkers.length > 0 && (
              <button onClick={deleteSelectedWorkers} className="btn-pill-danger">
                ELIMINAR ({selectedWorkers.length})
              </button>
            )}
          </div>
        </div>

        <div style={{ maxHeight: 400, overflowY: 'auto', marginBottom: 16, border: '1px solid var(--border-dim)', borderRadius: 8 }}>
          <table className="summary-table" style={{ margin: 0 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                {!isCompactMode && <th>CÓDIGO</th>}
                <th>NOMBRES Y APELLIDOS</th>
                <th style={{ textAlign: 'right' }}>
                  <input 
                    type="checkbox" 
                    onChange={e => setSelectedWorkers(e.target.checked ? workers.map(w => w.id) : [])}
                    checked={selectedWorkers.length === workers.length && workers.length > 0}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {workers.map(w => (
                <tr key={w.id} className={selectedWorkers.includes(w.id) ? 'row-selected' : ''}>
                  {!isCompactMode && <td className="mono" style={{ fontSize: 11, color: 'var(--accent-gold)' }}>{w.codigo || w.id}</td>}
                  <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{w.nombre}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedWorkers.includes(w.id)}
                      onChange={() => setSelectedWorkers(prev => prev.includes(w.id) ? prev.filter(id => id !== w.id) : [...prev, w.id])}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {workers.length === 0 && <div className="empty-state">No hay trabajadores registrados.</div>}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            value={newWorkerName}
            onChange={(e) => setNewWorkerName(e.target.value)}
            placeholder="Nuevo trabajador..."
            className="input-field"
            style={{ flex: 1 }}
          />
          <button
            onClick={() => {
              if (!newWorkerName.trim()) return
              setWorkers([...workers, { id: String(Date.now()), nombre: newWorkerName.trim(), categoria: "peon", costoHora: 62.80 }])
              setNewWorkerName("")
            }}
            className="btn-primary"
          >
            <PlusIcon /> AGREGAR
          </button>
        </div>
      </div>

      {/* Partidas Section */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span>PARTIDAS DE CONTROL ({partidas.length})</span>
          {selectedPartidas.length > 0 && (
            <button onClick={deleteSelectedPartidas} className="btn-pill-danger">
              ELIMINAR ({selectedPartidas.length})
            </button>
          )}
        </div>
        
        <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16, border: '1px solid var(--border-dim)', borderRadius: 8 }}>
          {partidas.map(p => (
            <div key={p.id} className="config-item-row" style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-dim)' }}>
              <span className="mono" style={{ color: 'var(--accent-gold)', width: 100, fontSize: 11 }}>{p.id}</span>
              <span style={{ flex: 1, fontWeight: 500 }}>{p.nombre}</span>
              <input 
                type="checkbox" 
                checked={selectedPartidas.includes(p.id)}
                onChange={() => setSelectedPartidas(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])}
              />
            </div>
          ))}
          {partidas.length === 0 && <div className="empty-state">No hay partidas registradas.</div>}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            value={newPartidaId}
            onChange={(e) => setNewPartidaId(e.target.value)}
            placeholder="Cód."
            className="input-field mono"
            style={{ width: 100 }}
          />
          <input
            type="text"
            value={newPartidaNombre}
            onChange={(e) => setNewPartidaNombre(e.target.value)}
            placeholder="Nombre partida..."
            className="input-field"
            style={{ flex: 1 }}
          />
          <button
            onClick={() => {
              if (!newPartidaId.trim() || !newPartidaNombre.trim()) return
              setPartidas([...partidas, { id: newPartidaId.trim(), nombre: newPartidaNombre.trim() }])
              setNewPartidaId(""); setNewPartidaNombre("")
            }}
            className="btn-primary"
          >
            <PlusIcon /> AGREGAR
          </button>
        </div>
      </div>

      {/* Project Config (Compact) */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 16 }}>DATOS DEL PROYECTO</div>
        <div className="desktop-grid">
           <div>
             <label className="field-label-sm">Empresa / Obra</label>
             <input type="text" value={projectConfig.empresa} onChange={e => setProjectConfig({...projectConfig, empresa: e.target.value})} className="input-field" style={{ width: '100%' }} />
           </div>
           <div>
             <label className="field-label-sm">Código Proyecto</label>
             <input type="text" value={projectConfig.codigoProyecto} onChange={e => setProjectConfig({...projectConfig, codigoProyecto: e.target.value})} className="input-field mono" style={{ width: '100%' }} />
           </div>
        </div>
      </div>

      {/* AI Config */}
      <div className="card">
        <div className="label" style={{ marginBottom: 16, color: 'var(--accent-blue)' }}>CONFIGURACIÓN DEL ASISTENTE IA</div>
        <p style={{ fontSize: '11px', color: 'var(--accent-blue)', fontWeight: '600', marginBottom: 12 }}>
          🚀 El Asistente IA es gratuito. Solo necesitas pegar tu **Gemini API Key** para activarlo.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="password"
            defaultValue={localStorage.getItem("gemini_api_key") || ""}
            onChange={(e) => {
              localStorage.setItem("gemini_api_key", e.target.value)
              showFeedback("✓ API Key guardada con éxito")
            }}
            placeholder="Pega una API Key personalizada si deseas cambiarla..."
            className="input-field mono"
            style={{ flex: 1, fontSize: '12px', background: 'rgba(37, 99, 235, 0.05)' }}
          />
        </div>
      </div>
    </div>
  )
}
