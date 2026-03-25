import { useMemo, useState } from "react"
import { DownloadIcon } from "./Icons"
import { getWeekRange, parseLocalDate } from "../utils/dateUtils"
import { getWorkerCategoryLabel } from "../utils/workerCategory"

const DAY_LABELS = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB"]

export default function Dashboard({
  registros,
  allRegistros = [],
  workers,
  frentes = [],
  actividades,
  partidas,
  projectConfig,
  fechaTareo,
}) {
  const [view, setView] = useState("operativo")
  const [search, setSearch] = useState("")
  const [frenteFilter, setFrenteFilter] = useState("")
  const [categoriaFilter, setCategoriaFilter] = useState("")
  const [actividadFilter, setActividadFilter] = useState("")
  const [onlyExtras, setOnlyExtras] = useState(false)
  const [detail, setDetail] = useState(null)

  const { dates } = useMemo(() => getWeekRange(fechaTareo), [fechaTareo])
  const workerMap = useMemo(
    () =>
      new Map(
        workers.flatMap((worker) => {
          const keys = [worker.id, worker.codigo].filter(Boolean)
          return keys.map((key) => [String(key), worker])
        })
      ),
    [workers]
  )
  const activityMap = useMemo(() => new Map(actividades.map((actividad) => [String(actividad.id), actividad])), [actividades])
  const partidaMap = useMemo(() => new Map(partidas.map((partida) => [String(partida.id), partida])), [partidas])
  const frenteMap = useMemo(() => new Map(frentes.map((frente) => [String(frente.id), frente])), [frentes])

  const categorias = useMemo(
    () => Array.from(new Set(workers.map((worker) => getWorkerCategoryLabel(worker)).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
    [workers]
  )

  const frenteOptions = useMemo(() => {
    const list = frentes.map((frente) => ({ value: String(frente.id), label: `${frente.id} - ${frente.nombre}` }))
    ;(allRegistros.length ? allRegistros : registros).forEach((registro) => {
      const key = String(registro.frenteId || registro.frenteNombre || "")
      const label = registro.frenteId
        ? `${registro.frenteId} - ${registro.frenteNombre || frenteMap.get(String(registro.frenteId))?.nombre || "Sin nombre"}`
        : registro.frenteNombre
      if (key && !list.some((item) => item.value === key)) list.push({ value: key, label })
    })
    return list
  }, [frentes, registros, allRegistros, frenteMap])

  const activityFilterLabel = actividadFilter
    ? actividades.find((actividad) => String(actividad.id) === String(actividadFilter))?.nombre || actividadFilter
    : ""

  const filters = {
    search,
    frenteFilter,
    categoriaFilter,
    actividadFilter,
    onlyExtras,
  }

  const weeklyFiltered = useMemo(
    () => filterDashboardRecords(registros, filters, workerMap, activityMap, partidaMap, frenteMap),
    [registros, filters, workerMap, activityMap, partidaMap, frenteMap]
  )

  const cumulativeSource = useMemo(
    () => (allRegistros.length ? allRegistros : registros).filter((registro) => !fechaTareo || registro.date <= fechaTareo),
    [allRegistros, registros, fechaTareo]
  )

  const cumulativeFiltered = useMemo(
    () => filterDashboardRecords(cumulativeSource, filters, workerMap, activityMap, partidaMap, frenteMap),
    [cumulativeSource, filters, workerMap, activityMap, partidaMap, frenteMap]
  )

  const weeklyStats = useMemo(
    () => buildDashboardStats(weeklyFiltered, dates, workerMap, activityMap, partidaMap, frenteMap),
    [weeklyFiltered, dates, workerMap, activityMap, partidaMap, frenteMap]
  )

  const cumulativeStats = useMemo(
    () => buildDashboardStats(cumulativeFiltered, dates, workerMap, activityMap, partidaMap, frenteMap),
    [cumulativeFiltered, dates, workerMap, activityMap, partidaMap, frenteMap]
  )

  const detailSource = detail?.scope === "global" ? cumulativeFiltered : weeklyFiltered
  const detailRows = useMemo(
    () => buildDetailRows(detail, detailSource, activityMap, partidaMap, workerMap),
    [detail, detailSource, activityMap, partidaMap, workerMap]
  )

  const cumulativeShare = cumulativeStats.totalHoras > 0
    ? Math.round((weeklyStats.totalHoras / cumulativeStats.totalHoras) * 100)
    : 0

  const openDetail = (type, key, label, scope = "week") => setDetail({ type, key, label, scope })

  const handleExportPdf = async () => {
    const { exportDashboardExecutivePdf } = await import("../utils/dashboardPdf")
    exportDashboardExecutivePdf({
      fechaTareo,
      projectConfig,
      filters: {
        search,
        frenteFilter: frenteFilter ? frenteOptions.find((item) => item.value === frenteFilter)?.label || frenteFilter : "",
        categoriaFilter,
        actividadFilter: activityFilterLabel,
        onlyExtras,
      },
      weekStats: weeklyStats,
      cumulativeStats,
    })
  }

  return (
    <div className="dashboard-shell">
      <div className="dashboard-topbar">
        <div className="dashboard-project-strip">
          <div className="dashboard-project-head">
            <div className="dashboard-eyebrow">Dashboard</div>
            <div className="dashboard-copy">
              Corte {fechaTareo} · {weeklyFiltered.length} registros semana activa · {cumulativeFiltered.length} acumulados
            </div>
          </div>
          <div className="dashboard-project-meta">
            <span><span>Empresa:</span><strong>{projectConfig?.empresa || "Sin empresa"}</strong></span>
            <span><span>Obra:</span><strong>{projectConfig?.obra || "Sin obra"}</strong></span>
          </div>
        </div>

        <div className="dashboard-topbar-actions">
          <button className="btn-pill-sm dashboard-export-btn" onClick={handleExportPdf}>
            <DownloadIcon /> PDF gerencial
          </button>
          <div className="dashboard-mode-switch">
            <button className={view === "operativo" ? "active" : ""} onClick={() => setView("operativo")}>Operativa</button>
            <button className={view === "ejecutivo" ? "active" : ""} onClick={() => setView("ejecutivo")}>Ejecutiva</button>
          </div>
        </div>
      </div>

      <div className="dash-card dashboard-toolbar">
        <div className="dashboard-filter-grid">
          <label className="dashboard-filter-field">
            <span>Buscar</span>
            <input
              className="input-field dashboard-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Trabajador, actividad, frente..."
            />
          </label>
          <label className="dashboard-filter-field">
            <span>Frente</span>
            <select className="input-field dashboard-input" value={frenteFilter} onChange={(event) => setFrenteFilter(event.target.value)}>
              <option value="">Todos</option>
              {frenteOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="dashboard-filter-field">
            <span>Categoria</span>
            <select className="input-field dashboard-input" value={categoriaFilter} onChange={(event) => setCategoriaFilter(event.target.value)}>
              <option value="">Todas</option>
              {categorias.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="dashboard-filter-field">
            <span>Actividad</span>
            <select className="input-field dashboard-input" value={actividadFilter} onChange={(event) => setActividadFilter(event.target.value)}>
              <option value="">Todas</option>
              {actividades.map((option) => (
                <option key={option.id} value={option.id}>{option.id} - {option.nombre}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="dashboard-toolbar-actions">
          <button className={`btn-pill-sm dashboard-toolbar-pill ${onlyExtras ? "active-pill" : ""}`} onClick={() => setOnlyExtras((value) => !value)}>
            Solo con HE
          </button>
          <button
            className="btn-pill-sm dashboard-toolbar-pill"
            onClick={() => {
              setSearch("")
              setFrenteFilter("")
              setCategoriaFilter("")
              setActividadFilter("")
              setOnlyExtras(false)
            }}
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      <div className="dashboard-block">
        <div className="dashboard-block-head">
          <div>
            <div className="dashboard-section-title">Acumulado global</div>
            <div className="dashboard-copy">Incluye todas las semanas registradas hasta {fechaTareo}</div>
          </div>
          <div className="dashboard-block-copy">Base gerencial para costo, horas y productividad acumulada.</div>
        </div>
        <div className="dashboard-kpi-grid">
          <Metric label="Horas acumuladas" value={fmtHours(cumulativeStats.totalHoras)} sub={`${fmtHours(cumulativeStats.totalHN)} N · ${fmtHours(cumulativeStats.totalHE)} E`} tone="blue" onClick={() => cumulativeStats.topActividad && openDetail("activity", cumulativeStats.topActividad.id, cumulativeStats.topActividad.nombre, "global")} />
          <Metric label="Costo acumulado" value={fmtCurrency(cumulativeStats.totalCosto)} sub="Hasta la fecha seleccionada" tone="green" />
          <Metric label="Trabajadores acumulados" value={String(cumulativeStats.workerList.length)} sub={`${fmtHours(cumulativeStats.avgHours)} horas promedio`} tone="gold" onClick={() => cumulativeStats.workerList[0] && openDetail("worker", cumulativeStats.workerList[0].id, cumulativeStats.workerList[0].nombre, "global")} />
          <Metric label="Actividad lider global" value={cumulativeStats.topActividad ? `${fmtHours(cumulativeStats.topActividad.total)} horas` : "0 horas"} sub={cumulativeStats.topActividad?.nombre || "Sin actividad"} tone="indigo" onClick={() => cumulativeStats.topActividad && openDetail("activity", cumulativeStats.topActividad.id, cumulativeStats.topActividad.nombre, "global")} />
        </div>
      </div>

      <div className="dashboard-block">
        <div className="dashboard-block-head">
          <div>
            <div className="dashboard-section-title">Semana activa</div>
            <div className="dashboard-copy">La semana visible representa {cumulativeShare}% del acumulado filtrado.</div>
          </div>
          <div className="dashboard-block-copy">Detalle operativo de la semana asociada a la fecha seleccionada.</div>
        </div>
        <div className="dashboard-kpi-grid">
          <Metric label="Horas totales" value={fmtHours(weeklyStats.totalHoras)} sub={`${fmtHours(weeklyStats.totalHN)} N · ${fmtHours(weeklyStats.totalHE)} E`} tone="blue" onClick={() => weeklyStats.busiestDay && openDetail("day", weeklyStats.busiestDay.date, `${weeklyStats.busiestDay.label} ${weeklyStats.busiestDay.dayNum}`, "week")} />
          <Metric label="Costo estimado" value={fmtCurrency(weeklyStats.totalCosto)} sub="Mano de obra semanal" tone="green" />
          <Metric label="Trabajadores activos" value={String(weeklyStats.workerList.length)} sub={`${fmtHours(weeklyStats.avgHours)} horas promedio`} tone="gold" onClick={() => weeklyStats.workerList[0] && openDetail("worker", weeklyStats.workerList[0].id, weeklyStats.workerList[0].nombre, "week")} />
          <Metric label="Actividad lider" value={weeklyStats.topActividad ? `${fmtHours(weeklyStats.topActividad.total)} horas` : "0 horas"} sub={weeklyStats.topActividad?.nombre || "Sin actividad"} tone="indigo" onClick={() => weeklyStats.topActividad && openDetail("activity", weeklyStats.topActividad.id, weeklyStats.topActividad.nombre, "week")} />
        </div>
      </div>

      {view === "operativo" && (
        <>
          <div className="dashboard-main-grid">
            <div className="dash-card">
              <div className="dashboard-section-title">Horas por dia</div>
              <div className="dashboard-chart">
                {weeklyStats.dayList.map((day) => (
                  <button key={day.date} className="dashboard-chart-col" onClick={() => openDetail("day", day.date, `${day.label} ${day.dayNum}`, "week")}>
                    <span className="dashboard-chart-value">{day.total ? fmtHours(day.total) : ""}</span>
                    <div className="dashboard-chart-bar-wrap">
                      <div className="dashboard-chart-bar">
                        <div style={{ height: `${Math.max((day.total / weeklyStats.maxDay) * 100, day.total ? 8 : 4)}px`, background: "var(--accent-blue)" }} />
                      </div>
                    </div>
                    <span className="dashboard-chart-label">{day.label}</span>
                    <span className="dashboard-chart-sub">{day.workers} trab.</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="dash-card">
              <div className="dashboard-section-title">Atencion semanal</div>
              <div className="dashboard-alert-list">
                {weeklyStats.alerts.map((alert) => (
                  <div key={alert.title} className={`dashboard-alert dashboard-alert-${alert.tone}`}>
                    <div className="dashboard-alert-title">{alert.title}</div>
                    <div className="dashboard-alert-description">{alert.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="dashboard-main-grid">
            <ListCard title="Top actividades semana" items={weeklyStats.activityList.slice(0, 8)} onOpen={(item) => openDetail("activity", item.id, item.nombre, "week")} />
            <ListCard title="Top trabajadores semana" items={weeklyStats.workerList.slice(0, 10)} onOpen={(item) => openDetail("worker", item.id, item.nombre, "week")} formatSub={(item) => `${item.categoria} · ${fmtCurrency(item.costo)}`} />
          </div>

          <div className="dashboard-main-grid">
            <ListCard title="Frentes semana" items={weeklyStats.frenteList.slice(0, 8)} onOpen={(item) => openDetail("frente", item.id, item.nombre, "week")} />
            <ListCard title="Categorias semana" items={weeklyStats.categoriaList.slice(0, 8)} onOpen={(item) => openDetail("category", item.id, item.nombre, "week")} />
          </div>
        </>
      )}

      {view === "ejecutivo" && (
        <>
          <div className="dashboard-main-grid">
            <div className="dash-card dashboard-executive-card">
              <div className="dashboard-section-title">Resumen ejecutivo</div>
              <div className="dashboard-executive-copy">
                <p>Hasta el <strong>{fechaTareo}</strong> el proyecto acumula <strong>{fmtHours(cumulativeStats.totalHoras)} horas</strong> en <strong>{cumulativeStats.workerList.length}</strong> trabajadores con costo estimado de <strong>{fmtCurrency(cumulativeStats.totalCosto)}</strong>.</p>
                <p>La actividad dominante acumulada es <strong>{cumulativeStats.topActividad?.nombre || "Sin actividad"}</strong> con <strong>{fmtHours(cumulativeStats.topActividad?.total || 0)} horas</strong>.</p>
                <p>La semana activa suma <strong>{fmtHours(weeklyStats.totalHoras)} horas</strong>, equivalente al <strong>{cumulativeShare}%</strong> del acumulado filtrado.</p>
              </div>
            </div>
            <ListCard title="Categorias acumuladas" items={cumulativeStats.categoriaList.slice(0, 6)} onOpen={(item) => openDetail("category", item.id, item.nombre, "global")} compact />
          </div>

          <div className="dashboard-main-grid">
            <ListCard title="Partidas acumuladas" items={cumulativeStats.partidaList.slice(0, 8)} onOpen={(item) => openDetail("partida", item.id, `${item.id} - ${item.nombre}`, "global")} compact />
            <ListCard title="Trabajadores acumulados" items={cumulativeStats.workerList.slice(0, 8)} onOpen={(item) => openDetail("worker", item.id, item.nombre, "global")} formatSub={(item) => `${item.categoria} · ${fmtCurrency(item.costo)}`} compact />
          </div>
        </>
      )}

      <div className="dash-card">
        <div className="dashboard-section-title">Drill-down</div>
        {!detail && <div className="dashboard-empty">Selecciona una tarjeta o una fila para ver el detalle.</div>}
        {detail && (
          <div className="dashboard-detail">
            <div className="dashboard-detail-head">
              <div>
                <div className="dashboard-detail-title">{detail.label}</div>
                <div className="dashboard-detail-subtitle">{detailRows.length} filas detalladas · {detail.scope === "global" ? "acumulado global" : "semana activa"}</div>
              </div>
              <button className="btn-pill-sm" onClick={() => setDetail(null)}>Limpiar detalle</button>
            </div>
            <div className="dashboard-table-list">
              {detailRows.length === 0 && <div className="dashboard-empty">No hay filas para esta seleccion.</div>}
              {detailRows.slice(0, 18).map((row, index) => (
                <div key={`${row.primary}-${index}`} className="dashboard-list-row dashboard-list-row-static">
                  <div>
                    <div className="dashboard-list-title">{row.primary}</div>
                    <div className="dashboard-list-subtitle">{row.secondary}</div>
                  </div>
                  <div className="dashboard-list-metric">
                    <strong>{fmtHours(row.total)}</strong>
                    <span>{fmtHours(row.hn)} N · {fmtHours(row.he)} E</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, sub, tone, onClick }) {
  return (
    <button className={`dashboard-metric-card dashboard-tone-${tone} ${onClick ? "is-clickable" : ""}`} onClick={onClick}>
      <span className="dashboard-metric-label">{label}</span>
      <strong className="dashboard-metric-value">{value}</strong>
      <span className="dashboard-metric-sub">{sub}</span>
    </button>
  )
}

function ListCard({ title, items, onOpen, formatName, formatSub, compact = false }) {
  const max = items[0]?.total || items[0]?.hn + items[0]?.he || 0
  return (
    <div className="dash-card">
      <div className="dashboard-section-title">{title}</div>
      <div className="dashboard-table-list">
        {!items.length && <div className="dashboard-empty">Sin datos para los filtros actuales.</div>}
        {items.map((item) => {
          const total = item.total ?? (item.hn + item.he)
          return (
            <button key={item.id || item.date || item.nombre} className="dashboard-list-row" onClick={() => onOpen(item)}>
              <div>
                <div className="dashboard-list-title">{formatName ? formatName(item) : item.nombre}</div>
                <div className="dashboard-list-subtitle">{formatSub ? formatSub(item) : `${fmtHours(item.hn)} N · ${fmtHours(item.he)} E`}</div>
              </div>
              <div className="dashboard-list-metric">
                <strong>{fmtHours(total)}</strong>
                {!compact && <span>{max ? Math.round((total / max) * 100) : 0}% del lider</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function filterDashboardRecords(records, filters, workerMap, activityMap, partidaMap, frenteMap) {
  const term = filters.search.trim().toLowerCase()

  return records.filter((reg) => {
    const worker = workerMap.get(String(reg.workerId))
    const categoria = getWorkerCategoryLabel(worker)
    const frenteId = String(reg.frenteId || "")
    const frenteName = reg.frenteNombre || frenteMap.get(frenteId)?.nombre || "Sin frente"
    const hitFrente = !filters.frenteFilter || filters.frenteFilter === frenteId || filters.frenteFilter === frenteName
    const hitCategoria = !filters.categoriaFilter || categoria === filters.categoriaFilter
    const hitActividad = !filters.actividadFilter || reg.assignments?.some((assignment) => String(assignment.actividadId) === filters.actividadFilter)
    const hitExtras = !filters.onlyExtras || reg.assignments?.some((assignment) => (assignment.horasExtras || 0) > 0)
    if (!hitFrente || !hitCategoria || !hitActividad || !hitExtras) return false
    if (!term) return true

    const text = [
      reg.workerNombre,
      worker?.codigo,
      getWorkerCategoryLabel(worker, { includeCode: true, fallback: "" }),
      frenteId,
      frenteName,
      ...(reg.assignments || []).flatMap((assignment) => {
        const activity = activityMap.get(String(assignment.actividadId))
        const partidaId = String(activity?.partidaId || assignment.partidaId || "")
        return [activity?.nombre, partidaMap.get(partidaId)?.nombre, partidaId]
      }),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()

    return text.includes(term)
  })
}

function buildDashboardStats(filtered, dates, workerMap, activityMap, partidaMap, frenteMap) {
  const dayMap = Object.fromEntries(dates.map((date) => [date, { hn: 0, he: 0, workers: new Set() }]))
  const workerStats = new Map()
  const activityStats = new Map()
  const frenteStats = new Map()
  const categoriaStats = new Map()
  const partidaStats = new Map()

  let totalHN = 0
  let totalHE = 0
  let totalCosto = 0
  let assignments = 0

  filtered.forEach((reg) => {
    const worker = workerMap.get(String(reg.workerId))
    const categoria = getWorkerCategoryLabel(worker)
    const frenteId = String(reg.frenteId || reg.frenteNombre || "Sin frente")
    const frenteName = reg.frenteNombre || frenteMap.get(String(reg.frenteId || ""))?.nombre || "Sin frente"

    reg.assignments?.forEach((assignment) => {
      const hn = Number(assignment.horasNormales) || 0
      const he = Number(assignment.horasExtras) || 0
      const total = hn + he
      if (!total) return

      assignments += 1
      totalHN += hn
      totalHE += he
      totalCosto += total * (worker?.costoHora || 0)

      if (dayMap[reg.date]) {
        dayMap[reg.date].hn += hn
        dayMap[reg.date].he += he
        dayMap[reg.date].workers.add(String(reg.workerId))
      }

      bump(
        workerStats,
        String(reg.workerId),
        {
          id: String(reg.workerId),
          nombre: reg.workerNombre,
          categoria,
          costoHora: worker?.costoHora || 0,
          hn: 0,
          he: 0,
        },
        hn,
        he
      )

      const activity = activityMap.get(String(assignment.actividadId))
      const partId = String(activity?.partidaId || assignment.partidaId || "SIN_PARTIDA")
      bump(
        activityStats,
        String(assignment.actividadId),
        {
          id: String(assignment.actividadId),
          nombre: activity?.nombre || assignment.actividadId,
          partidaId: partId,
          partidaNombre: partidaMap.get(partId)?.nombre || "Sin partida",
          hn: 0,
          he: 0,
        },
        hn,
        he
      )

      bump(frenteStats, frenteId, { id: frenteId, nombre: frenteName, hn: 0, he: 0 }, hn, he)
      bump(categoriaStats, categoria, { id: categoria, nombre: categoria, hn: 0, he: 0 }, hn, he)
      bump(partidaStats, partId, { id: partId, nombre: partidaMap.get(partId)?.nombre || "Sin partida", hn: 0, he: 0 }, hn, he)
    })
  })

  const dayList = dates.map((date, index) => {
    const value = dayMap[date] || { hn: 0, he: 0, workers: new Set() }
    return {
      date,
      label: DAY_LABELS[index],
      dayNum: parseLocalDate(date).getDate(),
      hn: value.hn,
      he: value.he,
      total: value.hn + value.he,
      workers: value.workers.size,
    }
  })

  const workerList = toList(workerStats).map((item) => ({ ...item, total: item.hn + item.he, costo: (item.hn + item.he) * item.costoHora }))
  const activityList = toList(activityStats).map((item) => ({ ...item, total: item.hn + item.he }))
  const frenteList = toList(frenteStats).map((item) => ({ ...item, total: item.hn + item.he }))
  const categoriaList = toList(categoriaStats).map((item) => ({ ...item, total: item.hn + item.he }))
  const partidaList = toList(partidaStats).map((item) => ({ ...item, total: item.hn + item.he }))
  const totalHoras = totalHN + totalHE
  const diasConRegistro = dayList.filter((day) => day.total > 0).length
  const busiestDay = [...dayList].sort((a, b) => b.total - a.total)[0] || null
  const topActividad = activityList[0] || null
  const alerts = []

  if (dayList.some((day) => day.total === 0)) {
    alerts.push({
      tone: "warn",
      title: "Cobertura",
      text: `Dias sin registro: ${dayList.filter((day) => day.total === 0).map((day) => day.label).join(", ")}`,
    })
  }
  if (totalHE > 0) {
    alerts.push({
      tone: "info",
      title: "Horas extra",
      text: `${fmtHours(totalHE)} horas extra acumuladas (${Math.round((totalHE / Math.max(totalHoras, 1)) * 100)}%)`,
    })
  }
  if (topActividad && totalHoras > 0 && topActividad.total / totalHoras >= 0.35) {
    alerts.push({
      tone: "accent",
      title: "Concentracion",
      text: `${topActividad.nombre} concentra ${Math.round((topActividad.total / totalHoras) * 100)}% de las horas`,
    })
  }
  if (!alerts.length) {
    alerts.push({ tone: "ok", title: "Estado", text: "No se detectaron alertas con los filtros actuales." })
  }

  return {
    totalHN,
    totalHE,
    totalHoras,
    totalCosto,
    assignments,
    dayList,
    workerList,
    activityList,
    frenteList,
    categoriaList,
    partidaList,
    diasConRegistro,
    busiestDay,
    topActividad,
    avgHours: totalHoras / Math.max(workerList.length, 1),
    heRatio: totalHE / Math.max(totalHoras, 1),
    alerts,
    maxDay: Math.max(...dayList.map((day) => day.total), 1),
  }
}

function buildDetailRows(detail, registros, activityMap, partidaMap, workerMap) {
  if (!detail) return []

  const rows = []
  registros.forEach((reg) => {
    const worker = workerMap.get(String(reg.workerId))
    reg.assignments?.forEach((assignment) => {
      const activity = activityMap.get(String(assignment.actividadId))
      const partidaId = String(activity?.partidaId || assignment.partidaId || "SIN_PARTIDA")
      const match = detail.type === "day"
        ? reg.date === detail.key
        : detail.type === "worker"
          ? String(reg.workerId) === String(detail.key)
          : detail.type === "activity"
            ? String(assignment.actividadId) === String(detail.key)
            : detail.type === "frente"
              ? String(reg.frenteId || reg.frenteNombre || "Sin frente") === String(detail.key)
              : detail.type === "category"
                ? getWorkerCategoryLabel(worker) === detail.key
                : detail.type === "partida"
                  ? partidaId === String(detail.key)
                  : false

      if (!match) return

      const hn = Number(assignment.horasNormales) || 0
      const he = Number(assignment.horasExtras) || 0
      const total = hn + he
      if (!total) return

      rows.push({
        primary: `${shortName(reg.workerNombre)} · ${activity?.nombre || assignment.actividadId}`,
        secondary: [reg.date, partidaMap.get(partidaId)?.nombre || "Sin partida", reg.frenteNombre || "Sin frente"].filter(Boolean).join(" · "),
        hn,
        he,
        total,
      })
    })
  })

  return rows.sort((a, b) => b.total - a.total)
}

function bump(map, key, seed, hn, he) {
  const current = map.get(key) || seed
  current.hn += hn
  current.he += he
  map.set(key, current)
}

function toList(map) {
  return Array.from(map.values()).sort((a, b) => (b.hn + b.he) - (a.hn + a.he))
}

function shortName(value) {
  return String(value || "").split(",")[0] || "Sin nombre"
}

function fmtHours(value) {
  return Number(value || 0).toFixed(1).replace(/\.0$/, "")
}

function fmtCurrency(value) {
  return `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
