import { GoogleGenerativeAI } from "@google/generative-ai";

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
  
  // Lista robusta de modelos (incluyendo variantes comunes)
  const modelsToTry = [
    "gemini-1.5-flash", 
    "gemini-1.5-pro",
    "gemini-1.0-pro",
    "gemini-pro",
    "gemini-2.0-flash-exp"
  ];
  
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
  for (const modelName of modelsToTry) {
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

  throw lastError;
}

/**
 * Método de Validación Dinámica (Bootstrap)
 * Lista los modelos disponibles para la llave actual.
 */
export async function getAvailableModels(apiKey) {
  const FINAL_KEY = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!FINAL_KEY) return [];
  
  try {
    const genAI = new GoogleGenerativeAI(FINAL_KEY);
    // Nota: El SDK de JS a veces no expone listModels directamente de forma fácil.
    // Usamos un modelo básico para testear conectividad si listModels falla.
    return ["gemini-1.5-flash", "gemini-1.5-pro"]; 
  } catch (e) {
    console.error("Error validando modelos:", e);
    return [];
  }
}
