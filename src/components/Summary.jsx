import React, { useState, useMemo } from "react"
import { DownloadIcon, FileIcon } from "./Icons"
import { exportDatabaseXLSX } from "../utils/exportCSV"
import { generateWeeklyXLS, getWeekNumber } from "../utils/s10Exporter"

export default function Summary({
  registros, workers, partidas, frentes,
  actividades, tiposHora, projectConfig,
  getPartidaNombre, getFrenteNombre,
  fechaTareo, setFechaTareo
}) {
  const [viewType, setViewType] = useState("worker_weekly") // "worker_weekly", "activity_daily", "activity_weekly"
  const today = new Date()
  const [exportSemana, setExportSemana] = useState(getWeekNumber(today))
  const [exportAnio, setExportAnio] = useState(today.getFullYear())
  const [exportFeedback, setExportFeedback] = useState(null)

  // --- Date Helpers ---
  const weekRange = useMemo(() => {
    const current = new Date(fechaTareo)
    const day = current.getDay()
    const diffToMonday = current.getDate() - (day === 0 ? 6 : day - 1)
    const week = []
    const dayNamesShort = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"]
    for (let i = 0; i < 6; i++) {
      const d = new Date(new Date(fechaTareo).setDate(diffToMonday + i))
      week.push({
        date: d.toISOString().split("T")[0],
        label: dayNamesShort[i],
        dayNum: d.getDate()
      })
    }
    return week
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

  // 2. Daily Matrix (Activity vs Worker) for the currently selected date
  const activityDailyMatrix = useMemo(() => {
    const dailyRegs = registros.filter(r => r.date === fechaTareo)
    const matrix = {} // actividadId -> { name, partidaName, workers: { workerId: {hn, he} } }
    const workersPresent = new Set()

    dailyRegs.forEach(reg => {
      workersPresent.add(reg.workerId)
      reg.assignments.forEach(asg => {
        if (!matrix[asg.actividadId]) {
          const act = actividades?.find(a => a.id === asg.actividadId)
          matrix[asg.actividadId] = {
            nombre: act?.nombre || asg.actividadId,
            partida: getPartidaNombre(asg.partidaId),
            workers: {}
          }
        }
        if (!matrix[asg.actividadId].workers[reg.workerId]) {
          matrix[asg.actividadId].workers[reg.workerId] = { hn: 0, he: 0 }
        }
        matrix[asg.actividadId].workers[reg.workerId].hn += (asg.horasNormales || 0)
        matrix[asg.actividadId].workers[reg.workerId].he += (asg.horasExtras || 0)
      })
    })

    return { matrix, workerIds: Array.from(workersPresent) }
  }, [registros, fechaTareo, actividades, getPartidaNombre])

  // 3. Weekly Activity Consolidation
  const weeklyActivitySummary = useMemo(() => {
    const summary = {} // actividadId -> { nombre, totalHn, totalHe }
    registros.forEach(reg => {
      reg.assignments.forEach(asg => {
        if (!summary[asg.actividadId]) {
          const act = actividades?.find(a => a.id === asg.actividadId)
          summary[asg.actividadId] = {
            nombre: act?.nombre || asg.actividadId,
            totalHn: 0,
            totalHe: 0
          }
        }
        summary[asg.actividadId].totalHn += (asg.horasNormales || 0)
        summary[asg.actividadId].totalHe += (asg.horasExtras || 0)
      })
    })
    return summary
  }, [registros, actividades])

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
            <button onClick={handleExportS10} className="btn-export-sm">EXPORTAR S10</button>
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

      {/* VIEW 2: Activity Daily (Maestro Style) */}
      {viewType === "activity_daily" && (
        <div className="card full-width-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header-dark" style={{ padding: '16px' }}>
            <span className="label">TAREO DIARIO POR ACTIVIDAD - {fechaTareo}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '250px' }}>ACTIVIDAD / PARTIDA DE CONTROL</th>
                  {activityDailyMatrix.workerIds.map(id => {
                    const w = workers.find(x => x.id === id)
                    return <th key={id} className="text-center rotated-th"><span>{w?.nombre.split(',')[0]}</span></th>
                  })}
                  <th className="text-center" style={{ background: 'rgba(100,255,218,0.1)' }}>T. HORAS</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(activityDailyMatrix.matrix).map(([actId, data]) => {
                  let actTotal = 0
                  // Ensure name is used, not ID
                  const displayName = data.nombre || actividades?.find(a => a.id === actId)?.nombre || actId
                  return (
                    <tr key={actId}>
                      <td>
                        <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '13px' }}>{displayName}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{data.partida}</div>
                      </td>
                      {activityDailyMatrix.workerIds.map(wId => {
                        const val = data.workers[wId] || { hn: 0, he: 0 }
                        const total = val.hn + val.he
                        actTotal += total
                        return <td key={wId} className="text-center val-col">{total || '—'}</td>
                      })}
                      <td className="text-center val-col" style={{ fontWeight: '800', background: 'rgba(255,255,255,0.03)' }}>{actTotal}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: Activity Weekly (Consolidated) */}
      {viewType === "activity_weekly" && (
        <div className="card" style={{ maxWidth: '800px', margin: '0 auto', padding: 0 }}>
          <div className="card-header-dark" style={{ padding: '16px' }}>
            <span className="label">RESUMEN DE ACTIVIDADES (TOTAL SEMANA)</span>
          </div>
          <table className="report-table">
            <thead>
              <tr>
                <th>ACTIVIDAD</th>
                <th className="text-center">TOTAL HN</th>
                <th className="text-center">TOTAL HE</th>
                <th className="text-center">TOTAL HORAS</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(weeklyActivitySummary).map(([id, data]) => (
                <tr key={id}>
                  <td style={{ fontWeight: '600' }}>{data.nombre}</td>
                  <td className="text-center mono" style={{ color: 'var(--accent-gold)' }}>{data.totalHn.toFixed(1)}</td>
                  <td className="text-center mono" style={{ color: '#ef4444' }}>{data.totalHe.toFixed(1)}</td>
                  <td className="text-center mono" style={{ fontWeight: '800', borderLeft: '1px solid var(--border-dim)' }}>
                    {(data.totalHn + data.totalHe).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
