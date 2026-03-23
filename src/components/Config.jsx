import { useState, useRef } from "react"
import Select from "react-select"
import { PlusIcon, UploadIcon, PencilIcon } from "./Icons"
import {
  parsePersonalXLSX,
  parsePartidasFromXLS,
  parsePartidasProyectoXLS,
  parseTipoHoraFromXLS,
  mergeWorkers,
  readFileAsArrayBuffer,
} from "../utils/s10Importer"
import {
  downloadActividadesTemplate,
  parseActividadesFromXLSX,
  downloadTareoTemplate,
  parseTareoFromXLSX,
} from "../utils/importTemplates"
import { insertRegistro } from "../utils/supabaseClient"
import { selectStyles } from "../utils/selectTheme"

export default function Config({
  workers, setWorkers,
  partidas, setPartidas,
  actividades, setActividades,
  tiposHora, setTiposHora,
  projectConfig, setProjectConfig,
}) {
  // ── Estado: forms de agregar ────────────────────────────────────────────────
  const [newWorkerName, setNewWorkerName]       = useState("")
  const [newPartidaId, setNewPartidaId]         = useState("")
  const [newPartidaNombre, setNewPartidaNombre] = useState("")
  const [newActId, setNewActId]                 = useState("")
  const [newActNombre, setNewActNombre]         = useState("")
  const [newActPartida, setNewActPartida]       = useState(null)

  // ── Estado: edición inline de actividades ───────────────────────────────────
  const [editingActId, setEditingActId]   = useState(null)
  const [editActNombre, setEditActNombre] = useState("")
  const [editActPartida, setEditActPartida] = useState(null)

  // ── Estado: selección para borrado masivo ────────────────────────────────────
  const [selectedWorkers,    setSelectedWorkers]    = useState([])
  const [selectedPartidas,   setSelectedPartidas]   = useState([])
  const [selectedActividades, setSelectedActividades] = useState([])

  // ── Varios ──────────────────────────────────────────────────────────────────
  const [isCompactMode,   setIsCompactMode]   = useState(true)
  const [importFeedback,  setImportFeedback]  = useState(null)
  const [importMode,      setImportMode]      = useState("merge")
  const [tempApiKey,      setTempApiKey]      = useState(localStorage.getItem("gemini_api_key") || "")
  const [tareoImporting,  setTareoImporting]  = useState(false)

  const personalFileRef   = useRef(null)
  const partidasFileRef   = useRef(null)
  const modeloFileRef     = useRef(null)
  const actividadesFileRef = useRef(null)
  const tareoFileRef      = useRef(null)

  const showFeedback = (msg, type = "success") => {
    setImportFeedback({ message: msg, type })
    setTimeout(() => setImportFeedback(null), 5000)
  }

  // ── Importaciones S10 ───────────────────────────────────────────────────────
  const handleImportPersonal = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buffer = await readFileAsArrayBuffer(file)
      const imported = parsePersonalXLSX(buffer)
      if (imported.length === 0) { showFeedback("No se encontraron trabajadores", "error"); return }
      const result = importMode === "replace" ? imported : mergeWorkers(workers, imported)
      setWorkers(result)
      showFeedback(importMode === "replace" ? `✓ ${result.length} trabajadores cargados.` : `✓ ${imported.length} trabajadores sincronizados.`)
    } catch (err) { showFeedback(`Error: ${err.message}`, "error") }
    e.target.value = ""
  }

  const handleImportPartidas = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buffer = await readFileAsArrayBuffer(file)
      let imported = parsePartidasProyectoXLS(buffer)
      if (imported.length === 0) imported = parsePartidasFromXLS(buffer)
      if (imported.length === 0) { showFeedback("No se encontraron partidas", "error"); return }
      setPartidas(imported)
      showFeedback(`✓ ${imported.length} partidas importadas.`)
    } catch (err) { showFeedback(`Error: ${err.message}`, "error") }
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
    } catch (err) { showFeedback(`Error: ${err.message}`, "error") }
    e.target.value = ""
  }

  // ── Importación de actividades ───────────────────────────────────────────────
  const handleImportActividades = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buffer = await readFileAsArrayBuffer(file)
      const imported = parseActividadesFromXLSX(buffer)
      if (imported.length === 0) { showFeedback("No se encontraron actividades", "error"); return }
      setActividades(imported)
      showFeedback(`✓ ${imported.length} actividades importadas.`)
    } catch (err) { showFeedback(`Error: ${err.message}`, "error") }
    e.target.value = ""
  }

  // ── Importación de tareos ────────────────────────────────────────────────────
  const handleImportTareo = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setTareoImporting(true)
    try {
      const buffer = await readFileAsArrayBuffer(file)
      const regs = parseTareoFromXLSX(buffer, workers, actividades)
      if (regs.length === 0) { showFeedback("No se encontraron registros válidos", "error"); setTareoImporting(false); return }
      let ok = 0, fail = 0
      for (const reg of regs) {
        try {
          const dbId = await insertRegistro(reg)
          if (dbId) reg.id = dbId
          ok++
        } catch { fail++ }
      }
      showFeedback(fail === 0 ? `✓ ${ok} registros importados a Supabase.` : `Importados ${ok}, fallaron ${fail}.`, fail > 0 ? "error" : "success")
    } catch (err) { showFeedback(`Error: ${err.message}`, "error") }
    setTareoImporting(false)
    e.target.value = ""
  }

  // ── Borrados masivos ─────────────────────────────────────────────────────────
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

  // ── Edición inline de actividades ───────────────────────────────────────────
  const startEditActividad = (a) => {
    const p = partidas.find(p => p.id === a.partidaId)
    setEditingActId(a.id)
    setEditActNombre(a.nombre)
    setEditActPartida(p ? { value: p.id, label: `${p.id} — ${p.nombre}` } : null)
  }
  const saveActividadEdit = (id) => {
    setActividades(prev => prev.map(a => a.id !== id ? a : {
      ...a,
      nombre: editActNombre.trim().toUpperCase(),
      partidaId: editActPartida?.value || a.partidaId,
    }))
    setEditingActId(null)
  }

  // ── Auto-generar siguiente ID de actividad ───────────────────────────────────
  const nextActId = () => {
    const nums = actividades.map(a => parseInt(a.id.replace(/\D/g, "")) || 0)
    const max = nums.length > 0 ? Math.max(...nums) : 0
    return `A${String(max + 1).padStart(3, "0")}`
  }

  const partidaOptions = partidas.map(p => ({ value: p.id, label: `${p.id} — ${p.nombre}` }))

  return (
    <div className="config-container">

      {/* ── Feedback ──────────────────────────────────────────────────────────── */}
      {importFeedback && (
        <div className={`alert-${importFeedback.type === "error" ? "error" : "success"}`} style={{ marginBottom: 16 }}>
          {importFeedback.message}
        </div>
      )}

      {/* ── S10 — Importaciones ───────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 4 }}>SISTEMA S10 — IMPORTAR MAESTROS</div>
        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
          Personal: desde reporte S10 de personal activo. Partidas: desde el archivo TMO. Modelo TMO: carga partidas y tipos de hora del XLS modelo de exportación.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={importMode === "replace"} onChange={e => setImportMode(e.target.checked ? "replace" : "merge")} />
            Reemplazar completamente al importar personal (por defecto: fusionar)
          </label>
        </div>
        <input ref={personalFileRef}  type="file" hidden onChange={handleImportPersonal} accept=".xlsx,.xls" />
        <input ref={partidasFileRef}  type="file" hidden onChange={handleImportPartidas} accept=".xlsx,.xls" />
        <input ref={modeloFileRef}    type="file" hidden onChange={handleImportModelo}   accept=".xlsx,.xls" />
      </div>

      {/* ── Importar Tareo desde Excel ────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 4 }}>IMPORTAR TAREO DESDE EXCEL</div>
        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
          Descarga la plantilla, complétala con los tareos de la semana y súbela para importarlos directamente a Supabase.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => downloadTareoTemplate(workers, actividades)}
            className="btn-secondary"
            style={{ flex: 1 }}>
            ↓ Descargar plantilla tareo
          </button>
          <button
            onClick={() => tareoFileRef.current?.click()}
            className="btn-import"
            style={{ flex: 1 }}
            disabled={tareoImporting}
          >
            <UploadIcon /> {tareoImporting ? "Importando..." : "Importar tareo"}
          </button>
        </div>
        <input ref={tareoFileRef} type="file" hidden onChange={handleImportTareo} accept=".xlsx,.xls" />
      </div>

      {/* ── Trabajadores ─────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span>TRABAJADORES ({workers.length})</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setIsCompactMode(!isCompactMode)}
              className="btn-pill-sm"
              style={{ background: isCompactMode ? 'var(--accent-blue)' : 'transparent' }}
            >
              {isCompactMode ? "COMPACTO" : "CON CÓDIGO"}
            </button>
            {selectedWorkers.length > 0 && (
              <button onClick={deleteSelectedWorkers} className="btn-pill-danger">
                ELIMINAR ({selectedWorkers.length})
              </button>
            )}
          </div>
        </div>

        <div style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 12, border: '1px solid var(--border-dim)', borderRadius: 8 }}>
          <table className="summary-table" style={{ margin: 0 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                {!isCompactMode && <th>CÓDIGO</th>}
                <th>NOMBRES Y APELLIDOS</th>
                <th style={{ textAlign: 'right' }}>
                  <input type="checkbox"
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
                  <td style={{ fontWeight: 600 }}>{w.nombre}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input type="checkbox"
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
          <input type="text" value={newWorkerName} onChange={e => setNewWorkerName(e.target.value)}
            placeholder="Nuevo trabajador (APELLIDOS, Nombre)..." className="input-field" style={{ flex: 1 }} />
          <button
            onClick={() => {
              if (!newWorkerName.trim()) return
              setWorkers([...workers, { id: String(Date.now()), nombre: newWorkerName.trim().toUpperCase(), categoria: "peon", costoHora: 62.80 }])
              setNewWorkerName("")
            }}
            className="btn-primary"
          >
            <PlusIcon /> AGREGAR
          </button>
        </div>
      </div>

      {/* ── Partidas de Control ──────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span>PARTIDAS DE CONTROL ({partidas.length})</span>
          {selectedPartidas.length > 0 && (
            <button onClick={deleteSelectedPartidas} className="btn-pill-danger">
              ELIMINAR ({selectedPartidas.length})
            </button>
          )}
        </div>

        <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 12, border: '1px solid var(--border-dim)', borderRadius: 8 }}>
          {partidas.map(p => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center',
              padding: '5px 10px',
              borderBottom: '1px solid rgba(51,65,85,0.5)',
            }}>
              <span className="mono" style={{ color: 'var(--accent-gold)', width: 105, fontSize: 11, flexShrink: 0 }}>{p.id}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{p.nombre}</span>
              <input type="checkbox"
                checked={selectedPartidas.includes(p.id)}
                onChange={() => setSelectedPartidas(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])}
              />
            </div>
          ))}
          {partidas.length === 0 && <div className="empty-state">No hay partidas registradas.</div>}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <input type="text" value={newPartidaId} onChange={e => setNewPartidaId(e.target.value)}
            placeholder="Cód." className="input-field mono" style={{ width: 110 }} />
          <input type="text" value={newPartidaNombre} onChange={e => setNewPartidaNombre(e.target.value)}
            placeholder="Nombre partida..." className="input-field" style={{ flex: 1 }} />
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

      {/* ── Actividades ──────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span>ACTIVIDADES ({actividades.length})</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => downloadActividadesTemplate(partidas)} className="btn-pill-sm">↓ Plantilla</button>
            <button onClick={() => actividadesFileRef.current?.click()} className="btn-pill-sm"><UploadIcon /> Importar</button>
            {selectedActividades.length > 0 && (
              <button onClick={deleteSelectedActividades} className="btn-pill-danger">
                ELIMINAR ({selectedActividades.length})
              </button>
            )}
          </div>
        </div>
        <input ref={actividadesFileRef} type="file" hidden onChange={handleImportActividades} accept=".xlsx,.xls" />

        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10 }}>
          Haz clic en una fila para editar el nombre o la partida de control vinculada.
        </p>

        <div style={{ maxHeight: 380, overflowY: 'auto', marginBottom: 12, border: '1px solid var(--border-dim)', borderRadius: 8 }}>
          {/* Encabezado de tabla */}
          <div style={{ display: 'flex', padding: '5px 10px', background: 'var(--bg-dark)', position: 'sticky', top: 0, zIndex: 5, borderBottom: '1px solid var(--border-dim)' }}>
            <span style={{ width: 50, fontSize: 10, fontWeight: 700, color: 'var(--accent-gold)', textTransform: 'uppercase' }}>ID</span>
            <span style={{ flex: 2, fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Actividad</span>
            <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Partida de control</span>
            <span style={{ width: 24 }}></span>
          </div>

          {actividades.map(a => {
            const partida = partidas.find(p => p.id === a.partidaId)
            const isEditing = editingActId === a.id

            if (isEditing) {
              return (
                <div key={a.id} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-dim)', background: 'rgba(37,99,235,0.08)' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="mono" style={{ color: 'var(--accent-gold)', fontSize: 11, width: 45, flexShrink: 0 }}>{a.id}</span>
                    <input
                      type="text"
                      value={editActNombre}
                      onChange={e => setEditActNombre(e.target.value)}
                      className="input-field"
                      style={{ flex: 2, padding: '4px 8px', fontSize: 13, minWidth: 0 }}
                      autoFocus
                    />
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <Select
                        options={partidaOptions}
                        value={editActPartida}
                        onChange={setEditActPartida}
                        styles={selectStyles}
                        placeholder="Partida..."
                      />
                    </div>
                    <button onClick={() => saveActividadEdit(a.id)} className="btn-primary" style={{ padding: '4px 12px', fontSize: 12 }}>✓</button>
                    <button onClick={() => setEditingActId(null)} className="btn-pill-sm" style={{ padding: '4px 10px' }}>✕</button>
                  </div>
                </div>
              )
            }

            return (
              <div key={a.id}
                onClick={() => startEditActividad(a)}
                style={{
                  display: 'flex', alignItems: 'center',
                  padding: '5px 10px',
                  borderBottom: '1px solid rgba(51,65,85,0.5)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <span className="mono" style={{ color: 'var(--accent-gold)', fontSize: 11, width: 50, flexShrink: 0 }}>{a.id}</span>
                <span style={{ flex: 2, fontSize: 13, fontWeight: 500, color: 'var(--text-main)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.nombre}
                </span>
                <span style={{ flex: 1, fontSize: 11, color: 'var(--text-dim)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span className="mono" style={{ color: 'var(--accent-gold)', marginRight: 4 }}>{a.partidaId}</span>
                  {partida?.nombre || ""}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); startEditActividad(a) }}
                  title="Editar actividad"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-blue)', padding: '2px 4px', flexShrink: 0, opacity: 0.7 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
                >
                  <PencilIcon />
                </button>
                <input
                  type="checkbox"
                  checked={selectedActividades.includes(a.id)}
                  onChange={e => {
                    e.stopPropagation()
                    setSelectedActividades(prev => prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id])
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{ marginLeft: 2, flexShrink: 0 }}
                />
              </div>
            )
          })}
          {actividades.length === 0 && <div className="empty-state">No hay actividades registradas.</div>}
        </div>

        {/* Agregar nueva actividad */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={newActId}
            onChange={e => setNewActId(e.target.value)}
            placeholder="ID"
            className="input-field mono"
            style={{ width: 70 }}
            onFocus={() => { if (!newActId) setNewActId(nextActId()) }}
          />
          <input
            type="text"
            value={newActNombre}
            onChange={e => setNewActNombre(e.target.value)}
            placeholder="Nombre de la actividad..."
            className="input-field"
            style={{ flex: 1, minWidth: 140 }}
          />
          <div style={{ flex: 1, minWidth: 180 }}>
            <Select
              options={partidaOptions}
              value={newActPartida}
              onChange={setNewActPartida}
              styles={selectStyles}
              placeholder="Partida de control..."
            />
          </div>
          <button
            onClick={() => {
              const id = newActId.trim() || nextActId()
              const nombre = newActNombre.trim().toUpperCase()
              if (!nombre) return
              setActividades([...actividades, { id, nombre, partidaId: newActPartida?.value || null }])
              setNewActId("")
              setNewActNombre("")
              setNewActPartida(null)
            }}
            className="btn-primary"
          >
            <PlusIcon /> AGREGAR
          </button>
        </div>
      </div>

      {/* ── Datos del Proyecto ───────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 12 }}>DATOS DEL PROYECTO</div>
        <div className="desktop-grid">
          <div>
            <label className="field-label-sm">Empresa / Obra</label>
            <input type="text" value={projectConfig.empresa}
              onChange={e => setProjectConfig({...projectConfig, empresa: e.target.value})}
              className="input-field" style={{ width: '100%' }} />
          </div>
          <div>
            <label className="field-label-sm">Código Proyecto (S10)</label>
            <input type="text" value={projectConfig.codigoProyecto}
              onChange={e => setProjectConfig({...projectConfig, codigoProyecto: e.target.value})}
              className="input-field mono" style={{ width: '100%' }} />
          </div>
        </div>
      </div>

      {/* ── Asistente IA ─────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="label" style={{ marginBottom: 12, color: 'var(--accent-blue)' }}>CONFIGURACIÓN DEL ASISTENTE IA</div>
        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
          El Asistente IA usa Gemini (Google). Pega tu API Key gratuita desde <strong>aistudio.google.com</strong>.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="password"
            value={tempApiKey}
            onChange={e => setTempApiKey(e.target.value)}
            placeholder="Pega tu Gemini API Key aquí..."
            className="input-field mono"
            style={{ flex: 1, fontSize: 12 }}
          />
          <button
            onClick={() => {
              if (!tempApiKey.trim()) return
              localStorage.setItem("gemini_api_key", tempApiKey.trim())
              showFeedback("✓ Llave guardada. Ve al Asistente.")
            }}
            className="btn-primary"
            style={{ padding: '0 20px' }}
          >
            GUARDAR
          </button>
        </div>
      </div>
    </div>
  )
}
