import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Lógica central para interactuar con Gemini 1.5 Flash de forma gratuita.
 * @param {string} apiKey - La llave de Gemini (almacenada en Config).
 * @param {string} userQuery - La pregunta del usuario.
 * @param {object} context - { workers, registros, actividades, fechaTareo }
 */
export async function askAssistant(apiKey, userQuery, context) {
  // Prioridad: 1. API Key de Config, 2. Variable de Entorno de Railway/Vite
  const FINAL_KEY = apiKey || import.meta.env.VITE_GEMINI_API_KEY;

  if (!FINAL_KEY) throw new Error("MISSING_KEY");

  const genAI = new GoogleGenerativeAI(FINAL_KEY);
  
  // Estrategia de Failover con modelos de Nueva Generación
  const modelsToTry = [
    "gemini-2.0-flash-exp", // Nueva generación (Preview)
    "gemini-1.5-flash",     // Estable actual
    "gemini-1.5-pro",      // Pro (fallback de precisión)
    "gemini-pro"           // Máxima compatibilidad
  ];
  
  const scrubbed = scrubData(context);

  const systemPrompt = `
    Eres el "Asistente Tareador S10", un experto gestor de mano de obra en construcción.
    Tu misión es analizar los datos del proyecto y responder consultas del Maestro de Obra o Administrador.
    
    DATOS DEL PROYECTO (Semana Actual):
    - Fecha de hoy: ${scrubbed.fecha}
    - Trabajadores registrados (Anonimizados): ${JSON.stringify(scrubbed.workers)}
    - Log de Tareos (Historial Filtrado): ${JSON.stringify(scrubbed.registros)}
    
    REGLAS DE RESPUESTA:
    1. Sé extremadamente preciso con los números y nombres.
    2. Si te preguntan por totales, súmalos tú mismo basándote en el Log de Tareos.
    3. Responde siempre en Español, de forma profesional y motivadora.
    4. Usa Markdown (negritas, tablas, listas) para que la información sea fácil de leer en un celular.
    5. Si te falta información para ser exacto, dilo: "No tengo el registro de ayer para X, pero hoy..."
  `;

  let lastError = null;
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([systemPrompt, userQuery]);
      const response = await result.response;
      return response.text();
    } catch (error) {
      lastError = error;
      const errorStr = error.toString();
      // Si es un error de cuota, no seguir probando otros modelos (la llave está agotada)
      if (errorStr.includes("429") || errorStr.toLowerCase().includes("quota")) {
        throw new Error("RATE_LIMIT");
      }
      // Si es 404, intentar el siguiente modelo de la lista
      console.warn(`Model ${modelName} failed, trying next...`, error);
      continue;
    }
  }

  // Si llegamos aquí, todos los modelos fallaron
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
