import React, { useState, useMemo, useEffect } from "react"
import { DownloadIcon, FileIcon } from "./Icons"
import { exportDatabaseXLSX } from "../utils/exportCSV"
import { generateWeeklyXLS, getWeekNumber } from "../utils/s10Exporter"
import { getWeekRange } from "../utils/dateUtils"

export default function Summary({
  registros, workers, partidas, frentes,
  actividades, tiposHora, projectConfig,
  getPartidaNombre, getFrenteNombre,
  fechaTareo, setFechaTareo
}) {
  const [viewType, setViewType] = useState("worker_weekly") // "worker_weekly", "activity_daily", "activity_weekly"
  const [resumenSubView, setResumenSubView] = useState("actividad") // "actividad" | "partida"
  const today = new Date()
  const [exportSemana, setExportSemana] = useState(getWeekNumber(today))
  const [exportAnio, setExportAnio] = useState(today.getFullYear())
  const [exportFeedback, setExportFeedback] = useState(null)

  useEffect(() => {
    if (!fechaTareo) return
    const selected = new Date(`${fechaTareo}T12:00:00`)
    setExportSemana(getWeekNumber(selected))
    setExportAnio(selected.getFullYear())
  }, [fechaTareo])

  // --- Date Helpers ---
  const weekRange = useMemo(() => {
    const { dates } = getWeekRange(fechaTareo)
    const dayNamesShort = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"]
    return dates.map((date, i) => {
      const d = new Date(date + "T12:00:00") // noon to avoid DST edge cases
      return { date, label: dayNamesShort[i], dayNum: d.getDate() }
    })
  }, [fechaTareo])

  // --- Data Aggregation ---
  
  // 1. Weekly Stats by Worker (HN/HE per day)
  const workerWeeklyData = useMemo(() => {
    const summary = {} // workerId -> { name, cat, days: { date: {hn, he} } }
    registros.forEach(reg => {
      if (!summary[reg.workerId]) {
        const w = workers.find(x => x.id === reg.workerId)
        summary[reg.workerId] = { 
          nombre: reg.workerNombre, 
          categoria: w?.categoria || "PEÓN",
          days: {} 
        }
      }
      if (!summary[reg.workerId].days[reg.date]) {
        summary[reg.workerId].days[reg.date] = { hn: 0, he: 0 }
      }
      reg.assignments.forEach(asg => {
        summary[reg.workerId].days[reg.date].hn += (asg.horasNormales || 0)
        summary[reg.workerId].days[reg.date].he += (asg.horasExtras || 0)
      })
    })
    return summary
  }, [registros, workers])

  // 2. Weekly Matrix (Activity vs Day) for the whole week
  const activityWeeklyMatrix = useMemo(() => {
    const matrix = {} // actividadId -> { nombre, partida, days: { date: { hn, he } } }

    registros.forEach(reg => {
      reg.assignments.forEach(asg => {
        if (!matrix[asg.actividadId]) {
          const act = actividades?.find(a => a.id === asg.actividadId)
          const partidaId = act?.partidaId || asg.partidaId
          matrix[asg.actividadId] = {
            nombre: act?.nombre || asg.actividadId,
            partida: getPartidaNombre(partidaId),
            days: {}
          }
        }
        if (!matrix[asg.actividadId].days[reg.date]) {
          matrix[asg.actividadId].days[reg.date] = { hn: 0, he: 0 }
        }
        matrix[asg.actividadId].days[reg.date].hn += (asg.horasNormales || 0)
        matrix[asg.actividadId].days[reg.date].he += (asg.horasExtras || 0)
      })
    })

    return matrix
  }, [registros, actividades, getPartidaNombre])

  // 3a. Weekly Activity Consolidation
  const weeklyActivitySummary = useMemo(() => {
    const summary = {}
    registros.forEach(reg => {
      reg.assignments.forEach(asg => {
        if (!summary[asg.actividadId]) {
          const act = actividades?.find(a => a.id === asg.actividadId)
          summary[asg.actividadId] = { nombre: act?.nombre || asg.actividadId, totalHn: 0, totalHe: 0 }
        }
        summary[asg.actividadId].totalHn += (asg.horasNormales || 0)
        summary[asg.actividadId].totalHe += (asg.horasExtras || 0)
      })
    })
    return Object.values(summary).sort((a, b) => (b.totalHn + b.totalHe) - (a.totalHn + a.totalHe))
  }, [registros, actividades])

  // 3b. Weekly Partida Consolidation
  const weeklyPartidaSummary = useMemo(() => {
    const summary = {}
    registros.forEach(reg => {
      reg.assignments.forEach(asg => {
        const act = actividades?.find(a => a.id === asg.actividadId)
        const partidaId = act?.partidaId || asg.partidaId || "SIN_PARTIDA"
        if (!summary[partidaId]) {
          summary[partidaId] = { id: partidaId, nombre: getPartidaNombre(partidaId), totalHn: 0, totalHe: 0 }
        }
        summary[partidaId].totalHn += (asg.horasNormales || 0)
        summary[partidaId].totalHe += (asg.horasExtras || 0)
      })
    })
    return Object.values(summary).sort((a, b) => (b.totalHn + b.totalHe) - (a.totalHn + a.totalHe))
  }, [registros, actividades, getPartidaNombre])

  const handleExportS10 = () => {
    try {
      const filename = generateWeeklyXLS({
        registros, workers, partidas,
        tiposHora: tiposHora || [],
        semana: exportSemana,
        anio: exportAnio,
        projectConfig: projectConfig || {},
      })
      setExportFeedback(`✓ Exportado: ${filename}`)
      setTimeout(() => setExportFeedback(null), 5000)
    } catch (err) {
      setExportFeedback(`Error: ${err.message}`)
    }
  }

  const handleExportDatabase = () => {
    try {
      exportDatabaseXLSX(registros, workers, partidas, actividades)
      setExportFeedback("✓ Base de datos exportada a Excel.")
      setTimeout(() => setExportFeedback(null), 5000)
    } catch (err) {
      setExportFeedback(`Error: ${err.message}`)
    }
  }

  return (
    <div className="summary-container">
      {/* View Selectors - High Density */}
      <div className="view-selector-pill" style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '12px', marginBottom: '24px', width: 'fit-content' }}>
        <button onClick={() => setViewType("worker_weekly")} className={`pill-btn ${viewType === "worker_weekly" ? "active" : ""}`}>PLANILLA SEMANAL</button>
        <button onClick={() => setViewType("activity_daily")} className={`pill-btn ${viewType === "activity_daily" ? "active" : ""}`}>TAREO X ACTIVIDAD</button>
        <button onClick={() => setViewType("activity_weekly")} className={`pill-btn ${viewType === "activity_weekly" ? "active" : ""}`}>RESUMEN SEMANAL</button>
      </div>

      {exportFeedback && <div className="alert-success" style={{ marginBottom: 16 }}>{exportFeedback}</div>}

      {/* VIEW 1: Worker Weekly (Payroll Style) */}
      {viewType === "worker_weekly" && (
        <div className="card full-width-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header-dark" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px' }}>
            <span className="label">REPORTE DE TAREO DE PERSONAL OBRERO</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={handleExportDatabase} className="btn-export-sm" style={{ background: 'var(--border-dim)' }}>
                <FileIcon /> EXPORTAR BD
              </button>
              <button onClick={handleExportS10} className="btn-export-sm">
                <DownloadIcon /> EXPORTAR S10
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th rowSpan="2">TRABAJADOR</th>
                  <th rowSpan="2">CAT.</th>
                  {weekRange.map(d => (
                    <th key={d.date} colSpan="2" className="text-center">{d.label} {d.dayNum}</th>
                  ))}
                  <th colSpan="5" className="text-center" style={{ background: 'rgba(100,255,218,0.1)' }}>TOTALES</th>
                </tr>
                <tr>
                  {weekRange.map(d => (
                    <React.Fragment key={`sub-${d.date}`}>
                      <th className="sub-th">HN</th>
                      <th className="sub-th">HE</th>
                    </React.Fragment>
                  ))}
                  <th className="sub-th" style={{ color: 'var(--accent-gold)', minWidth: '60px' }}>T. NORMAL</th>
                  <th className="sub-th" style={{ color: '#ef4444', minWidth: '60px' }}>T. EXTRA</th>
                  <th className="sub-th" style={{ color: '#ff6b6b', fontSize: '9px' }}>EXT 60%</th>
                  <th className="sub-th" style={{ color: '#ff6b6b', fontSize: '9px' }}>EXT 100%</th>
                  <th className="sub-th" style={{ fontWeight: '800', minWidth: '70px' }}>T. TRAB.</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(workerWeeklyData).map(([wId, data]) => {
                  let rowTotalHn = 0; let rowTotalHe = 0;
                  return (
                    <tr key={wId}>
                      <td className="worker-name-col">{data.nombre}</td>
                      <td className="text-center cat-col">{data.categoria}</td>
                      {weekRange.map(d => {
                        const day = data.days[d.date] || { hn: 0, he: 0 }
                        rowTotalHn += day.hn; rowTotalHe += day.he;
                        return (
                          <React.Fragment key={`${wId}-${d.date}`}>
                            <td className="text-center val-col">{day.hn || '—'}</td>
                            <td className="text-center val-col he-text">{day.he || '—'}</td>
                          </React.Fragment>
                        )
                      })}
                      <td className="text-center val-col total-col-hn">{rowTotalHn}</td>
                      <td className="text-center val-col total-col-he">{rowTotalHe}</td>
                      <td className="text-center val-col text-dim">0</td>
                      <td className="text-center val-col text-dim">0</td>
                      <td className="text-center val-col total-col-final">{rowTotalHn + rowTotalHe}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: Activity Weekly Matrix (Actividad × Día) */}
      {viewType === "activity_daily" && (
        <div className="card full-width-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header-dark" style={{ padding: '16px' }}>
            <span className="label">TAREO SEMANAL POR ACTIVIDAD</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '240px' }}>ACTIVIDAD</th>
                  <th style={{ minWidth: '160px' }}>PARTIDA DE CONTROL</th>
                  {weekRange.map(d => (
                    <th key={d.date} className="text-center" style={{ minWidth: '52px' }}>{d.label}<br/><span style={{ fontSize: '9px', fontWeight: 400 }}>{d.dayNum}</span></th>
                  ))}
                  <th className="text-center" style={{ background: 'rgba(37,99,235,0.12)', minWidth: '56px' }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(activityWeeklyMatrix).length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>Sin registros esta semana</td></tr>
                )}
                {Object.entries(activityWeeklyMatrix).map(([actId, data]) => {
                  let rowTotal = 0
                  return (
                    <tr key={actId}>
                      <td>
                        <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '12px' }}>{data.nombre}</div>
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{data.partida}</td>
                      {weekRange.map(d => {
                        const cell = data.days[d.date] || { hn: 0, he: 0 }
                        const total = cell.hn + cell.he
                        rowTotal += total
                        return (
                          <td key={d.date} className="text-center val-col">
                            {total > 0 ? (
                              <span>
                                {cell.hn > 0 && <span style={{ color: 'var(--text-dim)' }}>{cell.hn}</span>}
                                {cell.he > 0 && <span style={{ color: 'var(--accent-gold)', fontSize: '10px' }}>+{cell.he}</span>}
                              </span>
                            ) : '—'}
                          </td>
                        )
                      })}
                      <td className="text-center val-col total-col-final">{rowTotal > 0 ? rowTotal : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: Resumen Semanal — Por Actividad o Por Partida */}
      {viewType === "activity_weekly" && (
        <div>
          {/* Sub-toggle */}
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '10px', marginBottom: '16px', width: 'fit-content' }}>
            <button onClick={() => setResumenSubView("actividad")} className={`pill-btn ${resumenSubView === "actividad" ? "active" : ""}`}>POR ACTIVIDAD</button>
            <button onClick={() => setResumenSubView("partida")} className={`pill-btn ${resumenSubView === "partida" ? "active" : ""}`}>POR PARTIDA DE CONTROL</button>
          </div>

          {resumenSubView === "actividad" && (
            <div className="card full-width-card" style={{ padding: 0 }}>
              <div className="card-header-dark" style={{ padding: '14px 16px' }}>
                <span className="label">RESUMEN POR ACTIVIDAD — SEMANA</span>
              </div>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>ACTIVIDAD</th>
                    <th className="text-center" style={{ minWidth: '70px' }}>HN</th>
                    <th className="text-center" style={{ minWidth: '70px' }}>HE</th>
                    <th className="text-center" style={{ minWidth: '80px' }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyActivitySummary.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>Sin registros esta semana</td></tr>
                  )}
                  {weeklyActivitySummary.map((data, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: '600' }}>{data.nombre}</td>
                      <td className="text-center mono" style={{ color: 'var(--accent-gold)' }}>{data.totalHn.toFixed(1)}</td>
                      <td className="text-center mono" style={{ color: '#ef4444' }}>{data.totalHe.toFixed(1)}</td>
                      <td className="text-center mono total-col-final">{(data.totalHn + data.totalHe).toFixed(1)}</td>
                    </tr>
                  ))}
                  {weeklyActivitySummary.length > 0 && (() => {
                    const totHn = weeklyActivitySummary.reduce((s, d) => s + d.totalHn, 0)
                    const totHe = weeklyActivitySummary.reduce((s, d) => s + d.totalHe, 0)
                    return (
                      <tr style={{ background: 'rgba(37,99,235,0.08)' }}>
                        <td style={{ fontWeight: '800', color: 'var(--accent-blue)' }}>TOTAL</td>
                        <td className="text-center mono" style={{ color: 'var(--accent-gold)', fontWeight: 800 }}>{totHn.toFixed(1)}</td>
                        <td className="text-center mono" style={{ color: '#ef4444', fontWeight: 800 }}>{totHe.toFixed(1)}</td>
                        <td className="text-center mono total-col-final" style={{ fontSize: '14px' }}>{(totHn + totHe).toFixed(1)}</td>
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {resumenSubView === "partida" && (
            <div className="card full-width-card" style={{ padding: 0 }}>
              <div className="card-header-dark" style={{ padding: '14px 16px' }}>
                <span className="label">RESUMEN POR PARTIDA DE CONTROL — SEMANA</span>
              </div>
              <table className="report-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: '120px' }}>CÓDIGO</th>
                    <th>PARTIDA DE CONTROL</th>
                    <th className="text-center" style={{ minWidth: '70px' }}>HN</th>
                    <th className="text-center" style={{ minWidth: '70px' }}>HE</th>
                    <th className="text-center" style={{ minWidth: '80px' }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyPartidaSummary.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>Sin registros esta semana</td></tr>
                  )}
                  {weeklyPartidaSummary.map((data, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ color: 'var(--accent-gold)', fontSize: '11px' }}>{data.id}</td>
                      <td style={{ fontWeight: '600' }}>{data.nombre}</td>
                      <td className="text-center mono" style={{ color: 'var(--accent-gold)' }}>{data.totalHn.toFixed(1)}</td>
                      <td className="text-center mono" style={{ color: '#ef4444' }}>{data.totalHe.toFixed(1)}</td>
                      <td className="text-center mono total-col-final">{(data.totalHn + data.totalHe).toFixed(1)}</td>
                    </tr>
                  ))}
                  {weeklyPartidaSummary.length > 0 && (() => {
                    const totHn = weeklyPartidaSummary.reduce((s, d) => s + d.totalHn, 0)
                    const totHe = weeklyPartidaSummary.reduce((s, d) => s + d.totalHe, 0)
                    return (
                      <tr style={{ background: 'rgba(37,99,235,0.08)' }}>
                        <td />
                        <td style={{ fontWeight: '800', color: 'var(--accent-blue)' }}>TOTAL</td>
                        <td className="text-center mono" style={{ color: 'var(--accent-gold)', fontWeight: 800 }}>{totHn.toFixed(1)}</td>
                        <td className="text-center mono" style={{ color: '#ef4444', fontWeight: 800 }}>{totHe.toFixed(1)}</td>
                        <td className="text-center mono total-col-final" style={{ fontSize: '14px' }}>{(totHn + totHe).toFixed(1)}</td>
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .pill-btn {
          background: transparent;
          border: none;
          color: var(--text-dim);
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .pill-btn.active {
          background: var(--accent-blue);
          color: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .report-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .report-table th {
          background: var(--bg-card);
          padding: 12px 8px;
          border: 1px solid var(--border-dim);
          color: var(--accent-blue);
          font-weight: 800;
          letter-spacing: 0.5px;
        }
        .report-table td {
          padding: 10px 8px;
          border: 1px solid var(--border-dim);
          color: var(--text-dim);
        }
        .sub-th {
          font-size: 10px;
          padding: 4px !important;
          background: #0f1d2f !important;
          color: var(--text-dim) !important;
        }
        .worker-name-col {
          color: var(--text-main) !important;
          font-weight: 600;
          min-width: 200px;
        }
        .val-col {
          min-width: 40px;
          font-family: var(--font-mono);
        }
        .he-text { color: #ef4444; font-size: 11px; }
        .text-center { text-align: center; }
        .btn-export-sm {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          background: var(--accent-blue);
          border: none;
          border-radius: 4px;
          color: white;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
        }
        .rotated-th {
          min-width: 40px;
          vertical-align: bottom;
          padding: 20px 5px !important;
        }
        .rotated-th span {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          white-space: nowrap;
          font-size: 10px;
        }
        .total-col-hn { color: var(--accent-gold); font-weight: 800; background: rgba(212,165,90,0.05); }
        .total-col-he { color: #ef4444; font-weight: 800; background: rgba(239,68,68,0.05); }
        .total-col-final { color: var(--accent-blue); font-weight: 900; background: rgba(37,99,235,0.05); font-size: 13px; }
      `}</style>
    </div>
  )
}
