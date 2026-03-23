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

/**
 * Capa de Limpieza de Datos (Privacy Scrubbing)
 * Elimina IDs reales o información sensible antes de subir a la nube.
 */
function scrubData(context) {
  if (!context || !context.workers) return { workers: [], registros: [], fecha: "" };
  return {
    workers: context.workers.map(w => ({ 
      id: "anon_" + String(w.id).slice(-4), 
      nombre: String(w.nombre).split(' ')[0], 
      cat: w.categoria 
    })),
    registros: context.registros.map(r => ({
      fecha: r.date,
      tareas: r.assignments.map(a => ({
        act: context.actividades.find(act => act.id === a.actividadId)?.nombre || "Actividad_Gral",
        hn: a.horasNormales,
        he: a.horasExtras
      }))
    })),
    fecha: context.fechaTareo
  };
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
    Eres el "Asistente Tareador S10", experto en construcción.
    Analiza estos datos anonimizados:
    - Fecha: ${scrubbed.fecha}
    - Trabajadores: ${JSON.stringify(scrubbed.workers)}
    - Tareos: ${JSON.stringify(scrubbed.registros)}
    
    Responde de forma técnica y profesional en Español con Markdown.
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
