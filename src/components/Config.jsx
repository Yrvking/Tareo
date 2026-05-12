import { useState, useRef, useMemo } from "react"
import Select from "react-select"
import { PlusIcon, UploadIcon, PencilIcon, TrashIcon } from "./Icons"
import {
  parsePersonalXLSX,
  parsePartidasFromXLS,
  parsePartidasProyectoXLS,
  parseTipoHoraFromXLS,
  parseResumenTareo,
  parseNetosFinanzasXLSX,
  buildWorkersFromResumenTareo,
  buildPartidasFromResumenTareo,
  buildSyntheticActivitiesFromPartidas,
  buildRegistrosFromResumenTareo,
  mergeWorkers,
  mergeWorkerCosts,
  readFileAsArrayBuffer,
} from "../utils/s10Importer"
import {
  downloadActividadesTemplate,
  parseActividadesFromXLSX,
  downloadTareoTemplate,
  parseTareoFromXLSX,
  downloadS10PersonalTemplate,
  downloadS10PartidasTemplate,
  downloadS10ModeloTemplate,
  downloadS10CostosTemplate,
} from "../utils/importTemplates"
import {
  deleteRegistroById,
  fetchRegistros,
  insertRegistro,
  updateRegistro,
  saveNetosFinanzas,
  clearNetosFinanzas,
} from "../utils/supabaseClient"
import { selectStyles } from "../utils/selectTheme"
import { getWeekOptions } from "../utils/dateUtils"
import UserManagementPanel from "./UserManagementPanel"

export default function Config({
  workers, setWorkers,
  partidas, setPartidas,
  frentes, setFrentes,
  actividades, setActividades,
  tiposHora, setTiposHora,
  projectConfig, setProjectConfig,
  fechaTareo,
}) {
  const s10ImportGuides = [
    {
      title: "Personal S10",
      detail: "Este archivo debe dejar completo al trabajador para operación y contabilidad. El orden de columnas puede cambiar.",
      required: "Código, Nombre, DNI, Categoría, Fecha Ingreso",
      complementary: "Código categoría, Abreviatura Categoría, Costo hora promedio, Ocupación, Activo Proyecto",
      template: "Código | Nombre | DNI | Categoría | Fecha Ingreso | Código categoría | Abreviatura Categoría | Costo hora promedio",
      onDownload: downloadS10PersonalTemplate,
    },
    {
      title: "Partidas por proyecto",
      detail: "Debe traer la relación base de partidas de control. El sistema reconoce encabezados aunque estén movidos.",
      required: "Código de partida, Descripción o Nombre",
      complementary: "Cualquier otra columna del reporte se ignora",
      template: "Código Partida de Control | Descripción",
      onDownload: downloadS10PartidasTemplate,
    },
    {
      title: "Modelo TMO",
      detail: "La plantilla modelo incluye las dos hojas que usa el sistema actualmente: Partida de Control y TipoHora.",
      required: "Hoja Partida de Control: Código, Descripción o Nombre | Hoja TipoHora: Descripción",
      complementary: "En TipoHora también se recomienda Código y Abreviatura",
      template: "Partida de Control -> Código | Descripción  /  TipoHora -> Código | Descripción | Abreviatura",
      onDownload: downloadS10ModeloTemplate,
    },
    {
      title: "Consolidado S10",
      detail: "Este archivo ahora actualiza costos, crea partidas/actividades faltantes y reasigna los tareos según la partida de control vigente en S10.",
      required: "Código, Apellidos y Nombres, Fecha, Horas laboradas, Tipo Hora, Código Partida de Control, Partida de Control, Costo HH Normal",
      complementary: "Proyecto, Año, Periodo Semanal, Tipo de Nómina, Horas descanso, Costo HH Extra60, Costo HH Extra100. Se usa como fuente de verdad por trabajador y fecha.",
      template: "Código | Apellidos y Nombres | Fecha | Horas laboradas | Tipo Hora | Código Partida de Control | Partida de Control | Costo HH Normal",
      onDownload: downloadS10CostosTemplate,
    },
  ]

  // ── Estado: forms de agregar ────────────────────────────────────────────────
  const [newWorkerName, setNewWorkerName]       = useState("")
  const [newPartidaId, setNewPartidaId]         = useState("")
  const [newPartidaNombre, setNewPartidaNombre] = useState("")
  const [newFrenteId, setNewFrenteId]           = useState("")
  const [newFrenteNombre, setNewFrenteNombre]   = useState("")
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
  const [selectedFrentes,    setSelectedFrentes]    = useState([])
  const [selectedActividades, setSelectedActividades] = useState([])

  // ── Varios ──────────────────────────────────────────────────────────────────
  const [isCompactMode,   setIsCompactMode]   = useState(true)
  const [importFeedback,  setImportFeedback]  = useState(null)
  const [importMode,      setImportMode]      = useState("merge")
  const [tempApiKey,      setTempApiKey]      = useState(localStorage.getItem("gemini_api_key") || "")
  const [tareoImporting,  setTareoImporting]  = useState(false)
  const [costosImporting, setCostosImporting] = useState(false)
  const [netosImporting,  setNetosImporting]  = useState(false)

  const personalFileRef   = useRef(null)
  const partidasFileRef   = useRef(null)
  const modeloFileRef     = useRef(null)
  const costosFileRef     = useRef(null)
  const netosFileRef      = useRef(null)
  const actividadesFileRef = useRef(null)
  const tareoFileRef      = useRef(null)

  const weekOptions = useMemo(() => getWeekOptions(12, 2), [])
  const [selectedWeek, setSelectedWeek] = useState(weekOptions[2])
  const closedTareoDates = Array.isArray(projectConfig.closedTareoDates) ? projectConfig.closedTareoDates : []
  const isSelectedDateClosed = Boolean(fechaTareo && closedTareoDates.includes(fechaTareo))

  const showFeedback = (msg, type = "success") => {
    setImportFeedback({ message: msg, type })
    setTimeout(() => setImportFeedback(null), 5000)
  }

  const mergePartidasCatalog = (existingPartidas, importedPartidas) => {
    const merged = new Map(existingPartidas.map((partida) => [String(partida.id), partida]))
    importedPartidas.forEach((partida) => {
      const key = String(partida.id || "").trim()
      if (!key) return
      const previous = merged.get(key)
      merged.set(key, previous ? { ...previous, nombre: partida.nombre || previous.nombre } : partida)
    })
    return Array.from(merged.values())
  }

  const mergeActivitiesCatalog = (existingActivities, importedActivities) => {
    const merged = new Map(existingActivities.map((activity) => [String(activity.id), activity]))
    importedActivities.forEach((activity) => {
      const key = String(activity.id || "").trim()
      if (!key || merged.has(key)) return
      merged.set(key, activity)
    })
    return Array.from(merged.values())
  }

  const setTareoDateClosed = (targetDate, closed) => {
    if (!targetDate) return
    const nextClosedDates = closed
      ? Array.from(new Set([...closedTareoDates, targetDate])).sort()
      : closedTareoDates.filter((date) => date !== targetDate)

    setProjectConfig({
      ...projectConfig,
      closedTareoDates: nextClosedDates,
    })

    showFeedback(
      closed
        ? `✓ Fecha ${targetDate} cerrada para eliminación de tareos.`
        : `✓ Fecha ${targetDate} reabierta para edición y eliminación.`,
      "success"
    )
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
      let modelError = null

      if (imported.length === 0) {
        try {
          imported = parsePartidasFromXLS(buffer)
        } catch (err) {
          modelError = err
        }
      }

      if (imported.length === 0) {
        showFeedback(modelError?.message || "No se encontraron partidas válidas. Verifica que exista Código y Descripción o Nombre.", "error")
        return
      }

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
      const importedTipos = parseTipoHoraFromXLS(buffer)

      if (importedPartidas.length > 0) setPartidas(importedPartidas)
      if (importedTipos.length > 0) setTiposHora(importedTipos)

      showFeedback(`✓ Modelo ${file.name} cargado.`)
    } catch (err) { showFeedback(`Error: ${err.message}`, "error") }
    e.target.value = ""
  }

  const handleImportCostos = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCostosImporting(true)
    try {
      const buffer = await readFileAsArrayBuffer(file)
      const importedRows = parseResumenTareo(buffer)
      const importedWorkers = buildWorkersFromResumenTareo(importedRows)
      const importedPartidas = buildPartidasFromResumenTareo(importedRows)
      const importedActivities = buildSyntheticActivitiesFromPartidas(importedPartidas)

      const mergedWorkers = mergeWorkerCosts(
        mergeWorkers(workers, importedWorkers),
        importedRows
      )
      const mergedPartidas = mergePartidasCatalog(partidas, importedPartidas)
      const mergedActivities = mergeActivitiesCatalog(actividades, importedActivities)

      setWorkers(mergedWorkers)
      setPartidas(mergedPartidas)
      setActividades(mergedActivities)

      const importedRegistros = buildRegistrosFromResumenTareo(importedRows, mergedWorkers, mergedActivities)
      if (importedRegistros.length === 0) {
        throw new Error("El consolidado no produjo tareos válidos. Verifica trabajadores, fechas y códigos de partida.")
      }

      const importedDates = importedRegistros.map((registro) => registro.date).sort()
      const startDate = importedDates[0]
      const endDate = importedDates[importedDates.length - 1]
      const existingRegistros = await fetchRegistros(startDate, endDate)
      const existingByWorkerDate = new Map()

      existingRegistros.forEach((registro) => {
        const key = `${String(registro.workerId)}|${registro.date}`
        if (!existingByWorkerDate.has(key)) {
          existingByWorkerDate.set(key, [])
        }
        existingByWorkerDate.get(key).push(registro)
      })

      let inserted = 0
      let updated = 0
      let deleted = 0
      let failed = 0
      let lastError = ""

      for (const importedRegistro of importedRegistros) {
        const key = `${String(importedRegistro.workerId)}|${importedRegistro.date}`
        const existingGroup = [...(existingByWorkerDate.get(key) || [])]
        const primary = existingGroup[0] || null
        const extraRecords = existingGroup.slice(1)
        const sourceLabel = `Importado desde consolidado S10: ${file.name}`

        try {
          for (const extraRecord of extraRecords) {
            await deleteRegistroById(extraRecord.id, {
              beforeData: extraRecord,
              source: sourceLabel,
            })
            deleted++
          }

          if (primary) {
            await updateRegistro(
              {
                ...primary,
                workerId: importedRegistro.workerId,
                workerNombre: importedRegistro.workerNombre,
                date: importedRegistro.date,
                raw: sourceLabel,
                assignments: importedRegistro.assignments,
              },
              {
                beforeData: primary,
                source: sourceLabel,
              }
            )
            updated++
          } else {
            await insertRegistro({
              ...importedRegistro,
              raw: sourceLabel,
            })
            inserted++
          }
        } catch (error) {
          failed++
          lastError = error?.message || "No se pudo aplicar una reasignación del consolidado."
        }
      }

      if (failed > 0) {
        showFeedback(
          `Actualizados ${updated}, nuevos ${inserted}, eliminados ${deleted}, fallaron ${failed}. ${lastError}`,
          "error"
        )
      } else {
        showFeedback(
          `✓ Consolidado aplicado. Actualizados ${updated}, nuevos ${inserted}, eliminados ${deleted}, trabajadores ${importedWorkers.length}, partidas ${importedPartidas.length}.`
        )
      }
    } catch (err) {
      showFeedback(`Error: ${err.message}`, "error")
    }
    setCostosImporting(false)
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
      let ok = 0, fail = 0, pending = 0
      let lastError = ""
      for (const reg of regs) {
        try {
          const result = await insertRegistro(reg)
          if (result?.id) reg.id = result.id
          if (result?.syncStatus && result.syncStatus !== "synced") pending++
          ok++
        } catch (error) {
          fail++
          lastError = error?.message || "No se pudo guardar uno de los registros."
        }
      }
      if (fail > 0) {
        showFeedback(`Importados ${ok}, fallaron ${fail}. ${lastError}`, "error")
      } else if (pending > 0) {
        showFeedback(`✓ ${ok} registros importados. ${pending} quedaron pendientes de sincronización.`)
      } else {
        showFeedback(`✓ ${ok} registros importados.`)
      }
    } catch (err) { showFeedback(`Error: ${err.message}`, "error") }
    setTareoImporting(false)
    e.target.value = ""
  }

  // ── Importación de netos (Finanzas) ─────────────────────────────────────────
  const handleImportNetos = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !selectedWeek) return

    const weekLabel = selectedWeek.label.split('(')[0].trim()
    const dateRange = selectedWeek.label.match(/\((.*?)\)/)?.[1] || ""
    const confirmMsg = `¿Está seguro que va a cargar los costos netos a la ${weekLabel} con fechas del ${dateRange}?`
    
    if (!window.confirm(confirmMsg)) {
      e.target.value = ""
      return
    }

    setNetosImporting(true)
    try {
      const buffer = await readFileAsArrayBuffer(file)
      const netosMap = parseNetosFinanzasXLSX(buffer)
      const count = Object.keys(netosMap).length

      if (count === 0) {
        throw new Error("No se encontraron netos válidos en el archivo. Verifica las columnas DNI/Código y Neto.")
      }

      await saveNetosFinanzas(selectedWeek.year, selectedWeek.week, netosMap)
      showFeedback(`✓ Planilla de Finanzas cargada: ${count} netos asignados a la semana ${selectedWeek.week}.`)
    } catch (err) {
      showFeedback(`Error: ${err.message}`, "error")
    }
    setNetosImporting(false)
    e.target.value = ""
  }

  const handleClearNetos = async () => {
    if (!selectedWeek) return
    if (!window.confirm(`¿Está seguro que desea ELIMINAR la carga de netos de la SEMANA ${selectedWeek.week}? Esta acción no se puede deshacer.`)) return

    setNetosImporting(true)
    try {
      await clearNetosFinanzas(selectedWeek.year, selectedWeek.week)
      showFeedback(`✓ Datos de netos eliminados para la semana ${selectedWeek.week}.`)
    } catch (err) {
      showFeedback(`Error: ${err.message}`, "error")
    }
    setNetosImporting(false)
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
  const deleteSelectedFrentes = () => {
    setFrentes(prev => prev.filter(f => !selectedFrentes.includes(f.id)))
    setSelectedFrentes([])
    showFeedback("Frentes eliminados")
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

      <UserManagementPanel />

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
          El sistema puede leer columnas aunque estén en otro orden, pero estas plantillas ya muestran lo que hoy necesita para funcionar completo: personal listo para contabilidad, partidas, modelo TMO y consolidado con horas y costos.
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
          <button onClick={() => costosFileRef.current?.click()} className="btn-import" style={{ flex: 1 }} disabled={costosImporting}>
            <UploadIcon /> {costosImporting ? "Aplicando consolidado..." : "Consolidado S10"}
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={importMode === "replace"} onChange={e => setImportMode(e.target.checked ? "replace" : "merge")} />
            Reemplazar completamente al importar personal (por defecto: fusionar)
          </label>
        </div>
        <div style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
        }}>
          {s10ImportGuides.map((guide) => (
            <div
              key={guide.title}
              style={{
                border: '1px solid var(--border-dim)',
                borderRadius: 10,
                padding: '12px 12px 10px',
                background: 'rgba(15,23,42,0.45)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-gold)', marginBottom: 6 }}>
                {guide.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.45, marginBottom: 8 }}>
                {guide.detail}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-main)', lineHeight: 1.45 }}>
                <strong>Obligatorios:</strong> {guide.required}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.45, marginTop: 4 }}>
                <strong>Complementarios:</strong> {guide.complementary}
              </div>
              <div style={{
                marginTop: 8,
                padding: '8px 9px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px dashed rgba(148,163,184,0.25)',
                fontSize: 10,
                color: 'var(--text-dim)',
                lineHeight: 1.45,
                fontFamily: 'var(--font-mono)',
              }}>
                {guide.template}
              </div>
              <div style={{ marginTop: 10 }}>
                <button onClick={guide.onDownload} className="btn-pill-sm">
                  ↓ Descargar plantilla
                </button>
              </div>
            </div>
          ))}
        </div>
        <input ref={personalFileRef}  type="file" hidden onChange={handleImportPersonal} accept=".xlsx,.xls" />
        <input ref={partidasFileRef}  type="file" hidden onChange={handleImportPartidas} accept=".xlsx,.xls" />
        <input ref={modeloFileRef}    type="file" hidden onChange={handleImportModelo}   accept=".xlsx,.xls" />
        <input ref={costosFileRef}    type="file" hidden onChange={handleImportCostos}   accept=".xlsx,.xls" />
      </div>

      {/* ── Importar Tareo desde Excel ────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 4 }}>IMPORTAR TAREO DESDE EXCEL</div>
        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
          Descarga la plantilla, complétala con los tareos de la semana y súbela para importarlos en el sistema, incluso si luego quedan pendientes de sincronización.
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

        <div className="responsive-inline-form">
          <input type="text" value={newWorkerName} onChange={e => setNewWorkerName(e.target.value)}
            placeholder="Nuevo trabajador (APELLIDOS, Nombre)..." className="input-field" style={{ flex: "1 1 220px", minWidth: 0 }} />
          <button
            onClick={() => {
              if (!newWorkerName.trim()) return
              setWorkers([...workers, { id: String(Date.now()), nombre: newWorkerName.trim().toUpperCase(), categoria: "peon", costoHora: 62.80 }])
              setNewWorkerName("")
            }}
            className="btn-primary"
            style={{ flex: "0 0 auto" }}
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

        <div className="responsive-inline-form">
          <input type="text" value={newPartidaId} onChange={e => setNewPartidaId(e.target.value)}
            placeholder="Cód." className="input-field mono" style={{ width: 110, flex: "0 0 110px" }} />
          <input type="text" value={newPartidaNombre} onChange={e => setNewPartidaNombre(e.target.value)}
            placeholder="Nombre partida..." className="input-field" style={{ flex: "1 1 220px", minWidth: 0 }} />
          <button
            onClick={() => {
              if (!newPartidaId.trim() || !newPartidaNombre.trim()) return
              setPartidas([...partidas, { id: newPartidaId.trim(), nombre: newPartidaNombre.trim() }])
              setNewPartidaId(""); setNewPartidaNombre("")
            }}
            className="btn-primary"
            style={{ flex: "0 0 auto" }}
          >
            <PlusIcon /> AGREGAR
          </button>
        </div>
      </div>

      {/* ── Frentes / Sectores ──────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span>FRENTES / SECTORES ({frentes.length})</span>
          {selectedFrentes.length > 0 && (
            <button onClick={deleteSelectedFrentes} className="btn-pill-danger">
              ELIMINAR ({selectedFrentes.length})
            </button>
          )}
        </div>

        <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 12, border: '1px solid var(--border-dim)', borderRadius: 8 }}>
          {frentes.map(f => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center',
              padding: '8px 10px',
              borderBottom: '1px solid rgba(51,65,85,0.5)',
              gap: 12,
            }}>
              <span className="mono" style={{ color: 'var(--accent-gold)', width: 72, fontSize: 11, flexShrink: 0 }}>{f.id}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{f.nombre}</span>
              <input
                type="checkbox"
                checked={selectedFrentes.includes(f.id)}
                onChange={() => setSelectedFrentes(prev => prev.includes(f.id) ? prev.filter(id => id !== f.id) : [...prev, f.id])}
              />
            </div>
          ))}
          {frentes.length === 0 && <div className="empty-state">No hay frentes registrados.</div>}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={newFrenteId}
            onChange={e => setNewFrenteId(e.target.value.toUpperCase())}
            placeholder="Código"
            className="input-field mono"
            style={{ width: 110 }}
          />
          <input
            type="text"
            value={newFrenteNombre}
            onChange={e => setNewFrenteNombre(e.target.value)}
            placeholder="Nombre del frente o sector..."
            className="input-field"
            style={{ flex: 1, minWidth: 180 }}
          />
          <button
            onClick={() => {
              if (!newFrenteId.trim() || !newFrenteNombre.trim()) return
              setFrentes(prev => [...prev, { id: newFrenteId.trim(), nombre: newFrenteNombre.trim() }])
              setNewFrenteId("")
              setNewFrenteNombre("")
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
            <label className="field-label-sm">Empresa</label>
            <input type="text" value={projectConfig.empresa}
              onChange={e => setProjectConfig({...projectConfig, empresa: e.target.value})}
              className="input-field" style={{ width: '100%' }} />
          </div>
          <div>
            <label className="field-label-sm">Obra</label>
            <input type="text" value={projectConfig.obra}
              onChange={e => setProjectConfig({...projectConfig, obra: e.target.value})}
              className="input-field" style={{ width: '100%' }} />
          </div>
        </div>
        <div className="desktop-grid" style={{ marginTop: 12 }}>
          <div>
            <label className="field-label-sm">Código Proyecto (S10)</label>
            <input type="text" value={projectConfig.codigoProyecto}
              onChange={e => setProjectConfig({...projectConfig, codigoProyecto: e.target.value})}
              className="input-field mono" style={{ width: '100%' }} />
          </div>
          <div>
            <label className="field-label-sm">Código Nómina</label>
            <input type="text" value={projectConfig.codigoNomina}
              onChange={e => setProjectConfig({...projectConfig, codigoNomina: e.target.value})}
              className="input-field mono" style={{ width: '100%' }} />
          </div>
        </div>
        <div style={{ marginTop: 16, padding: 14, borderRadius: 12, border: "1px solid var(--border-dim)", background: "rgba(255,255,255,0.03)" }}>
          <div className="label" style={{ marginBottom: 8, color: "var(--accent-blue)" }}>CIERRE DE TAREO</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
            Fecha seleccionada: <strong style={{ color: "var(--text-main)" }}>{fechaTareo || "Sin fecha"}</strong>{" "}
            · Estado:{" "}
            <strong style={{ color: isSelectedDateClosed ? "var(--red-accent)" : "var(--accent-gold)" }}>
              {isSelectedDateClosed ? "CERRADA" : "ABIERTA"}
            </strong>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => setTareoDateClosed(fechaTareo, true)}
              className="btn-primary"
              disabled={!fechaTareo || isSelectedDateClosed}
              style={{ opacity: !fechaTareo || isSelectedDateClosed ? 0.6 : 1 }}
            >
              CERRAR FECHA SELECCIONADA
            </button>
            <button
              onClick={() => setTareoDateClosed(fechaTareo, false)}
              className="btn-pill-sm"
              disabled={!fechaTareo || !isSelectedDateClosed}
              style={{ opacity: !fechaTareo || !isSelectedDateClosed ? 0.6 : 1 }}
            >
              REABRIR FECHA
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 10 }}>
            Cuando una fecha está cerrada, un usuario común no podrá eliminar tareos de esa fecha desde la pestaña Voz. Admin y super admin sí podrán hacerlo.
          </div>
        </div>
      </div>

      {/* ── Finanzas ────────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 12, color: 'var(--accent-gold)' }}>ÁREA DE FINANZAS — CARGA DE PLANILLAS</div>
        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
          Selecciona la semana correspondiente y sube el Excel de netos calculado por contabilidad. Esto permitirá cruzar los pagos con el tareo de obra. <strong>Si subes un archivo nuevo, sobrescribirá el anterior de esa semana.</strong>
        </p>

        <div style={{ marginBottom: 12 }}>
          <label className="field-label-sm">Semana a cargar</label>
          <Select
            options={weekOptions}
            value={selectedWeek}
            onChange={setSelectedWeek}
            styles={selectStyles}
            placeholder="Selecciona la semana..."
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => netosFileRef.current?.click()}
            className="btn-import"
            style={{ flex: 1 }}
            disabled={netosImporting || !selectedWeek}
          >
            <UploadIcon /> {netosImporting ? "Cargando..." : "SUBIR EXCEL DE NETOS"}
          </button>
          <button
            onClick={handleClearNetos}
            className="btn-pill-danger"
            style={{ padding: '0 15px' }}
            disabled={netosImporting || !selectedWeek}
            title="Limpiar carga de esta semana"
          >
            <TrashIcon />
          </button>
        </div>
        <input ref={netosFileRef} type="file" hidden onChange={handleImportNetos} accept=".xlsx,.xls" />
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
