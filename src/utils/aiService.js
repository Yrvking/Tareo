import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Lógica central para interactuar con Gemini 1.5 Flash de forma gratuita.
 * @param {string} apiKey - La llave de Gemini (almacenada en Config).
 * @param {string} userQuery - La pregunta del usuario.
 * @param {object} context - { workers, registros, actividades, fechaTareo }
 */
export async function askAssistant(apiKey, userQuery, context) {
  // Hardcoded fallback for zero-cost immediate activation
  const FINAL_KEY = apiKey || "AIzaSyCpdllHhW0I8rtzfl9u4A6GW62r9MqG6Gk";

  if (!FINAL_KEY) {
    throw new Error("MISSING_KEY");
  }

  const genAI = new GoogleGenerativeAI(FINAL_KEY);
  // Forzar v1 para evitar errores de 404 en v1beta con gemini-1.5-flash
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: "v1" });

  // Simplificar contexto para no saturar tokens (aunque Flash aguanta 1M)
  const slimWorkers = context.workers.map(w => ({ id: w.id, nombre: w.nombre, cat: w.categoria }));
  const slimRegistros = context.registros.map(r => ({
    trabajador: r.workerNombre,
    fecha: r.date,
    tareas: r.assignments.map(a => ({
      act: context.actividades.find(act => act.id === a.actividadId)?.nombre || a.actividadId,
      hn: a.horasNormales,
      he: a.horasExtras
    }))
  }));

  const systemPrompt = `
    Eres el "Asistente Tareador S10", un experto gestor de mano de obra en construcción.
    Tu misión es analizar los datos del proyecto y responder consultas del Maestro de Obra o Administrador.
    
    DATOS DEL PROYECTO (Semana Actual):
    - Fecha de hoy: ${context.fechaTareo}
    - Trabajadores registrados: ${JSON.stringify(slimWorkers)}
    - Log de Tareos (Historial): ${JSON.stringify(slimRegistros)}
    
    REGLAS DE RESPUESTA:
    1. Sé extremadamente preciso con los números y nombres.
    2. Si te preguntan por totales, súmalos tú mismo basándote en el Log de Tareos.
    3. Responde siempre en Español, de forma profesional y motivadora.
    4. Usa Markdown (negritas, tablas, listas) para que la información sea fácil de leer en un celular.
    5. Si te falta información para ser exacto, dilo: "No tengo el registro de ayer para X, pero hoy..."
  `;

  try {
    const result = await model.generateContent([systemPrompt, userQuery]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    const errorStr = error.toString();
    if (errorStr.includes("429") || errorStr.toLowerCase().includes("quota")) {
      throw new Error("RATE_LIMIT");
    }
    throw error;
  }
}
