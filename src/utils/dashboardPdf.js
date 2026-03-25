import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

function fmtHours(value) {
  return Number(value || 0).toFixed(1).replace(/\.0$/, "")
}

function fmtCurrency(value) {
  return `S/ ${Number(value || 0).toLocaleString("es-PE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

function formatFilterSummary(filters = {}) {
  const parts = []
  if (filters.search) parts.push(`Buscar: ${filters.search}`)
  if (filters.frenteFilter) parts.push(`Frente: ${filters.frenteFilter}`)
  if (filters.categoriaFilter) parts.push(`Categoría: ${filters.categoriaFilter}`)
  if (filters.actividadFilter) parts.push(`Actividad: ${filters.actividadFilter}`)
  if (filters.onlyExtras) parts.push("Solo con HE")
  return parts.length ? parts.join(" · ") : "Sin filtros"
}

export function exportDashboardExecutivePdf({
  fechaTareo,
  projectConfig,
  filters,
  weekStats,
  cumulativeStats,
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" })
  const primary = [37, 99, 235]
  const gold = [234, 179, 8]
  const dark = [15, 23, 42]
  const dim = [100, 116, 139]
  const text = [30, 41, 59]

  doc.setFillColor(...dark)
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 88, "F")

  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.text("Reporte Ejecutivo de Dashboard", 40, 34)

  doc.setFontSize(11)
  doc.setTextColor(...gold)
  doc.text(projectConfig?.empresa || "Sin empresa", 40, 54)
  doc.setTextColor(226, 232, 240)
  doc.text(projectConfig?.obra || "Sin obra", 40, 70)

  doc.setTextColor(...text)
  doc.setFontSize(11)
  doc.setFont("helvetica", "normal")
  doc.text(`Corte: ${fechaTareo}`, 40, 112)
  doc.text(`Filtros: ${formatFilterSummary(filters)}`, 40, 128)

  autoTable(doc, {
    startY: 148,
    head: [["Indicador", "Semana activa", `Acumulado al ${fechaTareo}`]],
    body: [
      ["Horas totales", fmtHours(weekStats.totalHoras), fmtHours(cumulativeStats.totalHoras)],
      ["Horas normales", fmtHours(weekStats.totalHN), fmtHours(cumulativeStats.totalHN)],
      ["Horas extras", fmtHours(weekStats.totalHE), fmtHours(cumulativeStats.totalHE)],
      ["Costo estimado", fmtCurrency(weekStats.totalCosto), fmtCurrency(cumulativeStats.totalCosto)],
      ["Trabajadores activos", String(weekStats.workerList.length), String(cumulativeStats.workerList.length)],
      ["Asignaciones", String(weekStats.assignments), String(cumulativeStats.assignments)],
    ],
    theme: "grid",
    headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 10, cellPadding: 6 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 },
  })

  const topActivities = cumulativeStats.activityList.slice(0, 8).map((item) => [
    item.nombre,
    fmtHours(item.hn),
    fmtHours(item.he),
    fmtHours(item.total),
  ])

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 18,
    head: [["Top actividades acumuladas", "HN", "HE", "Total"]],
    body: topActivities.length ? topActivities : [["Sin datos", "-", "-", "-"]],
    theme: "grid",
    headStyles: { fillColor: dark, textColor: gold, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 5 },
    margin: { left: 40, right: 40 },
  })

  const topWorkers = cumulativeStats.workerList.slice(0, 8).map((item) => [
    item.nombre,
    item.categoria,
    fmtHours(item.total),
    fmtCurrency(item.costo),
  ])

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 18,
    head: [["Top trabajadores acumulados", "Categoría", "Horas", "Costo"]],
    body: topWorkers.length ? topWorkers : [["Sin datos", "-", "-", "-"]],
    theme: "grid",
    headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 5 },
    margin: { left: 40, right: 40 },
  })

  const weekDays = weekStats.dayList.map((day) => [
    `${day.label} ${day.dayNum}`,
    fmtHours(day.hn),
    fmtHours(day.he),
    fmtHours(day.total),
    String(day.workers),
  ])

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 18,
    head: [["Semana activa", "HN", "HE", "Total", "Trabajadores"]],
    body: weekDays.length ? weekDays : [["Sin datos", "-", "-", "-", "-"]],
    theme: "grid",
    headStyles: { fillColor: gold, textColor: dark, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 5 },
    margin: { left: 40, right: 40 },
  })

  doc.setTextColor(...dim)
  doc.setFontSize(9)
  doc.text(
    "Documento generado desde Tareador Control de Proyecto.",
    40,
    doc.internal.pageSize.getHeight() - 24
  )

  const filename = `Dashboard_Gerencial_${fechaTareo}.pdf`
  doc.save(filename)
  return filename
}
