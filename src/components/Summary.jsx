import { useState } from "react"
import { DownloadIcon, FileIcon } from "./Icons"
import { getSummary, getUniquePartidas, exportDatabaseXLSX } from "../utils/exportCSV"
import { generateWeeklyXLS, getWeekNumber } from "../utils/s10Exporter"

export default function Summary({
  registros, workers, partidas, frentes,
  tiposHora, projectConfig,
  getPartidaNombre, getFrenteNombre,
}) {
  const today = new Date()
  const [exportSemana, setExportSemana] = useState(getWeekNumber(today))
  const [exportAnio, setExportAnio] = useState(today.getFullYear())
  const [exportFeedback, setExportFeedback] = useState(null)

  const summary = getSummary(registros)
  const allPartidas = getUniquePartidas(registros)
  const totalHN = Object.values(summary).reduce((s, d) => s + d.totalNormales, 0)
  const totalHE = Object.values(summary).reduce((s, d) => s + d.totalExtras, 0)

  // Collect frente info per worker
  const workerFrentes = {}
  for (const reg of registros) {
    if (reg.frenteNombre) {
      if (!workerFrentes[reg.workerId]) workerFrentes[reg.workerId] = new Set()
      workerFrentes[reg.workerId].add(reg.frenteNombre)
    }
  }

  // Calculate cost totals
  const totalCostoHN = Object.values(summary).reduce((s, data) => {
    const worker = workers.find(w => String(w.id) === String(Object.keys(summary).find(k => summary[k] === data)))
    const costo = worker?.costoHora || 0
    return s + data.totalNormales * costo
  }, 0)

  const handleExportS10 = () => {
    try {
      const filename = generateWeeklyXLS({
        registros,
        workers,
        partidas,
        tiposHora: tiposHora || [],
        semana: exportSemana,
        anio: exportAnio,
        projectConfig: projectConfig || {},
      })
      setExportFeedback(`✓ Exportado: ${filename}`)
      setTimeout(() => setExportFeedback(null), 5000)
    } catch (err) {
      setExportFeedback(`Error: ${err.message}`)
      setTimeout(() => setExportFeedback(null), 5000)
    }
  }

  return (
    <div>
      {/* Stats Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 20,
        flexWrap: "wrap",
        gap: 10,
      }}>
        <div>
          <span className="label">RESUMEN DIARIO</span>
          <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
            <div>
              <span className="stat-number gold">{totalHN}</span>
              <span className="stat-label">HH NORM.</span>
            </div>
            <div>
              <span className="stat-number" style={{ color: "#e88" }}>{totalHE}</span>
              <span className="stat-label">HH EXT.</span>
            </div>
            <div>
              <span className="stat-number blue">{Object.keys(summary).length}</span>
              <span className="stat-label">TRABAJADORES</span>
            </div>
          </div>
        </div>

        {/* Export buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          {registros.length > 0 && (
            <button onClick={() => exportDatabaseXLSX(registros, workers, partidas, actividades)} className="btn-export">
              <DownloadIcon /> Exportar Base de Datos (XLSX)
            </button>
          )}
        </div>
      </div>

      {/* S10 Export Section */}
      {registros.length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <div className="label" style={{ marginBottom: 12 }}>EXPORTAR FORMATO S10</div>
          <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <label className="field-label-sm">Semana</label>
              <input
                type="number"
                min="1"
                max="53"
                value={exportSemana}
                onChange={(e) => setExportSemana(parseInt(e.target.value) || 1)}
                className="input-field mono"
                style={{ width: 70 }}
              />
            </div>
            <div>
              <label className="field-label-sm">Año</label>
              <input
                type="number"
                min="2020"
                max="2030"
                value={exportAnio}
                onChange={(e) => setExportAnio(parseInt(e.target.value) || 2026)}
                className="input-field mono"
                style={{ width: 80 }}
              />
            </div>
            <div style={{ fontSize: 11, color: "#5a7a8a", alignSelf: "center" }}>
              → TMO-{projectConfig?.codigoProyecto || "XXXXX"}-{projectConfig?.codigoNomina || "XXX"}-Sem{String(exportSemana).padStart(2, "0")}{exportAnio}.xls
            </div>
            <button
              onClick={handleExportS10}
              className="btn-export-s10"
              style={{ marginLeft: "auto" }}
            >
              <FileIcon /> Exportar XLS S10
            </button>
          </div>
          {exportFeedback && (
            <div className="alert-success" style={{ marginTop: 10, fontSize: 12 }}>
              {exportFeedback}
            </div>
          )}
        </div>
      )}

      {/* Summary Table */}
      {Object.keys(summary).length === 0 ? (
        <div className="empty-state">No hay registros para mostrar.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="summary-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>TRABAJADOR</th>
                <th style={{ textAlign: "center" }}>CAT.</th>
                <th style={{ textAlign: "center" }}>FRENTE</th>
                {allPartidas.map((pid) => (
                  <th key={pid} style={{ textAlign: "center", fontSize: 11 }}>{pid}</th>
                ))}
                <th style={{ textAlign: "center", color: "#d4a55a" }}>HN</th>
                <th style={{ textAlign: "center", color: "#e88" }}>HE</th>
                <th style={{ textAlign: "center", color: "#8ab4c8" }}>TOTAL</th>
                <th style={{ textAlign: "center", color: "#2ecc71" }}>S/.</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary).map(([wId, data]) => {
                const worker = workers.find(w => String(w.id) === wId || String(w.codigo) === wId)
                const costoH = worker?.costoHora || 0
                const costoTotal = (data.totalNormales + data.totalExtras) * costoH

                return (
                  <tr key={wId}>
                    <td style={{ fontWeight: 600, color: "#e8dcc8" }}>{data.nombre}</td>
                    <td style={{ textAlign: "center", color: "#8899aa", fontSize: 11 }}>
                      {worker?.abrevCategoria || worker?.categoria || "—"}
                    </td>
                    <td style={{ textAlign: "center", color: "#8ab4c8", fontSize: 12 }}>
                      {workerFrentes[wId] ? [...workerFrentes[wId]].join(", ") : "—"}
                    </td>
                    {allPartidas.map((pid) => {
                      const hn = data.partidasNormales[pid] || 0
                      const he = data.partidasExtras[pid] || 0
                      const hasData = hn > 0 || he > 0
                      return (
                        <td key={pid} style={{
                          textAlign: "center",
                          color: hasData ? "#c8d6e5" : "#2a3a4a",
                          fontSize: 12,
                        }}>
                          {hasData ? (
                            <span>
                              {hn > 0 && <span style={{ color: "#d4a55a" }}>{hn}</span>}
                              {hn > 0 && he > 0 && <span style={{ color: "#3a5a6a" }}> + </span>}
                              {he > 0 && <span style={{ color: "#e88" }}>{he}</span>}
                            </span>
                          ) : "—"}
                        </td>
                      )
                    })}
                    <td style={{ textAlign: "center", fontWeight: 600, color: "#d4a55a" }}>
                      {data.totalNormales}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 600, color: "#e88" }}>
                      {data.totalExtras}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 600, color: "#8ab4c8" }}>
                      {data.totalNormales + data.totalExtras}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 600, color: "#2ecc71", fontSize: 12 }}>
                      {costoH > 0 ? costoTotal.toFixed(2) : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
