import { useMemo, useState } from "react"
import { getWeekRange, parseLocalDate } from "../utils/dateUtils"

const DAY_LABELS = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB"]

export default function Dashboard({ registros, workers, frentes = [], actividades, partidas, projectConfig, fechaTareo }) {
  const [view, setView] = useState("operativo")
  const [search, setSearch] = useState("")
  const [frenteFilter, setFrenteFilter] = useState("")
  const [categoriaFilter, setCategoriaFilter] = useState("")
  const [actividadFilter, setActividadFilter] = useState("")
  const [onlyExtras, setOnlyExtras] = useState(false)
  const [detail, setDetail] = useState(null)

  const { dates } = useMemo(() => getWeekRange(fechaTareo), [fechaTareo])
  const workerMap = useMemo(() => new Map(workers.map(w => [String(w.id), w])), [workers])
  const activityMap = useMemo(() => new Map(actividades.map(a => [String(a.id), a])), [actividades])
  const partidaMap = useMemo(() => new Map(partidas.map(p => [String(p.id), p])), [partidas])
  const frenteMap = useMemo(() => new Map(frentes.map(f => [String(f.id), f])), [frentes])

  const categorias = useMemo(() => Array.from(new Set(workers.map(w => cleanCategory(w.categoria)))).sort((a, b) => a.localeCompare(b, "es")), [workers])
  const frenteOptions = useMemo(() => {
    const list = frentes.map(f => ({ value: String(f.id), label: `${f.id} - ${f.nombre}` }))
    registros.forEach(reg => {
      const key = String(reg.frenteId || reg.frenteNombre || "")
      const label = reg.frenteId ? `${reg.frenteId} - ${reg.frenteNombre || frenteMap.get(String(reg.frenteId))?.nombre || "Sin nombre"}` : reg.frenteNombre
      if (key && !list.some(item => item.value === key)) list.push({ value: key, label })
    })
    return list
  }, [frentes, registros, frenteMap])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return registros.filter(reg => {
      const worker = workerMap.get(String(reg.workerId))
      const categoria = cleanCategory(worker?.categoria)
      const frenteId = String(reg.frenteId || "")
      const frenteName = reg.frenteNombre || frenteMap.get(frenteId)?.nombre || "Sin frente"
      const hitFrente = !frenteFilter || frenteFilter === frenteId || frenteFilter === frenteName
      const hitCategoria = !categoriaFilter || categoria === categoriaFilter
      const hitActividad = !actividadFilter || reg.assignments?.some(asg => String(asg.actividadId) === actividadFilter)
      const hitExtras = !onlyExtras || reg.assignments?.some(asg => (asg.horasExtras || 0) > 0)
      if (!hitFrente || !hitCategoria || !hitActividad || !hitExtras) return false
      if (!term) return true
      const text = [
        reg.workerNombre, worker?.codigo, worker?.categoria, frenteId, frenteName,
        ...(reg.assignments || []).flatMap(asg => {
          const act = activityMap.get(String(asg.actividadId))
          const partidaId = String(act?.partidaId || asg.partidaId || "")
          return [act?.nombre, partidaMap.get(partidaId)?.nombre, partidaId]
        })
      ].filter(Boolean).join(" ").toLowerCase()
      return text.includes(term)
    })
  }, [registros, search, frenteFilter, categoriaFilter, actividadFilter, onlyExtras, workerMap, activityMap, partidaMap, frenteMap])

  const stats = useMemo(() => {
    const dayMap = Object.fromEntries(dates.map(date => [date, { hn: 0, he: 0, workers: new Set() }]))
    const workerStats = new Map()
    const activityStats = new Map()
    const frenteStats = new Map()
    const categoriaStats = new Map()
    const partidaStats = new Map()
    let totalHN = 0, totalHE = 0, totalCosto = 0, assignments = 0

    filtered.forEach(reg => {
      const worker = workerMap.get(String(reg.workerId))
      const categoria = cleanCategory(worker?.categoria)
      const frenteId = String(reg.frenteId || reg.frenteNombre || "Sin frente")
      const frenteName = reg.frenteNombre || frenteMap.get(String(reg.frenteId || ""))?.nombre || "Sin frente"
      reg.assignments?.forEach(asg => {
        const hn = Number(asg.horasNormales) || 0
        const he = Number(asg.horasExtras) || 0
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
        bump(workerStats, String(reg.workerId), { id: String(reg.workerId), nombre: reg.workerNombre, categoria, costoHora: worker?.costoHora || 0, hn: 0, he: 0 }, hn, he)
        const act = activityMap.get(String(asg.actividadId))
        const partId = String(act?.partidaId || asg.partidaId || "SIN_PARTIDA")
        bump(activityStats, String(asg.actividadId), { id: String(asg.actividadId), nombre: act?.nombre || asg.actividadId, partidaId: partId, partidaNombre: partidaMap.get(partId)?.nombre || "Sin partida", hn: 0, he: 0 }, hn, he)
        bump(frenteStats, frenteId, { id: frenteId, nombre: frenteName, hn: 0, he: 0 }, hn, he)
        bump(categoriaStats, categoria, { id: categoria, nombre: categoria, hn: 0, he: 0 }, hn, he)
        bump(partidaStats, partId, { id: partId, nombre: partidaMap.get(partId)?.nombre || "Sin partida", hn: 0, he: 0 }, hn, he)
      })
    })

    const dayList = dates.map((date, index) => {
      const value = dayMap[date] || { hn: 0, he: 0, workers: new Set() }
      return { date, label: DAY_LABELS[index], dayNum: parseLocalDate(date).getDate(), hn: value.hn, he: value.he, total: value.hn + value.he, workers: value.workers.size }
    })
    const workerList = toList(workerStats).map(item => ({ ...item, total: item.hn + item.he, costo: (item.hn + item.he) * item.costoHora }))
    const activityList = toList(activityStats).map(item => ({ ...item, total: item.hn + item.he }))
    const frenteList = toList(frenteStats).map(item => ({ ...item, total: item.hn + item.he }))
    const categoriaList = toList(categoriaStats).map(item => ({ ...item, total: item.hn + item.he }))
    const partidaList = toList(partidaStats).map(item => ({ ...item, total: item.hn + item.he }))
    const totalHoras = totalHN + totalHE
    const diasConRegistro = dayList.filter(day => day.total > 0).length
    const busiestDay = [...dayList].sort((a, b) => b.total - a.total)[0] || null
    const topActividad = activityList[0] || null
    const alerts = []
    if (dayList.some(day => day.total === 0)) alerts.push({ tone: "warn", title: "Cobertura", text: `Dias sin registro: ${dayList.filter(day => day.total === 0).map(day => day.label).join(", ")}` })
    if (totalHE > 0) alerts.push({ tone: "info", title: "Horas extra", text: `${fmtHours(totalHE)} horas extra acumuladas (${Math.round((totalHE / Math.max(totalHoras, 1)) * 100)}%)` })
    if (topActividad && totalHoras > 0 && topActividad.total / totalHoras >= 0.35) alerts.push({ tone: "accent", title: "Concentracion", text: `${topActividad.nombre} concentra ${Math.round((topActividad.total / totalHoras) * 100)}% de las horas` })
    if (!alerts.length) alerts.push({ tone: "ok", title: "Estado", text: "No se detectaron alertas con los filtros actuales." })
    return { totalHN, totalHE, totalHoras, totalCosto, diasConRegistro, assignments, dayList, workerList, activityList, frenteList, categoriaList, partidaList, busiestDay, topActividad, heRatio: totalHE / Math.max(totalHoras, 1), avgHours: totalHoras / Math.max(workerList.length, 1), alerts, maxDay: Math.max(...dayList.map(day => day.total), 1) }
  }, [filtered, dates, workerMap, activityMap, partidaMap, frenteMap])

  const detailRows = useMemo(() => buildDetailRows(detail, filtered, activityMap, partidaMap, workerMap), [detail, filtered, activityMap, partidaMap, workerMap])

  const openDetail = (type, key, label) => setDetail({ type, key, label })

  return (
    <div className="dashboard-shell">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-eyebrow">Dashboard semanal</div>
          <h2 className="dashboard-title-main">{projectConfig?.obra || "Control del proyecto"}</h2>
          <p className="dashboard-copy">{projectConfig?.empresa || "Proyecto"} · {filtered.length} registros filtrados · {stats.assignments} asignaciones</p>
        </div>
        <div className="dashboard-view-toggle">
          <button className={`btn-pill-sm ${view === "operativo" ? "active-pill" : ""}`} onClick={() => setView("operativo")}>Vista Operativa</button>
          <button className={`btn-pill-sm ${view === "ejecutivo" ? "active-pill" : ""}`} onClick={() => setView("ejecutivo")}>Vista Ejecutiva</button>
        </div>
      </div>

      <div className="dash-card dashboard-toolbar">
        <div className="dashboard-filter-grid">
          <label className="dashboard-filter-field"><span>Buscar</span><input className="input-field" value={search} onChange={e => setSearch(e.target.value)} placeholder="Trabajador, actividad, frente..." /></label>
          <label className="dashboard-filter-field"><span>Frente</span><select className="input-field" value={frenteFilter} onChange={e => setFrenteFilter(e.target.value)}><option value="">Todos</option>{frenteOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="dashboard-filter-field"><span>Categoria</span><select className="input-field" value={categoriaFilter} onChange={e => setCategoriaFilter(e.target.value)}><option value="">Todas</option>{categorias.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="dashboard-filter-field"><span>Actividad</span><select className="input-field" value={actividadFilter} onChange={e => setActividadFilter(e.target.value)}><option value="">Todas</option>{actividades.map(option => <option key={option.id} value={option.id}>{option.id} - {option.nombre}</option>)}</select></label>
        </div>
        <div className="dashboard-toolbar-actions">
          <button className={`btn-pill-sm ${onlyExtras ? "active-pill" : ""}`} onClick={() => setOnlyExtras(value => !value)}>Solo con HE</button>
          <button className="btn-pill-sm" onClick={() => { setSearch(""); setFrenteFilter(""); setCategoriaFilter(""); setActividadFilter(""); setOnlyExtras(false) }}>Limpiar filtros</button>
        </div>
      </div>

      <div className="dashboard-kpi-grid">
        <Metric label="Horas totales" value={fmtHours(stats.totalHoras)} sub={`${fmtHours(stats.totalHN)} N · ${fmtHours(stats.totalHE)} E`} tone="blue" onClick={() => stats.busiestDay && openDetail("day", stats.busiestDay.date, `${stats.busiestDay.label} ${stats.busiestDay.dayNum}`)} />
        <Metric label="Costo estimado" value={fmtCurrency(stats.totalCosto)} sub="Mano de obra filtrada" tone="green" />
        <Metric label="Trabajadores activos" value={String(stats.workerList.length)} sub={`${fmtHours(stats.avgHours)} promedio`} tone="gold" onClick={() => stats.workerList[0] && openDetail("worker", stats.workerList[0].id, stats.workerList[0].nombre)} />
        <Metric label="Cobertura" value={`${stats.diasConRegistro}/6`} sub={stats.busiestDay ? `Pico ${stats.busiestDay.label}: ${fmtHours(stats.busiestDay.total)}` : "Sin actividad"} tone="neutral" />
        <Metric label="Ratio HE" value={`${Math.round(stats.heRatio * 100)}%`} sub={stats.totalHE ? `${fmtHours(stats.totalHE)} HE` : "Sin extras"} tone="alert" onClick={() => openDetail("extras", "extras", "Horas extra")} />
        <Metric label="Actividad lider" value={stats.topActividad?.nombre || "Sin actividad"} sub={stats.topActividad ? fmtHours(stats.topActividad.total) : "0"} tone="indigo" onClick={() => stats.topActividad && openDetail("activity", stats.topActividad.id, stats.topActividad.nombre)} />
      </div>

      {view === "operativo" && (
        <>
          <div className="dashboard-main-grid">
            <div className="dash-card">
              <div className="dashboard-section-title">Horas por dia</div>
              <div className="dashboard-chart">{stats.dayList.map(day => <button key={day.date} className="dashboard-chart-col" onClick={() => openDetail("day", day.date, `${day.label} ${day.dayNum}`)}><span className="dashboard-chart-value">{day.total ? fmtHours(day.total) : ""}</span><div className="dashboard-chart-bar-wrap"><div className="dashboard-chart-bar"><div style={{ height: `${Math.max((day.total / stats.maxDay) * 100, day.total ? 8 : 4)}px`, background: "var(--accent-blue)" }} /></div></div><span className="dashboard-chart-label">{day.label}</span><span className="dashboard-chart-sub">{day.workers} trab.</span></button>)}</div>
            </div>
            <div className="dash-card">
              <div className="dashboard-section-title">Alertas</div>
              <div className="dashboard-alert-list">{stats.alerts.map(alert => <div key={alert.title} className={`dashboard-alert dashboard-alert-${alert.tone}`}><div className="dashboard-alert-title">{alert.title}</div><div className="dashboard-alert-description">{alert.text}</div></div>)}</div>
            </div>
          </div>

          <div className="dashboard-main-grid">
            <ListCard title="Top actividades" items={stats.activityList.slice(0, 8)} onOpen={item => openDetail("activity", item.id, item.nombre)} />
            <ListCard title="Top trabajadores" items={stats.workerList.slice(0, 10)} onOpen={item => openDetail("worker", item.id, item.nombre)} formatSub={item => `${item.categoria} · ${fmtCurrency(item.costo)}`} />
          </div>

          <div className="dashboard-main-grid">
            <ListCard title="Frentes" items={stats.frenteList.slice(0, 8)} onOpen={item => openDetail("frente", item.id, item.nombre)} />
            <ListCard title="Categorias" items={stats.categoriaList.slice(0, 8)} onOpen={item => openDetail("category", item.id, item.nombre)} />
          </div>
        </>
      )}

      {view === "ejecutivo" && (
        <div className="dashboard-main-grid">
          <div className="dash-card dashboard-executive-card">
            <div className="dashboard-section-title">Resumen ejecutivo</div>
            <div className="dashboard-executive-copy">
              <p>La semana acumula <strong>{fmtHours(stats.totalHoras)}</strong> en <strong>{stats.workerList.length}</strong> trabajadores activos.</p>
              <p>El costo estimado es <strong>{fmtCurrency(stats.totalCosto)}</strong> y la actividad dominante es <strong>{stats.topActividad?.nombre || "Sin actividad"}</strong>.</p>
              <p>La mejor lectura diaria la aporta <strong>{stats.busiestDay?.label || "-"}</strong> con <strong>{fmtHours(stats.busiestDay?.total || 0)}</strong>.</p>
            </div>
          </div>
          <div className="dash-card">
            <div className="dashboard-section-title">Palancas ejecutivas</div>
            <ListCard title="Partidas criticas" items={stats.partidaList.slice(0, 6)} onOpen={item => openDetail("partida", item.id, `${item.id} - ${item.nombre}`)} compact />
            <ListCard title="Dias comparados" items={stats.dayList} onOpen={item => openDetail("day", item.date, `${item.label} ${item.dayNum}`)} formatName={item => `${item.label} ${item.dayNum}`} compact />
          </div>
        </div>
      )}

      <div className="dash-card">
        <div className="dashboard-section-title">Drill-down</div>
        {!detail && <div className="dashboard-empty">Selecciona una tarjeta o una fila para ver el detalle.</div>}
        {detail && (
          <div className="dashboard-detail">
            <div className="dashboard-detail-head">
              <div><div className="dashboard-detail-title">{detail.label}</div><div className="dashboard-detail-subtitle">{detailRows.length} filas detalladas</div></div>
              <button className="btn-pill-sm" onClick={() => setDetail(null)}>Limpiar detalle</button>
            </div>
            <div className="dashboard-table-list">
              {detailRows.length === 0 && <div className="dashboard-empty">No hay filas para esta seleccion.</div>}
              {detailRows.slice(0, 18).map((row, index) => <div key={`${row.primary}-${index}`} className="dashboard-list-row dashboard-list-row-static"><div><div className="dashboard-list-title">{row.primary}</div><div className="dashboard-list-subtitle">{row.secondary}</div></div><div className="dashboard-list-metric"><strong>{fmtHours(row.total)}</strong><span>{fmtHours(row.hn)} N · {fmtHours(row.he)} E</span></div></div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, sub, tone, onClick }) {
  return <button className={`dashboard-metric-card dashboard-tone-${tone} ${onClick ? "is-clickable" : ""}`} onClick={onClick}><span className="dashboard-metric-label">{label}</span><strong className="dashboard-metric-value">{value}</strong><span className="dashboard-metric-sub">{sub}</span></button>
}

function ListCard({ title, items, onOpen, formatName, formatSub, compact = false }) {
  const max = items[0]?.total || items[0]?.hn + items[0]?.he || 0
  return <div className="dash-card"><div className="dashboard-section-title">{title}</div><div className="dashboard-table-list">{!items.length && <div className="dashboard-empty">Sin datos para los filtros actuales.</div>}{items.map(item => { const total = item.total ?? (item.hn + item.he); return <button key={item.id || item.date || item.nombre} className="dashboard-list-row" onClick={() => onOpen(item)}><div><div className="dashboard-list-title">{formatName ? formatName(item) : item.nombre}</div><div className="dashboard-list-subtitle">{formatSub ? formatSub(item) : `${fmtHours(item.hn)} N · ${fmtHours(item.he)} E`}</div></div><div className="dashboard-list-metric"><strong>{fmtHours(total)}</strong>{!compact && <span>{max ? Math.round((total / max) * 100) : 0}% del lider</span>}</div></button> })}</div></div>
}

function buildDetailRows(detail, registros, activityMap, partidaMap, workerMap) {
  if (!detail) return []
  const rows = []
  registros.forEach(reg => {
    const worker = workerMap.get(String(reg.workerId))
    reg.assignments?.forEach(asg => {
      const act = activityMap.get(String(asg.actividadId))
      const partidaId = String(act?.partidaId || asg.partidaId || "SIN_PARTIDA")
      const match = detail.type === "day" ? reg.date === detail.key
        : detail.type === "worker" ? String(reg.workerId) === String(detail.key)
        : detail.type === "activity" ? String(asg.actividadId) === String(detail.key)
        : detail.type === "frente" ? String(reg.frenteId || reg.frenteNombre || "Sin frente") === String(detail.key)
        : detail.type === "category" ? cleanCategory(worker?.categoria) === detail.key
        : detail.type === "partida" ? partidaId === String(detail.key)
        : detail.type === "extras" ? (asg.horasExtras || 0) > 0
        : false
      if (!match) return
      const hn = Number(asg.horasNormales) || 0
      const he = Number(asg.horasExtras) || 0
      const total = hn + he
      if (!total) return
      rows.push({ primary: `${shortName(reg.workerNombre)} · ${act?.nombre || asg.actividadId}`, secondary: [reg.date, partidaMap.get(partidaId)?.nombre || "Sin partida", reg.frenteNombre || "Sin frente"].filter(Boolean).join(" · "), hn, he, total })
    })
  })
  return rows.sort((a, b) => b.total - a.total)
}

function bump(map, key, seed, hn, he) { const current = map.get(key) || seed; current.hn += hn; current.he += he; map.set(key, current) }
function toList(map) { return Array.from(map.values()).sort((a, b) => (b.hn + b.he) - (a.hn + a.he)) }
function cleanCategory(value) { return String(value || "").replace(/^\d+\s*/, "").trim() || "Sin categoria" }
function shortName(value) { return String(value || "").split(",")[0] || "Sin nombre" }
function fmtHours(value) { return Number(value || 0).toFixed(1).replace(/\.0$/, "") }
function fmtCurrency(value) { return `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` }
