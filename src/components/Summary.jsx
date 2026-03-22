import { useState } from "react"
import { DownloadIcon, FileIcon } from "./Icons"
import { getSummary, getUniquePartidas, exportDatabaseXLSX } from "../utils/exportCSV"
import { generateWeeklyXLS, getWeekNumber } from "../utils/s10Exporter"

export default function Summary({
  registros, workers, partidas, frentes,
  actividades, tiposHora, projectConfig,
  getPartidaNombre, getFrenteNombre,
  fechaTareo,
}) {
  const [viewType, setViewType] = useState("daily") // "daily" or "weekly"
  const today = new Date()
  const [exportSemana, setExportSemana] = useState(getWeekNumber(today))
  const [exportAnio, setExportAnio] = useState(today.getFullYear())
  const [exportFeedback, setExportFeedback] = useState(null)

  // ─── Helpers ───
  const getWeekDays = (baseDate) => {
    const current = new Date(baseDate)
    const day = current.getDay()
    const diffToMonday = current.getDate() - (day === 0 ? 6 : day - 1)
    const week = []
    const dayNames = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"]
    for (let i = 0; i < 6; i++) {
      const d = new Date(new Date(baseDate).setDate(diffToMonday + i))
      week.push({
        date: d.toISOString().split("T")[0],
        label: dayNames[i],
        dayNum: d.getDate()
      })
    }
    return week
  }

  const weekRange = getWeekDays(fechaTareo)
  const dailyRegistros = registros.filter(r => r.date === fechaTareo)
  const dailySummary = getSummary(dailyRegistros)
  const allPartidas = getUniquePartidas(dailyRegistros)

  // STATS Calculation
  const totalHN = Object.values(dailySummary).reduce((s, d) => s + d.totalNormales, 0)
  const totalHE = Object.values(dailySummary).reduce((s, d) => s + d.totalExtras, 0)

  // Frente info per worker (Daily)
  const workerFrentes = {}
  for (const reg of dailyRegistros) {
    if (reg.frenteNombre) {
      if (!workerFrentes[reg.workerId]) workerFrentes[reg.workerId] = new Set()
      workerFrentes[reg.workerId].add(reg.frenteNombre)
    }
  }

  // ─── Weekly Aggregation ───
  const getWeeklyData = () => {
    const weekly = {} // workerId -> { name, Mon: {HN, HE}, Tue: {HN, HE}... }
    for (const reg of registros) {
      if (!weekly[reg.workerId]) {
        weekly[reg.workerId] = { 
          nombre: reg.workerNombre,
          days: {} 
        }
      }
      if (!weekly[reg.workerId].days[reg.date]) {
        weekly[reg.workerId].days[reg.date] = { hn: 0, he: 0 }
      }
      reg.assignments.forEach(asg => {
        weekly[reg.workerId].days[reg.date].hn += (asg.horasNormales || 0)
        weekly[reg.workerId].days[reg.date].he += (asg.horasExtras || 0)
      })
    }
    return weekly
  }
  const weeklySummary = getWeeklyData()

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
      {/* View Toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button 
          onClick={() => setViewType("daily")}
          className={`tab-button ${viewType === "daily" ? "active-pill" : ""}`}
        >
          Vista Diaria
        </button>
        <button 
          onClick={() => setViewType("weekly")}
          className={`tab-button ${viewType === "weekly" ? "active-pill" : ""}`}
        >
          Vista Semanal
        </button>
      </div>

      {viewType === "daily" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
            <div>
              <span className="label">RESUMEN DIARIO - {fechaTareo}</span>
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
                  <span className="stat-number blue">{Object.keys(dailySummary).length}</span>
                  <span className="stat-label">TRABAJADORES</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              {dailyRegistros.length > 0 && (
                <button onClick={() => exportDatabaseXLSX(dailyRegistros, workers, partidas, actividades)} className="btn-export">
                  <DownloadIcon /> Exportar Base de Datos (XLSX)
                </button>
              )}
            </div>
          </div>

          {Object.keys(dailySummary).length === 0 ? (
            <div className="empty-state">No hay registros para este día.</div>
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
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(dailySummary).map(([wId, data]) => {
                    const worker = workers.find(w => String(w.id) === wId || String(w.codigo) === wId)
                    return (
                      <tr key={wId}>
                        <td style={{ fontWeight: 600, color: "#e8dcc8" }}>{data.nombre}</td>
                        <td style={{ textAlign: "center", color: "#8899aa", fontSize: 11 }}>
                          {worker?.categoria || "—"}
                        </td>
                        <td style={{ textAlign: "center", color: "#8ab4c8", fontSize: 12 }}>
                          {workerFrentes[wId] ? [...workerFrentes[wId]].join(", ") : "—"}
                        </td>
                        {allPartidas.map((pid) => {
                          const hn = data.partidasNormales[pid] || 0
                          const he = data.partidasExtras[pid] || 0
                          const hasData = hn > 0 || he > 0
                          return (
                            <td key={pid} style={{ textAlign: "center", color: hasData ? "#c8d6e5" : "#2a3a4a", fontSize: 12 }}>
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
                        <td style={{ textAlign: "center", fontWeight: 600, color: "#d4a55a" }}>{data.totalNormales}</td>
                        <td style={{ textAlign: "center", fontWeight: 600, color: "#e88" }}>{data.totalExtras}</td>
                        <td style={{ textAlign: "center", fontWeight: 600, color: "#8ab4c8" }}>{data.totalNormales + data.totalExtras}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {viewType === "weekly" && (
        <>
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '16px', background: '#1a2a3a', borderBottom: '1px solid #233554', display: 'flex', justifyContent: 'space-between' }}>
              <span className="label">TAREO SEMANAL (LUN-SÁB)</span>
              {registros.length > 0 && (
                <button onClick={handleExportS10} style={{ padding: '4px 12px', borderRadius: '4px', background: '#64ffda', color: '#0a192f', border: 'none', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
                  XLS SEMANAL S10
                </button>
              )}
            </div>
            
            <div style={{ overflowX: "auto" }}>
              <table className="summary-table" style={{ margin: '0' }}>
                <thead>
                  <tr style={{ background: '#0a192f' }}>
                    <th style={{ textAlign: "left", padding: '12px' }}>TRABAJADOR</th>
                    {weekRange.map(day => (
                      <th key={day.date} style={{ textAlign: "center", minWidth: '60px' }}>
                        <div style={{ fontSize: '10px', color: '#8892b0' }}>{day.label}</div>
                        <div style={{ fontSize: '14px', color: day.date === fechaTareo ? '#64ffda' : '#ccd6f6' }}>{day.dayNum}</div>
                      </th>
                    ))}
                    <th style={{ textAlign: "center", background: '#112240', color: '#64ffda' }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(weeklySummary).map(([wId, data]) => {
                    let totalW_HN = 0
                    let totalW_HE = 0
                    return (
                      <tr key={wId}>
                        <td style={{ color: '#e6f1ff', fontWeight: '500' }}>{data.nombre}</td>
                        {weekRange.map(day => {
                          const dayData = data.days[day.date] || { hn: 0, he: 0 }
                          totalW_HN += dayData.hn
                          totalW_HE += dayData.he
                          return (
                            <td key={day.date} style={{ textAlign: "center", borderLeft: '1px solid #233554' }}>
                              <div style={{ fontSize: '12px' }}>
                                {dayData.hn > 0 ? <span style={{ color: '#d4a55a' }}>{dayData.hn}</span> : <span style={{ color: '#334455' }}>0</span>}
                              </div>
                              {dayData.he > 0 && <div style={{ fontSize: '10px', color: '#ff6347' }}>+{dayData.he}</div>}
                            </td>
                          )
                        })}
                        <td style={{ textAlign: "center", background: '#112240' }}>
                          <div style={{ fontWeight: 'bold', color: '#64ffda' }}>{totalW_HN}</div>
                          {totalW_HE > 0 && <div style={{ fontSize: '11px', color: '#ff6347' }}>+{totalW_HE}</div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
