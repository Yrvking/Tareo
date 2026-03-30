import { GoogleGenerativeAI } from "@google/generative-ai";

const PREFERRED_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-1.0-pro"
];

function normalizeModelName(modelName) {
  return String(modelName || "").replace(/^models\//, "").trim();
}

async function fetchGenerateContentModels(apiKey) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MODELS_LIST_FAILED:${response.status}:${text}`);
  }

  const payload = await response.json();
  const models = Array.isArray(payload.models) ? payload.models : [];

  return models
    .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
    .map(m => normalizeModelName(m.name))
    .filter(Boolean);
}

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function buildMapById(items = []) {
  const map = new Map()
  items.forEach((item) => {
    map.set(String(item?.id ?? item?.codigo ?? ""), item)
  })
  return map
}

function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getWeekStart(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(dateValue || "")
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  return formatLocalDate(date)
}

function maskWorkerName(worker = {}) {
  const baseName = String(worker.nombre || worker.name || "").trim()
  const firstToken = baseName.split(/\s+/).filter(Boolean)[0] || "Trabajador"
  const suffix = String(worker.codigo || worker.id || worker.dni || "")
    .replace(/\D/g, "")
    .slice(-3)
  return suffix ? `${firstToken}-${suffix}` : firstToken
}

function takeTopEntries(entries, limit = 5) {
  return Array.from(entries.entries())
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => (b.total || 0) - (a.total || 0))
    .slice(0, limit)
}

function summarizeRegistros(registros = [], context = {}) {
  const workerMap = buildMapById(context.workers)
  const activityMap = buildMapById(context.actividades)
  const partidaMap = buildMapById(context.partidas)
  const frenteMap = buildMapById(context.frentes)

  const summary = {
    totalRegistros: 0,
    totalHN: 0,
    totalHE: 0,
    totalHoras: 0,
    costoEstimado: 0,
    uniqueWorkers: new Set(),
    uniqueDates: new Set(),
    categories: new Map(),
    activities: new Map(),
    frentes: new Map(),
    workers: new Map(),
    recentAssignments: [],
  }

  registros.forEach((registro) => {
    const worker = workerMap.get(String(registro.workerId || ""))
    const workerLabel = maskWorkerName(worker || { id: registro.workerId, nombre: registro.workerName })
    const category = String(worker?.categoria || registro.categoria || "Sin categoría").trim() || "Sin categoría"
    const workerCost = toNumber(worker?.costoHora)
    const assignments = Array.isArray(registro.assignments) ? registro.assignments : []

    summary.totalRegistros += 1
    if (registro.date) summary.uniqueDates.add(registro.date)
    if (registro.workerId) summary.uniqueWorkers.add(String(registro.workerId))

    assignments.forEach((assignment) => {
      const hn = toNumber(assignment.horasNormales)
      const he = toNumber(assignment.horasExtras)
      const total = hn + he
      const activity = activityMap.get(String(assignment.actividadId || ""))
      const partida = partidaMap.get(String(activity?.partidaId || assignment.partidaId || ""))
      const frente = frenteMap.get(String(assignment.frenteId || ""))
      const activityName = String(activity?.nombre || assignment.actividadId || "Actividad general").trim()
      const frenteName = String(frente?.nombre || assignment.frenteId || "Sin frente").trim() || "Sin frente"
      const partidaName = String(partida?.nombre || partida?.id || "Sin partida").trim() || "Sin partida"

      summary.totalHN += hn
      summary.totalHE += he
      summary.totalHoras += total
      summary.costoEstimado += total * workerCost

      summary.categories.set(category, (summary.categories.get(category) || 0) + total)

      const activityEntry = summary.activities.get(activityName) || { total: 0, hn: 0, he: 0, partida: partidaName }
      activityEntry.total += total
      activityEntry.hn += hn
      activityEntry.he += he
      activityEntry.partida = partidaName
      summary.activities.set(activityName, activityEntry)

      const frenteEntry = summary.frentes.get(frenteName) || { total: 0, hn: 0, he: 0 }
      frenteEntry.total += total
      frenteEntry.hn += hn
      frenteEntry.he += he
      summary.frentes.set(frenteName, frenteEntry)

      const workerEntry = summary.workers.get(workerLabel) || { total: 0, hn: 0, he: 0, categoria: category }
      workerEntry.total += total
      workerEntry.hn += hn
      workerEntry.he += he
      workerEntry.categoria = category
      summary.workers.set(workerLabel, workerEntry)

      if (summary.recentAssignments.length < 24) {
        summary.recentAssignments.push({
          fecha: registro.date,
          trabajador: workerLabel,
          categoria: category,
          actividad: activityName,
          partida: partidaName,
          frente: frenteName,
          hn,
          he,
          total,
        })
      }
    })
  })

  const totalWorkers = summary.uniqueWorkers.size
  const totalDates = summary.uniqueDates.size

  return {
    totalRegistros: summary.totalRegistros,
    totalTrabajadores: totalWorkers,
    totalDias: totalDates,
    totalHN: Number(summary.totalHN.toFixed(2)),
    totalHE: Number(summary.totalHE.toFixed(2)),
    totalHoras: Number(summary.totalHoras.toFixed(2)),
    horasPromedioPorTrabajador: totalWorkers ? Number((summary.totalHoras / totalWorkers).toFixed(2)) : 0,
    horasPromedioPorDia: totalDates ? Number((summary.totalHoras / totalDates).toFixed(2)) : 0,
    costoEstimado: Number(summary.costoEstimado.toFixed(2)),
    topCategorias: takeTopEntries(summary.categories, 5).map((item) => ({
      categoria: item.name,
      horas: Number((item.total || 0).toFixed(2)),
    })),
    topActividades: takeTopEntries(summary.activities, 6).map((item) => ({
      actividad: item.name,
      partida: item.partida,
      horas: Number((item.total || 0).toFixed(2)),
      hn: Number((item.hn || 0).toFixed(2)),
      he: Number((item.he || 0).toFixed(2)),
    })),
    topFrentes: takeTopEntries(summary.frentes, 5).map((item) => ({
      frente: item.name,
      horas: Number((item.total || 0).toFixed(2)),
    })),
    topTrabajadores: takeTopEntries(summary.workers, 6).map((item) => ({
      trabajador: item.name,
      categoria: item.categoria,
      horas: Number((item.total || 0).toFixed(2)),
      hn: Number((item.hn || 0).toFixed(2)),
      he: Number((item.he || 0).toFixed(2)),
    })),
    recentAssignments: summary.recentAssignments,
  }
}

function buildWeeklyTrend(registros = []) {
  const buckets = new Map()

  registros.forEach((registro) => {
    const weekKey = getWeekStart(registro.date)
    const entry = buckets.get(weekKey) || {
      semana: weekKey,
      hn: 0,
      he: 0,
      total: 0,
      trabajadores: new Set(),
    }

    if (registro.workerId) entry.trabajadores.add(String(registro.workerId))

    ;(Array.isArray(registro.assignments) ? registro.assignments : []).forEach((assignment) => {
      const hn = toNumber(assignment.horasNormales)
      const he = toNumber(assignment.horasExtras)
      entry.hn += hn
      entry.he += he
      entry.total += hn + he
    })

    buckets.set(weekKey, entry)
  })

  return Array.from(buckets.values())
    .sort((a, b) => String(a.semana).localeCompare(String(b.semana)))
    .slice(-8)
    .map((entry) => ({
      semana: entry.semana,
      hn: Number(entry.hn.toFixed(2)),
      he: Number(entry.he.toFixed(2)),
      total: Number(entry.total.toFixed(2)),
      trabajadores: entry.trabajadores.size,
    }))
}

/**
 * Resume datos del sistema antes de enviarlos al modelo para mejorar reportes
 * sin depender solo de la semana visible.
 */
function scrubData(context) {
  if (!context) {
    return {
      fecha: "",
      proyecto: {},
      ventanaActual: {},
      historico: {},
      tendenciaSemanal: [],
      trabajadores: [],
    }
  }

  const currentRegistros = Array.isArray(context.registros) ? context.registros : []
  const historicalRegistros = Array.isArray(context.allRegistros) && context.allRegistros.length
    ? context.allRegistros
    : currentRegistros

  const workers = Array.isArray(context.workers) ? context.workers : []
  const visibleWorkers = workers.slice(0, 60).map((worker) => ({
    trabajador: maskWorkerName(worker),
    categoria: String(worker.categoria || "Sin categoría").trim() || "Sin categoría",
    costoHora: toNumber(worker.costoHora),
  }))

  return {
    fecha: context.fechaTareo,
    proyecto: {
      empresa: String(context.projectConfig?.empresa || "").trim() || "Proyecto actual",
      obra: String(context.projectConfig?.obra || "").trim() || "Obra actual",
      codigoProyecto: String(context.projectConfig?.codigoProyecto || "").trim(),
    },
    trabajadores: visibleWorkers,
    ventanaActual: summarizeRegistros(currentRegistros, context),
    historico: summarizeRegistros(historicalRegistros, context),
    tendenciaSemanal: buildWeeklyTrend(historicalRegistros),
  }
}

export async function askAssistant(apiKey, userQuery, context) {
  const FINAL_KEY = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!FINAL_KEY) throw new Error("MISSING_KEY");

  const genAI = new GoogleGenerativeAI(FINAL_KEY);

  let discoveredModels = [];
  try {
    discoveredModels = await fetchGenerateContentModels(FINAL_KEY);
  } catch (error) {
    console.warn("No se pudo listar modelos en bootstrap. Se usa fallback local.", error);
  }

  const modelsToTry = Array.from(new Set([...PREFERRED_MODELS, ...discoveredModels]));
  
  const scrubbed = scrubData(context);

  const systemPrompt = `
    Eres el "Asistente Tareador S10", experto en construcción, costos, productividad y control gerencial.
    Analiza estos datos resumidos del sistema:
    - Fecha de consulta: ${scrubbed.fecha}
    - Proyecto: ${JSON.stringify(scrubbed.proyecto)}
    - Trabajadores referenciales: ${JSON.stringify(scrubbed.trabajadores)}
    - Ventana actual visible: ${JSON.stringify(scrubbed.ventanaActual)}
    - Histórico completo cargado: ${JSON.stringify(scrubbed.historico)}
    - Tendencia semanal reciente: ${JSON.stringify(scrubbed.tendenciaSemanal)}

    Reglas de respuesta:
    - Responde en español profesional y claro.
    - Usa Markdown.
    - Distingue entre "ventana actual" e "histórico" cuando corresponda.
    - Si el usuario pide un informe, entrega al menos:
      1. Resumen ejecutivo
      2. Hallazgos clave
      3. Riesgos o desviaciones
      4. Recomendaciones accionables
    - Si no hay suficiente evidencia para una conclusión, dilo explícitamente.
    - Prioriza horas, horas extra, productividad, concentración por actividad/categoría y tendencia semanal.
  `;

  let lastError = null;
  for (const rawModelName of modelsToTry) {
    const modelName = normalizeModelName(rawModelName);
    try {
      console.log(`Intentando conectar con modelo: ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([systemPrompt, userQuery]);
      const response = await result.response;
      return response.text();
    } catch (error) {
      lastError = error;
      const errorStr = error.toString();
      // Si el error es 404 (No encontrado), pasar al siguiente modelo
      if (errorStr.includes("404")) {
        console.warn(`Modelo ${modelName} no disponible (404). Saltando...`);
        continue;
      }
      // Si es error de cuota, abortar (es la llave, no el modelo)
      if (errorStr.includes("429") || errorStr.toLowerCase().includes("quota")) {
        throw new Error("RATE_LIMIT");
      }
      // Otros errores (seguridad, etc) abortar
      throw error;
    }
  }

  throw new Error(lastError?.message || "NO_MODEL_AVAILABLE");
}

/**
 * Método de Validación Dinámica (Bootstrap)
 * Lista los modelos disponibles para la llave actual.
 */
export async function getAvailableModels(apiKey) {
  const FINAL_KEY = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!FINAL_KEY) return [];

  try {
    const models = await fetchGenerateContentModels(FINAL_KEY);
    const preferredFirst = [...PREFERRED_MODELS, ...models].map(normalizeModelName);
    return Array.from(new Set(preferredFirst)).filter(m => models.includes(m));
  } catch (e) {
    console.error("Error validando modelos:", e);
    return [];
  }
}
