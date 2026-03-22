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

  const personalFileRef = useRef(null)
  const partidasFileRef = useRef(null)
  const modeloFileRef = useRef(null)

  const showFeedback = (msg, type = "success") => {
    setImportFeedback({ message: msg, type })
    setTimeout(() => setImportFeedback(null), 5000)
  }

  // ─── Import from S10 files ───
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
      const newCount = result.length - (isReplace ? 0 : workers.length)
      const updCount = isReplace ? imported.length : imported.length - Math.max(0, newCount)
      setWorkers(result)
      showFeedback(
        isReplace
          ? `✓ ${result.length} trabajadores cargados (reemplazo completo)`
          : `✓ Actualizado: ${updCount} actualizados, ${Math.max(0, newCount)} nuevos → ${result.length} total`
      )
    } catch (err) {
      showFeedback(`Error al leer archivo: ${err.message}`, "error")
    }
    e.target.value = ""
  }

  const handleImportModelo = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buffer = await readFileAsArrayBuffer(file)

      const importedPartidas = parsePartidasFromXLS(buffer)
      if (importedPartidas.length > 0) {
        setPartidas(importedPartidas)
      }

      const importedTipos = parseTipoHoraFromXLS(buffer)
      if (importedTipos.length > 0) {
        setTiposHora(importedTipos)
      }

      const partsMsg = importedPartidas.length > 0 ? `${importedPartidas.length} partidas` : "0 partidas"
      const tiposMsg = importedTipos.length > 0 ? `${importedTipos.length} tipos hora` : ""
      showFeedback(`✓ Importado de ${file.name}: ${partsMsg}${tiposMsg ? ", " + tiposMsg : ""}`)
    } catch (err) {
      showFeedback(`Error al leer archivo: ${err.message}`, "error")
    }
    e.target.value = ""
  }

  const handleImportPartidas = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buffer = await readFileAsArrayBuffer(file)
      // Try hierarchical format first, then TMO format
      let imported = parsePartidasProyectoXLS(buffer)
      if (imported.length === 0) {
        imported = parsePartidasFromXLS(buffer)
      }
      if (imported.length === 0) {
        showFeedback("No se encontraron partidas en el archivo", "error")
        return
      }
      setPartidas(imported)
      showFeedback(`✓ ${imported.length} partidas de control importadas desde ${file.name}`)
    } catch (err) {
      showFeedback(`Error al leer archivo: ${err.message}`, "error")
    }
    e.target.value = ""
  }

  return (
    <div>
      {/* ─── Feedback ─── */}
      {importFeedback && (
        <div className={`alert-${importFeedback.type === "error" ? "error" : "success"}`} style={{ marginBottom: 16 }}>
          {importFeedback.message}
        </div>
      )}

      {/* ─── S10 Import Section ─── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 16 }}>IMPORTAR DATOS S10</div>

        {/* Import mode toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: "#5a7a8a" }}>Modo personal:</span>
          <button
            onClick={() => setImportMode(importMode === "merge" ? "replace" : "merge")}
            style={{
              padding: "4px 12px",
              fontSize: 11,
              borderRadius: 4,
              border: "1px solid rgba(106,154,180,0.3)",
              background: importMode === "merge" ? "rgba(46,204,113,0.15)" : "rgba(231,76,60,0.15)",
              color: importMode === "merge" ? "#2ecc71" : "#e74c3c",
              cursor: "pointer",
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {importMode === "merge" ? "ACTUALIZAR (merge)" : "REEMPLAZAR TODO"}
          </button>
          <span style={{ fontSize: 10, color: "#3a5a6a" }}>
            {importMode === "merge" ? "Agrega nuevos, actualiza existentes" : "Reemplaza la lista completa"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label className="field-label">Personal (.xlsx)</label>
            <p style={{ fontSize: 11, color: "#5a7a8a", margin: "4px 0 8px" }}>
              PERSONALPROYECTO con datos de trabajadores
            </p>
            <input
              ref={personalFileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportPersonal}
              style={{ display: "none" }}
            />
            <button
              onClick={() => personalFileRef.current?.click()}
              className="btn-import"
            >
              <UploadIcon /> Importar Personal
            </button>
          </div>

          <div style={{ flex: 1, minWidth: 180 }}>
            <label className="field-label">Partidas de Control (.xls)</label>
            <p style={{ fontSize: 11, color: "#5a7a8a", margin: "4px 0 8px" }}>
              Partida de Control por Proyecto
            </p>
            <input
              ref={partidasFileRef}
              type="file"
              accept=".xls,.xlsx"
              onChange={handleImportPartidas}
              style={{ display: "none" }}
            />
            <button
              onClick={() => partidasFileRef.current?.click()}
              className="btn-import"
            >
              <UploadIcon /> Importar Partidas
            </button>
          </div>

          <div style={{ flex: 1, minWidth: 180 }}>
            <label className="field-label">Modelo TMO (.xls)</label>
            <p style={{ fontSize: 11, color: "#5a7a8a", margin: "4px 0 8px" }}>
              TMO-... con partidas y tipos de hora
            </p>
            <input
              ref={modeloFileRef}
              type="file"
              accept=".xls,.xlsx"
              onChange={handleImportModelo}
              style={{ display: "none" }}
            />
            <button
              onClick={() => modeloFileRef.current?.click()}
              className="btn-import"
            >
              <UploadIcon /> Importar Modelo S10
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {workers.length > 0 && (
            <div style={{ fontSize: 12, color: "#6a9ab4" }}>
              ✓ {workers.length} trabajadores
              {workers[0]?.costoHora ? ` (con costos)` : ""}
            </div>
          )}
          {partidas.length > 0 && (
            <div style={{ fontSize: 12, color: "#6a9ab4" }}>
              ✓ {partidas.length} partidas de control
            </div>
          )}
        </div>
      </div>

      {/* ─── Project Configuration ─── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 16 }}>CONFIGURACIÓN DEL PROYECTO</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label className="field-label">Empresa</label>
            <input
              type="text"
              value={projectConfig.empresa}
              onChange={(e) => setProjectConfig(prev => ({ ...prev, empresa: e.target.value }))}
              className="input-field"
            />
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label className="field-label">Obra</label>
            <input
              type="text"
              value={projectConfig.obra}
              onChange={(e) => setProjectConfig(prev => ({ ...prev, obra: e.target.value }))}
              className="input-field"
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label className="field-label">Código Proyecto</label>
            <input
              type="text"
              value={projectConfig.codigoProyecto}
              onChange={(e) => setProjectConfig(prev => ({ ...prev, codigoProyecto: e.target.value }))}
              className="input-field mono"
            />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label className="field-label">Código Nómina</label>
            <input
              type="text"
              value={projectConfig.codigoNomina}
              onChange={(e) => setProjectConfig(prev => ({ ...prev, codigoNomina: e.target.value }))}
              className="input-field mono"
            />
          </div>
        </div>
      </div>

      {/* ─── Workers ─── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>TRABAJADORES ({workers.length})</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => {
                const updated = workers.map(w => {
                  const cat = w.categoria?.toLowerCase() || "";
                  let cost = w.costoHora;
                  if (cat.includes("operario")) cost = 89.30;
                  else if (cat.includes("oficial")) cost = 69.75;
                  else if (cat.includes("peon") || cat.includes("peón")) cost = 62.80;
                  return { ...w, costoHora: cost };
                });
                setWorkers(updated);
                showFeedback("✓ Jornales FTCCP 2026 aplicados");
              }}
              style={{ padding: '4px 8px', fontSize: '10px', background: 'rgba(100,255,218,0.1)', color: '#64ffda', border: '1px solid #64ffda', borderRadius: '4px', cursor: 'pointer' }}>
              Aplicar Jornales 2026
            </button>
          </div>
        </div>

        {workers.length === 0 ? (
          <div className="empty-state" style={{ marginBottom: 12 }}>
            Sin trabajadores. Importa desde un archivo S10 o agrega manualmente.
          </div>
        ) : (
          <div style={{ maxHeight: 250, overflowY: "auto", marginBottom: 12 }}>
            <table className="summary-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>S/./jornal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.id}>
                    <td className="mono" style={{ color: "#6a9ab4" }}>{w.codigo || w.id}</td>
                    <td style={{ color: "#e8dcc8" }}>{w.nombre}</td>
                    <td>
                      <select 
                        value={w.categoria?.toLowerCase() || ""}
                        onChange={(e) => {
                          const updated = workers.map(x => x.id === w.id ? { ...x, categoria: e.target.value } : x);
                          setWorkers(updated);
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#8899aa', fontSize: '12px' }}>
                        <option value="operario">Operario</option>
                        <option value="oficial">Oficial</option>
                        <option value="peon">Peón</option>
                      </select>
                    </td>
                    <td className="mono" style={{ color: "#d4a55a" }}>
                      <input 
                        type="number" 
                        value={w.costoHora || 0} 
                        onChange={(e) => {
                          const updated = workers.map(x => x.id === w.id ? { ...x, costoHora: parseFloat(e.target.value) } : x);
                          setWorkers(updated);
                        }}
                        style={{ width: '60px', background: 'transparent', border: 'none', color: '#d4a55a', textAlign: 'right' }}
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => setWorkers(workers.filter(x => x.id !== w.id))}
                        className="btn-icon-danger"
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            value={newWorkerName}
            onChange={(e) => setNewWorkerName(e.target.value)}
            placeholder="Nombre del trabajador"
            className="input-field"
            style={{ flex: 1 }}
          />
          <button
            onClick={() => {
              if (!newWorkerName.trim()) return
              setWorkers([...workers, {
                id: String(Date.now()),
                codigo: String(Date.now()),
                nombre: newWorkerName.trim(),
                categoria: "peon",
                costoHora: 62.80,
                fechaIngreso: "",
              }])
              setNewWorkerName("")
            }}
            className="btn-primary"
          >
            <PlusIcon /> Agregar
          </button>
        </div>
      </div>

      {/* ─── Partidas de Control ─── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 12 }}>
          PARTIDAS DE CONTROL ({partidas.length})
        </div>

        {partidas.length === 0 ? (
          <div className="empty-state" style={{ marginBottom: 12 }}>
            Sin partidas. Importa desde un archivo modelo S10 o agrega manualmente.
          </div>
        ) : (
          <div style={{ maxHeight: 250, overflowY: "auto", marginBottom: 12 }}>
            {partidas.map((p) => (
              <div key={p.id} className="config-item">
                <span className="mono" style={{ color: "#6a9ab4", minWidth: 100, fontSize: 12 }}>{p.id}</span>
                <span style={{ flex: 1, color: "#e8dcc8", fontSize: 13 }}>{p.nombre}</span>
                <button onClick={() => setPartidas(partidas.filter(x => x.id !== p.id))} className="btn-icon-danger">
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            value={newPartidaId}
            onChange={(e) => setNewPartidaId(e.target.value)}
            placeholder="Código (ej: 010201030)"
            className="input-field mono"
            style={{ width: 140 }}
          />
          <input
            type="text"
            value={newPartidaNombre}
            onChange={(e) => setNewPartidaNombre(e.target.value)}
            placeholder="Nombre de la partida"
            className="input-field"
            style={{ flex: 1 }}
          />
          <button
            onClick={() => {
              if (!newPartidaId.trim() || !newPartidaNombre.trim()) return
              setPartidas([...partidas, { id: newPartidaId.trim(), nombre: newPartidaNombre.trim() }])
              setNewPartidaId("")
              setNewPartidaNombre("")
            }}
            className="btn-primary"
          >
            <PlusIcon /> Agregar
          </button>
        </div>
      </div>

      {/* ─── Actividades ─── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 12 }}>
          ACTIVIDADES ({actividades?.length || 0})
        </div>

        {(!actividades || actividades.length === 0) ? (
          <div className="empty-state" style={{ marginBottom: 12 }}>
            Sin actividades. Agrega manualmente para comenzar el tareo.
          </div>
        ) : (
          <div style={{ maxHeight: 250, overflowY: "auto", marginBottom: 12 }}>
            {actividades.map((a) => (
              <div key={a.id} className="config-item" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <span className="mono" style={{ color: "#6a9ab4", minWidth: 80, fontSize: 12 }}>{a.id}</span>
                <span style={{ flex: 1, color: "#e8dcc8", fontSize: 13, minWidth: 150 }}>{a.nombre}</span>
                <span className="mono" style={{ color: "#8ab4c8", fontSize: 11, background: 'rgba(100,255,218,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                  Partida: {a.partidaId}
                </span>
                <button onClick={() => setActividades(actividades.filter(x => x.id !== a.id))} className="btn-icon-danger">
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Select
              options={partidas.map(p => ({ value: p.id, label: `${p.id} - ${p.nombre}` }))}
              value={newActividadPartida}
              onChange={setNewActividadPartida}
              placeholder="Seleccionar Partida Padre..."
              styles={{
                control: (base, state) => ({ ...base, backgroundColor: '#0a192f', borderColor: state.isFocused ? '#64ffda' : '#233554', color: '#e6f1ff', minHeight: '40px' }),
                menu: (base) => ({ ...base, backgroundColor: '#112240', border: '1px solid #233554', zIndex: 100 }),
                option: (base, state) => ({ ...base, backgroundColor: state.isFocused ? 'rgba(100, 255, 218, 0.1)' : 'transparent', color: state.isFocused ? '#64ffda' : '#ccd6f6' }),
                singleValue: (base) => ({ ...base, color: '#e6f1ff' }),
                input: (base) => ({ ...base, color: '#e6f1ff' })
              }}
              isClearable
            />
          </div>
          <input
            type="text"
            value={newActividadNombre}
            onChange={(e) => setNewActividadNombre(e.target.value)}
            placeholder="Nombre de la nueva actividad"
            className="input-field"
            style={{ flex: 2, minWidth: 200, height: '40px' }}
          />
          <button
            onClick={() => {
              if (!newActividadNombre.trim() || !newActividadPartida) {
                showFeedback("Debe ingresar un nombre y seleccionar una partida", "error")
                return
              }
              // Generar Nomenclatura Única automática ACT-XXX
              let nextIdNumber = 1;
              if (actividades && actividades.length > 0) {
                const maxId = actividades
                  .map(a => parseInt(a.id.replace('ACT-', '')))
                  .filter(n => !isNaN(n))
                  .reduce((a, b) => Math.max(a, b), 0);
                nextIdNumber = maxId + 1;
              }
              const newId = `ACT-${String(nextIdNumber).padStart(3, '0')}`;

              setActividades([...(actividades || []), { 
                id: newId, 
                nombre: newActividadNombre.trim(),
                partidaId: newActividadPartida.value
              }])
              setNewActividadNombre("")
              showFeedback(`✓ Actividad ${newId} generada exitosamente.`)
            }}
            className="btn-primary"
            style={{ height: '40px' }}
          >
            <PlusIcon /> Agregar
          </button>
        </div>
      </div>

      {/* ─── Frentes / Sectores ─── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 12 }}>
          FRENTES / SECTORES ({frentes.length})
        </div>
        {frentes.map((f) => (
          <div key={f.id} className="config-item">
            <span className="mono" style={{ color: "#6a9ab4" }}>{f.id}</span>
            <span style={{ flex: 1, color: "#e8dcc8" }}>{f.nombre}</span>
            <button onClick={() => setFrentes(frentes.filter(x => x.id !== f.id))} className="btn-icon-danger">
              <TrashIcon />
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <input
            type="text"
            value={newFrenteId}
            onChange={(e) => setNewFrenteId(e.target.value)}
            placeholder="ID (ej: F4)"
            className="input-field mono"
            style={{ width: 80 }}
          />
          <input
            type="text"
            value={newFrenteNombre}
            onChange={(e) => setNewFrenteNombre(e.target.value)}
            placeholder="Nombre del frente"
            className="input-field"
            style={{ flex: 1 }}
          />
          <button
            onClick={() => {
              if (!newFrenteId.trim() || !newFrenteNombre.trim()) return
              setFrentes([...frentes, { id: newFrenteId.trim(), nombre: newFrenteNombre.trim() }])
              setNewFrenteId("")
              setNewFrenteNombre("")
            }}
            className="btn-primary"
          >
            <PlusIcon /> Agregar
          </button>
        </div>
      </div>

      {/* ─── Voice Command Guide ─── */}
      <div className="card">
        <div className="label" style={{ marginBottom: 12 }}>GUÍA DE COMANDOS DE VOZ</div>
        <div style={{ fontSize: 13, color: "#8899aa", lineHeight: 1.8 }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: "#d4a55a" }}>Registrar:</span><br />
            • "Juan Pérez" → activa trabajador<br />
            • "4 horas partida 101, 3 horas partida 201"<br />
            • "2 horas extras partida 101" → horas extras<br />
            • "1.5 horas" o "una hora y media" → decimales<br />
            • "Frente 1" o "Sector A" → asigna frente
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: "#d4a55a" }}>Cambiar trabajador:</span><br />
            • Diga otro nombre → registra al anterior y cambia
          </div>
          <div>
            <span style={{ color: "#d4a55a" }}>Corregir:</span><br />
            • "Corregir partida 101 a 5 horas"<br />
            • "Corregir partida 101 a 2 horas extras"<br />
            • "Borrar último" / "Cancelar"<br />
            • "Cambiar frente a Frente 2"
          </div>
        </div>
      </div>
    </div>
  )
}
