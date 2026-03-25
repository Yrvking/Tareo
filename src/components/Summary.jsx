import React, { useState, useMemo, useEffect } from "react"
import { DownloadIcon, FileIcon } from "./Icons"
import { getAccountingExportIssues } from "../utils/exportCSV"
import { generateWeeklyXLS, getWeekNumber } from "../utils/s10Exporter"
import { getWeekRange } from "../utils/dateUtils"
import { getWorkerCategoryLabel } from "../utils/workerCategory"

function formatDateLabel(dateString) {
  const date = new Date(`${dateString}T12:00:00`)
  return date.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export default function Summary({
  registros, workers, partidas,
  actividades, tiposHora, projectConfig,
  getPartidaNombre,
  fechaTareo,
}) {
  const [viewType, setViewType] = useState("worker_weekly")
  const [activityViewMode, setActivityViewMode] = useState("daily")
  const [resumenSubView, setResumenSubView] = useState("actividad")
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

  const weekRange = useMemo(() => {
    const { dates } = getWeekRange(fechaTareo)
    const dayNamesShort = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]
    return dates.map((date, i) => {
      const d = new Date(`${date}T12:00:00`)
      return { date, label: dayNamesShort[i], dayNum: d.getDate() }
    })
  }, [fechaTareo])

  const activityMap = useMemo(
    () => new Map((actividades || []).map((item) => [String(item.id), item])),
    [actividades]
  )

  const workerMap = useMemo(
    () => new Map((workers || []).flatMap((worker) => {
      const keys = [worker.id, worker.codigo].filter(Boolean)
      return keys.map((key) => [String(key), worker])
    })),
    [workers]
  )

  const workerWeeklyData = useMemo(() => {
    const summary = {}
    registros.forEach((reg) => {
      if (!summary[reg.workerId]) {
        const worker = workerMap.get(String(reg.workerId))
        summary[reg.workerId] = {
          nombre: reg.workerNombre,
          categoria: getWorkerCategoryLabel(worker, { fallback: "PEÓN" }),
          days: {},
        }
      }

      if (!summary[reg.workerId].days[reg.date]) {
        summary[reg.workerId].days[reg.date] = { hn: 0, he: 0 }
      }

      reg.assignments.forEach((assignment) => {
        summary[reg.workerId].days[reg.date].hn += (assignment.horasNormales || 0)
        summary[reg.workerId].days[reg.date].he += (assignment.horasExtras || 0)
      })
    })
    return summary
  }, [registros, workerMap])

  const activityWeeklyMatrix = useMemo(() => {
    const matrix = {}

    registros.forEach((reg) => {
      reg.assignments.forEach((assignment) => {
        if (!matrix[assignment.actividadId]) {
          const activity = activityMap.get(String(assignment.actividadId))
          const partidaId = activity?.partidaId || assignment.partidaId || ""
          matrix[assignment.actividadId] = {
            actividadId: assignment.actividadId,
            nombre: activity?.nombre || assignment.actividadId,
            partidaId,
            partida: partidaId ? `${partidaId} - ${getPartidaNombre(partidaId)}` : "Sin partida",
            days: {},
          }
        }

        if (!matrix[assignment.actividadId].days[reg.date]) {
          matrix[assignment.actividadId].days[reg.date] = { hn: 0, he: 0 }
        }

        matrix[assignment.actividadId].days[reg.date].hn += (assignment.horasNormales || 0)
        matrix[assignment.actividadId].days[reg.date].he += (assignment.horasExtras || 0)
      })
    })

    return Object.values(matrix).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  }, [registros, activityMap, getPartidaNombre])

  const dailyActivityReport = useMemo(() => {
    const dailyRegs = registros.filter((reg) => reg.date === fechaTareo)
    const workersToday = Array.from(
      new Map(
        dailyRegs.map((reg) => {
          const worker = workerMap.get(String(reg.workerId))
          return [String(reg.workerId), {
            id: String(reg.workerId),
            nombre: worker?.nombre || reg.workerNombre || reg.workerId,
          }]
        })
      ).values()
    ).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))

    const rowMap = new Map()
    dailyRegs.forEach((reg) => {
      reg.assignments.forEach((assignment) => {
        const activity = activityMap.get(String(assignment.actividadId))
        const partidaId = activity?.partidaId || assignment.partidaId || ""
        const key = `${assignment.actividadId}__${partidaId}`
        const total = (assignment.horasNormales || 0) + (assignment.horasExtras || 0)

        if (!rowMap.has(key)) {
          rowMap.set(key, {
            actividadId: assignment.actividadId,
            nombre: activity?.nombre || assignment.actividadId,
            partidaId,
            partidaNombre: partidaId ? getPartidaNombre(partidaId) : "Sin partida",
            total: 0,
            hoursByWorker: {},
          })
        }

        const row = rowMap.get(key)
        row.total += total
        row.hoursByWorker[String(reg.workerId)] = (row.hoursByWorker[String(reg.workerId)] || 0) + total
      })
    })

    const rows = Array.from(rowMap.values())
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
      .map((row, index) => ({ ...row, item: index + 1 }))

    const totalsByWorker = {}
    workersToday.forEach((worker) => {
      totalsByWorker[worker.id] = rows.reduce((sum, row) => sum + (row.hoursByWorker[worker.id] || 0), 0)
    })

    return {
      workersToday,
      rows,
      totalsByWorker,
      grandTotal: rows.reduce((sum, row) => sum + row.total, 0),
    }
  }, [registros, fechaTareo, workerMap, activityMap, getPartidaNombre])

  const weeklyActivitySummary = useMemo(() => {
    const summary = {}
    registros.forEach((reg) => {
      reg.assignments.forEach((assignment) => {
        if (!summary[assignment.actividadId]) {
          const activity = activityMap.get(String(assignment.actividadId))
          summary[assignment.actividadId] = {
            nombre: activity?.nombre || assignment.actividadId,
            totalHn: 0,
            totalHe: 0,
          }
        }
        summary[assignment.actividadId].totalHn += (assignment.horasNormales || 0)
        summary[assignment.actividadId].totalHe += (assignment.horasExtras || 0)
      })
    })
    return Object.values(summary).sort((a, b) => (b.totalHn + b.totalHe) - (a.totalHn + a.totalHe))
  }, [registros, activityMap])

  const weeklyPartidaSummary = useMemo(() => {
    const summary = {}
    registros.forEach((reg) => {
      reg.assignments.forEach((assignment) => {
        const activity = activityMap.get(String(assignment.actividadId))
        const partidaId = activity?.partidaId || assignment.partidaId || "SIN_PARTIDA"
        if (!summary[partidaId]) {
          summary[partidaId] = {
            id: partidaId,
            nombre: getPartidaNombre(partidaId),
            totalHn: 0,
            totalHe: 0,
          }
        }
        summary[partidaId].totalHn += (assignment.horasNormales || 0)
        summary[partidaId].totalHe += (assignment.horasExtras || 0)
      })
    })
    return Object.values(summary).sort((a, b) => (b.totalHn + b.totalHe) - (a.totalHn + a.totalHe))
  }, [registros, activityMap, getPartidaNombre])

  const accountingIssues = useMemo(
    () => getAccountingExportIssues(registros, workers),
    [registros, workers]
  )

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
    }
  }

  const handleExportPlanillaExcel = async () => {
    try {
      const { exportStyledPlanillaWorkbook } = await import("../utils/planillaExports")
      const filename = await exportStyledPlanillaWorkbook({
        fechaTareo,
        projectConfig,
        weekRange,
        workerWeeklyData,
        dailyActivityReport,
        activityWeeklyMatrix,
        weeklyActivitySummary,
        weeklyPartidaSummary,
      })
      setExportFeedback(`✓ Exportado Excel visual: ${filename}`)
      setTimeout(() => setExportFeedback(null), 5000)
    } catch (err) {
      setExportFeedback(`Error: ${err.message}`)
    }
  }

  const handleExportAccounting = async () => {
    try {
      const { exportAccountingWorkbook } = await import("../utils/planillaExports")
      const filename = await exportAccountingWorkbook({
        registros,
        workers,
        partidas,
        actividades,
        fechaTareo,
        projectConfig,
        weekRange,
      })
      setExportFeedback(`✓ Exportado contabilidad: ${filename}`)
      setTimeout(() => setExportFeedback(null), 5000)
    } catch (err) {
      setExportFeedback(`Error: ${err.message}`)
    }
  }

  return (
    <div className="summary-container">
      <div className="summary-toolbar">
        <div className="view-selector-pill summary-top-toggle">
          <button onClick={() => setViewType("worker_weekly")} className={`pill-btn ${viewType === "worker_weekly" ? "active" : ""}`}>PLANILLA SEMANAL</button>
          <button onClick={() => setViewType("activity_daily")} className={`pill-btn ${viewType === "activity_daily" ? "active" : ""}`}>TAREO X ACTIVIDAD</button>
          <button onClick={() => setViewType("activity_weekly")} className={`pill-btn ${viewType === "activity_weekly" ? "active" : ""}`}>RESUMEN SEMANAL</button>
        </div>
        <div className="summary-toolbar-actions">
          <button onClick={handleExportPlanillaExcel} className="btn-export-sm" style={{ background: "var(--border-dim)" }}>
            <FileIcon /> EXPORTAR CUADROS EXCEL
          </button>
          <button onClick={handleExportAccounting} className="btn-export-sm" style={{ background: "rgba(37,99,235,0.14)" }}>
            <DownloadIcon /> EXPORTAR CONTABILIDAD
          </button>
          <button onClick={handleExportS10} className="btn-export-sm">
            <DownloadIcon /> EXPORTAR S10
          </button>
        </div>
      </div>

      {exportFeedback && <div className="alert-success" style={{ marginBottom: 16 }}>{exportFeedback}</div>}

      {viewType === "worker_weekly" && accountingIssues.length > 0 && (
        <div className="alert-error" style={{ marginBottom: 16 }}>
          <strong>Contabilidad requiere datos completos por trabajador.</strong> Faltan DNI, Categoría o Fecha de Ingreso en {accountingIssues.length} trabajador(es):{" "}
          {accountingIssues.slice(0, 6).map((issue) => `${issue.nombre} [${issue.missing.join(", ")}]`).join(" · ")}
          {accountingIssues.length > 6 ? " ..." : ""}
        </div>
      )}

      {viewType === "worker_weekly" && (
        <div className="card full-width-card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="card-header-dark summary-header-bar">
            <span className="label">REPORTE DE TAREO DE PERSONAL OBRERO</span>
            <span className="summary-helper-text">Exporta visual, contabilidad o S10 desde la barra superior.</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th rowSpan="2">TRABAJADOR</th>
                  <th rowSpan="2">CAT.</th>
                  {weekRange.map((day) => (
                    <th key={day.date} colSpan="2" className="text-center">{day.label} {day.dayNum}</th>
                  ))}
                  <th colSpan="5" className="text-center" style={{ background: "rgba(100,255,218,0.1)" }}>TOTALES</th>
                </tr>
                <tr>
                  {weekRange.map((day) => (
                    <React.Fragment key={`sub-${day.date}`}>
                      <th className="sub-th">HN</th>
                      <th className="sub-th">HE</th>
                    </React.Fragment>
                  ))}
                  <th className="sub-th" style={{ color: "var(--accent-gold)", minWidth: "60px" }}>T. NORMAL</th>
                  <th className="sub-th" style={{ color: "#ef4444", minWidth: "60px" }}>T. EXTRA</th>
                  <th className="sub-th" style={{ color: "#ff6b6b", fontSize: "9px" }}>EXT 60%</th>
                  <th className="sub-th" style={{ color: "#ff6b6b", fontSize: "9px" }}>EXT 100%</th>
                  <th className="sub-th" style={{ fontWeight: "800", minWidth: "70px" }}>T. TRAB.</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(workerWeeklyData).map(([workerId, data]) => {
                  let rowTotalHn = 0
                  let rowTotalHe = 0
                  return (
                    <tr key={workerId}>
                      <td className="worker-name-col">{data.nombre}</td>
                      <td className="text-center cat-col">{data.categoria}</td>
                      {weekRange.map((day) => {
                        const cell = data.days[day.date] || { hn: 0, he: 0 }
                        rowTotalHn += cell.hn
                        rowTotalHe += cell.he
                        return (
                          <React.Fragment key={`${workerId}-${day.date}`}>
                            <td className="text-center val-col">{cell.hn || "—"}</td>
                            <td className="text-center val-col he-text">{cell.he || "—"}</td>
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

      {viewType === "activity_daily" && (
        <div>
          <div className="view-selector-pill summary-sub-toggle" style={{ marginBottom: 14 }}>
            <button onClick={() => setActivityViewMode("daily")} className={`pill-btn ${activityViewMode === "daily" ? "active" : ""}`}>DIARIO</button>
            <button onClick={() => setActivityViewMode("weekly")} className={`pill-btn ${activityViewMode === "weekly" ? "active" : ""}`}>SEMANAL</button>
          </div>

          {activityViewMode === "daily" && (
            <div className="card full-width-card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="card-header-dark summary-header-stack">
                <span className="label">TAREO DIARIO POR ACTIVIDAD</span>
                <span className="summary-helper-text">{formatDateLabel(fechaTareo)}</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="report-table activity-daily-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: "60px" }}>ITEM</th>
                      <th style={{ minWidth: "240px" }}>ACTIVIDAD</th>
                      <th style={{ minWidth: "220px" }}>PARTIDA DE CONTROL</th>
                      <th className="text-center" style={{ minWidth: "84px" }}>TOTAL HORAS</th>
                      {dailyActivityReport.workersToday.map((worker, index) => (
                        <th
                          key={worker.id}
                          className="rotated-worker-th"
                          style={{ background: index % 2 === 0 ? "#1bdde5" : "#ff4fd1" }}
                        >
                          <span>{worker.nombre}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dailyActivityReport.rows.length === 0 && (
                      <tr>
                        <td colSpan={4 + Math.max(dailyActivityReport.workersToday.length, 1)} style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
                          Sin registros para la fecha seleccionada
                        </td>
                      </tr>
                    )}
                    {dailyActivityReport.rows.map((row) => (
                      <tr key={`${row.actividadId}-${row.partidaId}`}>
                        <td className="text-center mono">{row.item}</td>
                        <td style={{ fontWeight: 600, color: "var(--text-main)" }}>{row.nombre}</td>
                        <td style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                          <span className="mono" style={{ color: "var(--accent-blue)", marginRight: 4 }}>{row.partidaId}</span>
                          {row.partidaNombre}
                        </td>
                        <td className="text-center val-col total-col-final">{row.total.toFixed(2)}</td>
                        {dailyActivityReport.workersToday.map((worker) => {
                          const hours = row.hoursByWorker[worker.id] || 0
                          return (
                            <td key={`${row.actividadId}-${worker.id}`} className="text-center val-col">
                              {hours > 0 ? hours.toFixed(2) : "—"}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    {dailyActivityReport.rows.length > 0 && (
                      <tr style={{ background: "rgba(37,99,235,0.08)" }}>
                        <td />
                        <td style={{ fontWeight: 800, color: "var(--accent-blue)" }}>TOTAL</td>
                        <td />
                        <td className="text-center val-col total-col-final">{dailyActivityReport.grandTotal.toFixed(2)}</td>
                        {dailyActivityReport.workersToday.map((worker) => (
                          <td key={`total-${worker.id}`} className="text-center val-col total-col-hn">
                            {(dailyActivityReport.totalsByWorker[worker.id] || 0).toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activityViewMode === "weekly" && (
            <div className="card full-width-card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="card-header-dark summary-header-stack">
                <span className="label">TAREO SEMANAL POR ACTIVIDAD</span>
                <span className="summary-helper-text">Matriz consolidada de la semana activa</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: "240px" }}>ACTIVIDAD</th>
                      <th style={{ minWidth: "180px" }}>PARTIDA DE CONTROL</th>
                      {weekRange.map((day) => (
                        <th key={day.date} className="text-center" style={{ minWidth: "52px" }}>
                          {day.label}
                          <br />
                          <span style={{ fontSize: "9px", fontWeight: 400 }}>{day.dayNum}</span>
                        </th>
                      ))}
                      <th className="text-center" style={{ background: "rgba(37,99,235,0.12)", minWidth: "56px" }}>TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityWeeklyMatrix.length === 0 && (
                      <tr>
                        <td colSpan={weekRange.length + 3} style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
                          Sin registros esta semana
                        </td>
                      </tr>
                    )}
                    {activityWeeklyMatrix.map((data) => {
                      let rowTotal = 0
                      return (
                        <tr key={`${data.actividadId}-${data.partidaId}`}>
                          <td>
                            <div style={{ fontWeight: 700, color: "var(--text-main)", fontSize: "12px" }}>{data.nombre}</div>
                          </td>
                          <td style={{ fontSize: "11px", color: "var(--text-dim)" }}>{data.partida}</td>
                          {weekRange.map((day) => {
                            const cell = data.days[day.date] || { hn: 0, he: 0 }
                            const total = cell.hn + cell.he
                            rowTotal += total
                            return (
                              <td key={`${data.actividadId}-${day.date}`} className="text-center val-col">
                                {total > 0 ? total.toFixed(1) : "—"}
                              </td>
                            )
                          })}
                          <td className="text-center val-col total-col-final">{rowTotal > 0 ? rowTotal.toFixed(1) : "—"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {viewType === "activity_weekly" && (
        <div>
          <div className="view-selector-pill summary-sub-toggle" style={{ marginBottom: 16 }}>
            <button onClick={() => setResumenSubView("actividad")} className={`pill-btn ${resumenSubView === "actividad" ? "active" : ""}`}>POR ACTIVIDAD</button>
            <button onClick={() => setResumenSubView("partida")} className={`pill-btn ${resumenSubView === "partida" ? "active" : ""}`}>POR PARTIDA DE CONTROL</button>
          </div>

          {resumenSubView === "actividad" && (
            <div className="card full-width-card" style={{ padding: 0 }}>
              <div className="card-header-dark" style={{ padding: "14px 16px" }}>
                <span className="label">RESUMEN POR ACTIVIDAD — SEMANA</span>
              </div>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>ACTIVIDAD</th>
                    <th className="text-center" style={{ minWidth: "70px" }}>HN</th>
                    <th className="text-center" style={{ minWidth: "70px" }}>HE</th>
                    <th className="text-center" style={{ minWidth: "80px" }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyActivitySummary.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>Sin registros esta semana</td></tr>
                  )}
                  {weeklyActivitySummary.map((data, index) => (
                    <tr key={`${data.nombre}-${index}`}>
                      <td style={{ fontWeight: 600 }}>{data.nombre}</td>
                      <td className="text-center mono" style={{ color: "var(--accent-gold)" }}>{data.totalHn.toFixed(1)}</td>
                      <td className="text-center mono" style={{ color: "#ef4444" }}>{data.totalHe.toFixed(1)}</td>
                      <td className="text-center mono total-col-final">{(data.totalHn + data.totalHe).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {resumenSubView === "partida" && (
            <div className="card full-width-card" style={{ padding: 0 }}>
              <div className="card-header-dark" style={{ padding: "14px 16px" }}>
                <span className="label">RESUMEN POR PARTIDA DE CONTROL — SEMANA</span>
              </div>
              <table className="report-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: "120px" }}>CÓDIGO</th>
                    <th>PARTIDA DE CONTROL</th>
                    <th className="text-center" style={{ minWidth: "70px" }}>HN</th>
                    <th className="text-center" style={{ minWidth: "70px" }}>HE</th>
                    <th className="text-center" style={{ minWidth: "80px" }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyPartidaSummary.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>Sin registros esta semana</td></tr>
                  )}
                  {weeklyPartidaSummary.map((data, index) => (
                    <tr key={`${data.id}-${index}`}>
                      <td className="mono" style={{ color: "var(--accent-gold)", fontSize: "11px" }}>{data.id}</td>
                      <td style={{ fontWeight: 600 }}>{data.nombre}</td>
                      <td className="text-center mono" style={{ color: "var(--accent-gold)" }}>{data.totalHn.toFixed(1)}</td>
                      <td className="text-center mono" style={{ color: "#ef4444" }}>{data.totalHe.toFixed(1)}</td>
                      <td className="text-center mono total-col-final">{(data.totalHn + data.totalHe).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <style>{`
        .summary-toolbar {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }
        .summary-toolbar-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .summary-top-toggle,
        .summary-sub-toggle {
          display: flex;
          gap: 4px;
          background: rgba(0,0,0,0.2);
          padding: 4px;
          border-radius: 12px;
          width: fit-content;
        }
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
          letter-spacing: 0.4px;
        }
        .report-table td {
          padding: 10px 8px;
          border: 1px solid var(--border-dim);
          color: var(--text-dim);
        }
        .summary-header-bar,
        .summary-header-stack {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 16px;
          flex-wrap: wrap;
          align-items: center;
        }
        .summary-header-stack {
          flex-direction: column;
          align-items: flex-start;
        }
        .summary-helper-text {
          color: var(--text-dim);
          font-size: 11px;
          text-transform: capitalize;
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
        .he-text {
          color: #ef4444;
          font-size: 11px;
        }
        .text-center {
          text-align: center;
        }
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
        .total-col-hn {
          color: var(--accent-gold);
          font-weight: 800;
          background: rgba(212,165,90,0.05);
        }
        .total-col-he {
          color: #ef4444;
          font-weight: 800;
          background: rgba(239,68,68,0.05);
        }
        .total-col-final {
          color: var(--accent-blue);
          font-weight: 900;
          background: rgba(37,99,235,0.05);
          font-size: 13px;
        }
        .activity-daily-table .rotated-worker-th {
          min-width: 48px;
          max-width: 48px;
          padding: 6px 4px !important;
          vertical-align: bottom;
          color: #0f172a;
        }
        .activity-daily-table .rotated-worker-th span {
          display: inline-block;
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          white-space: nowrap;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.3px;
        }
        @media (max-width: 720px) {
          .summary-toolbar {
            align-items: stretch;
          }
          .summary-toolbar-actions {
            width: 100%;
          }
          .summary-toolbar-actions .btn-export-sm {
            flex: 1;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  )
}
