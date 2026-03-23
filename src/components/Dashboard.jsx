import { useMemo } from "react"
import { getWeekRange } from "../utils/dateUtils"

export default function Dashboard({
  registros, workers, actividades, partidas, projectConfig, fechaTareo
}) {
  const { dates } = useMemo(() => getWeekRange(fechaTareo), [fechaTareo])
  const DAY_LABELS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"]

  // ── Aggregate all data from registros ──────────────────────────────────────
  const stats = useMemo(() => {
    let totalHN = 0, totalHE = 0, totalCosto = 0
    const workerMap = {}   // workerId → { nombre, categoria, costoHora, hn, he }
    const actMap = {}      // actividadId → { nombre, partidaNombre, hn, he }
    const dayMap = {}      // date → { hn, he }

    dates.forEach(d => { dayMap[d] = { hn: 0, he: 0 } })

    registros.forEach(reg => {
      const w = workers.find(x => x.id === reg.workerId)
      const costoHora = w?.costoHora || 0

      if (!workerMap[reg.workerId]) {
        workerMap[reg.workerId] = {
          nombre: reg.workerNombre,
          categoria: w?.categoria || "—",
          costoHora,
          hn: 0, he: 0
        }
      }

      reg.assignments?.forEach(asg => {
        const hn = asg.horasNormales || 0
        const he = asg.horasExtras || 0

        totalHN += hn
        totalHE += he
        totalCosto += (hn + he) * costoHora

        workerMap[reg.workerId].hn += hn
        workerMap[reg.workerId].he += he

        if (dayMap[reg.date]) {
          dayMap[reg.date].hn += hn
          dayMap[reg.date].he += he
        }

        const actId = asg.actividadId
        if (actId) {
          if (!actMap[actId]) {
            const act = actividades.find(a => a.id === actId)
            const partida = act ? partidas.find(p => p.id === act.partidaId) : null
            actMap[actId] = {
              nombre: act?.nombre || actId,
              partidaNombre: partida?.nombre || "—",
              hn: 0, he: 0
            }
          }
          actMap[actId].hn += hn
          actMap[actId].he += he
        }
      })
    })

    const workerList = Object.values(workerMap).sort((a, b) => (b.hn + b.he) - (a.hn + a.he))
    const actList = Object.values(actMap).sort((a, b) => (b.hn + b.he) - (a.hn + a.he))
    const dayList = dates.map((d, i) => ({ label: DAY_LABELS[i], date: d, ...dayMap[d] }))
    const maxDayHoras = Math.max(...dayList.map(d => d.hn + d.he), 1)

    const diasConRegistro = dates.filter(d => dayMap[d].hn + dayMap[d].he > 0).length
    const workersActivos = workerList.length

    // Category breakdown
    const catMap = {}
    workerList.forEach(w => {
      const cat = w.categoria.replace(/^\d+\s*/, "") // strip leading "003 " etc.
      if (!catMap[cat]) catMap[cat] = { hn: 0, he: 0, count: 0 }
      catMap[cat].hn += w.hn
      catMap[cat].he += w.he
      catMap[cat].count++
    })
    const catList = Object.entries(catMap).map(([cat, v]) => ({ cat, ...v, total: v.hn + v.he })).sort((a, b) => b.total - a.total)

    return {
      totalHN, totalHE, totalCosto,
      diasConRegistro, workersActivos,
      workerList, actList: actList.slice(0, 8), dayList, maxDayHoras,
      catList
    }
  }, [registros, workers, actividades, partidas, dates])

  const fmt = (n) => n.toFixed(1).replace(/\.0$/, "")
  const fmtCurrency = (n) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  const totalHoras = stats.totalHN + stats.totalHE

  const CAT_COLORS = [
    "var(--accent-blue)",
    "var(--accent-gold)",
    "var(--green-accent)",
    "#a855f7",
    "#f97316",
  ]

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Project info bar */}
      {projectConfig?.obra && (
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius-md)", padding: "10px 16px",
          fontSize: "13px", color: "var(--text-dim)", display: "flex", gap: "24px", flexWrap: "wrap"
        }}>
          <span><span style={{ color: "var(--text-muted)", marginRight: 6 }}>Empresa:</span><strong style={{ color: "var(--text-main)" }}>{projectConfig.empresa}</strong></span>
          <span><span style={{ color: "var(--text-muted)", marginRight: 6 }}>Obra:</span><strong style={{ color: "var(--accent-gold)" }}>{projectConfig.obra}</strong></span>
        </div>
      )}

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "14px" }}>
        <KpiCard label="Horas Semana" value={fmt(totalHoras)} sub={`${fmt(stats.totalHN)} N + ${fmt(stats.totalHE)} E`} color="var(--accent-blue)" icon="⏱" />
        <KpiCard label="Trabajadores" value={stats.workersActivos} sub="activos esta semana" color="var(--accent-gold)" icon="👷" />
        <KpiCard label="Costo Estimado" value={fmtCurrency(stats.totalCosto)} sub="mano de obra" color="var(--green-accent)" icon="💰" />
        <KpiCard label="Cobertura" value={`${stats.diasConRegistro}/6`} sub="días con registro" color="#a855f7" icon="📅" />
      </div>

      {/* ── Body Grid ─────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

        {/* Horas por día */}
        <div className="dash-card">
          <SectionTitle>Horas por Día</SectionTitle>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "110px", marginTop: "12px" }}>
            {stats.dayList.map(day => {
              const total = day.hn + day.he
              const heightPct = total > 0 ? Math.max((total / stats.maxDayHoras) * 100, 6) : 0
              const heHeightPct = total > 0 ? (day.he / total) * heightPct : 0
              const hnHeightPct = heightPct - heHeightPct
              return (
                <div key={day.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                    {total > 0 ? fmt(total) : ""}
                  </span>
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ width: "70%", display: "flex", flexDirection: "column", borderRadius: "3px 3px 0 0", overflow: "hidden" }}>
                      {heHeightPct > 0 && (
                        <div style={{ height: `${heHeightPct}px`, background: "var(--accent-gold)", opacity: 0.85 }} title={`Extras: ${fmt(day.he)}h`} />
                      )}
                      {hnHeightPct > 0 && (
                        <div style={{ height: `${hnHeightPct}px`, background: "var(--accent-blue)" }} title={`Normales: ${fmt(day.hn)}h`} />
                      )}
                      {heightPct === 0 && (
                        <div style={{ height: "4px", background: "var(--border-dim)", borderRadius: "2px" }} />
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: "10px", color: total > 0 ? "var(--text-dim)" : "var(--text-muted)" }}>{day.label}</span>
                </div>
              )
            })}
          </div>
          <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
            <Legend color="var(--accent-blue)" label="Normales" />
            <Legend color="var(--accent-gold)" label="Extras" />
          </div>
        </div>

        {/* Categorías */}
        <div className="dash-card">
          <SectionTitle>Por Categoría</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
            {stats.catList.length === 0 && <EmptyMsg />}
            {stats.catList.map((cat, i) => (
              <div key={cat.cat}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                  <span style={{ color: "var(--text-dim)" }}>{cat.cat}</span>
                  <span style={{ color: CAT_COLORS[i % CAT_COLORS.length], fontFamily: "monospace", fontWeight: 600 }}>
                    {fmt(cat.total)}h &nbsp;<span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({cat.count} trab.)</span>
                  </span>
                </div>
                <div style={{ background: "var(--border-dim)", borderRadius: "99px", height: "6px" }}>
                  <div style={{
                    height: "6px", borderRadius: "99px",
                    background: CAT_COLORS[i % CAT_COLORS.length],
                    width: `${totalHoras > 0 ? (cat.total / totalHoras) * 100 : 0}%`,
                    transition: "width 0.4s ease"
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Actividades + Trabajadores ─────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

        {/* Top Actividades */}
        <div className="dash-card">
          <SectionTitle>Top Actividades <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "12px" }}>semana</span></SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
            {stats.actList.length === 0 && <EmptyMsg />}
            {stats.actList.map((act, i) => {
              const total = act.hn + act.he
              const maxAct = stats.actList[0] ? stats.actList[0].hn + stats.actList[0].he : 1
              return (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "3px" }}>
                    <span style={{ color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }} title={act.nombre}>
                      {act.nombre}
                    </span>
                    <span style={{ fontFamily: "monospace", color: "var(--accent-gold)", fontWeight: 600, flexShrink: 0 }}>{fmt(total)}h</span>
                  </div>
                  <div style={{ background: "var(--border-dim)", borderRadius: "99px", height: "5px" }}>
                    <div style={{
                      height: "5px", borderRadius: "99px",
                      background: i === 0 ? "var(--accent-blue)" : "var(--accent-blue)",
                      opacity: 1 - i * 0.09,
                      width: `${(total / maxAct) * 100}%`
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Trabajadores */}
        <div className="dash-card">
          <SectionTitle>Trabajadores <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "12px" }}>semana</span></SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px", overflowY: "auto", maxHeight: "220px" }}>
            {stats.workerList.length === 0 && <EmptyMsg />}
            {stats.workerList.map((w, i) => {
              const total = w.hn + w.he
              const costo = total * w.costoHora
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "6px 8px", borderRadius: "var(--radius-sm)",
                  background: i === 0 ? "rgba(37,99,235,0.08)" : "transparent",
                  borderBottom: "1px solid var(--border-dim)"
                }}>
                  <span style={{
                    fontSize: "11px", fontWeight: 700, color: "var(--text-muted)",
                    width: "18px", textAlign: "right", flexShrink: 0
                  }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {w.nombre.split(",")[0]}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      {w.categoria.replace(/^\d+\s*/, "")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--accent-blue)", fontWeight: 600 }}>
                      {fmt(w.hn)}<span style={{ color: "var(--text-muted)", fontSize: "10px" }}>N</span>
                      {w.he > 0 && <> +{fmt(w.he)}<span style={{ color: "var(--accent-gold)", fontSize: "10px" }}>E</span></>}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--green-accent)" }}>{fmtCurrency(costo)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Small sub-components ───────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius-md)", padding: "16px",
      borderTop: `3px solid ${color}`
    }}>
      <div style={{ fontSize: "20px", marginBottom: "4px" }}>{icon}</div>
      <div style={{ fontSize: "26px", fontWeight: 800, color, fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>{label}</div>
      <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "2px" }}>{sub}</div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent-gold)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {children}
    </div>
  )
}

function Legend({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "var(--text-muted)" }}>
      <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: color }} />
      {label}
    </div>
  )
}

function EmptyMsg() {
  return <div style={{ color: "var(--text-muted)", fontSize: "12px", textAlign: "center", padding: "16px 0" }}>Sin registros esta semana</div>
}
