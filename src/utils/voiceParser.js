import Fuse from "fuse.js"

export function normalize(str) {
  if (!str) return ""
  let s = str.toString()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents

  // remove all non-alphanumeric (like ()!-/), but KEEP . and ,
  s = s.replace(/[^a-z0-9\s.,]/g, "")
  // remove . and , that are NOT strictly between digits
  s = s.replace(/(?<=\D)[.,]|[.,](?=\D)/g, "")
  s = s.replace(/^[.,]|[.,]$/g, "")

  return s.trim()
}

const NUMBER_WORDS = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  media: 0.5, medio: 0.5,
}

// Filler/noise words to strip out before parsing
const FILLER_WORDS = [
  "eh", "este", "mmm", "am", "a ver", "bueno", "entonces",
  "pues", "aver", "haber", "ahi", "ya", "aja", "ok", "okay",
  "digamos", "osea", "o sea",
  // Spanish pronouns / discourse markers that confuse worker matching
  "yo", "mi", "me", "el", "ella", "nos", "nosotros",
  "le", "les", "se", "tu", "usted", "ellos", "ellas",
]

function stripFillerWords(text) {
  let clean = text
  for (const filler of FILLER_WORDS) {
    const re = new RegExp(`\\b${filler}\\b`, "gi")
    clean = clean.replace(re, " ")
  }
  return clean.replace(/\s+/g, " ").trim()
}

function findBestWorkerMatch(text, workers) {
  const norm = normalize(text)
  if (!workers || workers.length === 0 || !norm) return null

  // Use generous threshold so Fuse never pre-filters candidates we could boost.
  // Our own gate (>= 40 below) is the true quality filter.
  const fuse = new Fuse(workers, {
    keys: ["nombre", "id", "codigo"],
    includeScore: true,
    threshold: 0.8,
    ignoreLocation: true,
    useExtendedSearch: true,
    minMatchCharLength: 2,
  })

  // Compute our own 0-100 score from a fuse result + query
  const scoreResult = (fuseResult, query) => {
    const baseScore = Math.max(0, 100 - (fuseResult.score * 100))
    let finalScore = baseScore

    const nameNorm = normalize(fuseResult.item.nombre)
    const nameWords = nameNorm.split(/\s+/)
    const queryWords = query.split(/\s+/).filter(w => w.length >= 3 && !/^\d+([.,]\d+)?$/.test(w))

    // Exact word match → strong boost (handles "elme" in "elme moran jhon jorge")
    const hasExactWordMatch = queryWords.some(tw => nameWords.some(nw => nw === tw))
    if (hasExactWordMatch) finalScore = Math.max(finalScore, 82)

    // Near-match: word differs by ≤1 char (handles "john" ↔ "jhon")
    const hasNearWordMatch = queryWords.some(tw =>
      nameWords.some(nw => Math.abs(tw.length - nw.length) <= 1 && levenshtein(tw, nw) <= 1)
    )
    if (hasNearWordMatch) finalScore = Math.max(finalScore, 65)

    // Full substring containment → perfect
    if (nameNorm.includes(query) || query.includes(nameNorm)) finalScore = 100

    return finalScore
  }

  let bestWorker = null
  let bestScore = 0

  const trySearch = (query) => {
    const results = fuse.search(query)
    if (results.length > 0) {
      const s = scoreResult(results[0], query)
      if (s > bestScore) { bestScore = s; bestWorker = results[0].item }
    }
  }

  // Strategy 1: full text
  trySearch(norm)

  // Strategy 2: individual tokens + 2-word phrases (skip numbers)
  const tokens = norm.split(/\s+/).filter(w => w.length >= 3 && !/^\d+([.,]\d+)?$/.test(w))
  for (const token of tokens) trySearch(token)
  for (let i = 0; i < tokens.length - 1; i++) trySearch(`${tokens[i]} ${tokens[i + 1]}`)

  return bestScore >= 40 ? { worker: bestWorker, score: bestScore } : null
}

// Simple Levenshtein for short strings (used only for ≤8 char words)
function levenshtein(a, b) {
  if (a === b) return 0
  if (a.length > 8 || b.length > 8) return 99
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[a.length][b.length]
}

function findBestFrenteMatch(text, frentes) {
  const norm = normalize(text)

  for (const f of frentes) {
    const fNorm = normalize(f.id)
    const fNameNorm = normalize(f.nombre)

    if (norm.includes(fNorm)) return f
    if (norm.includes(fNameNorm)) return f

    const nameParts = fNameNorm.split(/\s+/)
    if (nameParts.length >= 2) {
      const prefix = nameParts[0]
      const suffix = nameParts.slice(1).join(" ")
      const patternRe = new RegExp(`${prefix}\\s+${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, "i")
      if (patternRe.test(norm)) return f
    }
  }

  const frenteNum = norm.match(/frente\s+(\w+)/)
  if (frenteNum) {
    const num = extractNumber(frenteNum[1]) ?? frenteNum[1]
    const match = frentes.find(f => {
      const fNorm = normalize(f.id)
      const fNameNorm = normalize(f.nombre)
      return fNorm.includes(String(num)) || fNameNorm.includes(String(num))
    })
    if (match) return match
  }

  const sectorMatch = norm.match(/sector\s+(\w+)/)
  if (sectorMatch) {
    const term = sectorMatch[1]
    const match = frentes.find(f => {
      const fNorm = normalize(f.id)
      const fNameNorm = normalize(f.nombre)
      return fNorm.includes(term) || fNameNorm.includes(term)
    })
    if (match) return match
  }

  return null
}

function extractNumber(str) {
  const norm = normalize(str)

  // Match decimal: "1.5", "1,5", "2.5"
  const decimalMatch = norm.match(/(\d+)[.,](\d+)/)
  if (decimalMatch) return parseFloat(`${decimalMatch[1]}.${decimalMatch[2]}`)

  // Match integer, optionally with "y media"
  const intMatch = norm.match(/(\d+)/)
  if (intMatch) {
    const num = parseInt(intMatch[1])
    if (norm.includes("media") || norm.includes("medio") || norm.includes("y media")) {
      return num + 0.5
    }
    return num
  }

  // Match word-based numbers: "una hora y media" → 1.5
  for (const [word, val] of Object.entries(NUMBER_WORDS)) {
    if (norm.includes(word)) {
      if ((word === "media" || word === "medio") && norm.match(/\b(una?|dos|tres|cuatro|cinco|seis|siete|ocho)\b/)) {
        const baseWord = norm.match(/\b(una?|dos|tres|cuatro|cinco|seis|siete|ocho)\b/)
        if (baseWord) return NUMBER_WORDS[baseWord[0]] + 0.5
      }
      return val
    }
  }

  return null
}

/**
 * Detect if hours are marked as "extras" (overtime) or "normales".
 * Returns "extra" or "normal".
 */
function detectHourType(segment) {
  const norm = normalize(segment)
  // Check for overtime keywords
  if (/\b(extras?|extra|sobretiempo|sobre\s*tiempo|overtime)\b/.test(norm)) {
    return "extra"
  }
  // "horas normales" is default, but explicit detection
  if (/\b(normales?|normal)\b/.test(norm)) {
    return "normal"
  }
  // Default is normal hours
  return "normal"
}

/**
 * Detect correction commands in voice text.
 */
export function detectCorrection(text, workers, actividades) {
  const norm = normalize(text)

  // ─── ACTION COMMANDS ───

  // "registrar" / "guardar" / "grabar" → commit current session
  if (/\b(registrar|guardar|grabar|listo|confirmar)\b/.test(norm) &&
      !/\b(corregir|cambiar|modificar|editar)\b/.test(norm)) {
    return { type: "commit_session" }
  }

  // "cambiar trabajador" / "siguiente trabajador" / "otro trabajador" → commit + new worker
  if (/\b(cambiar|siguiente|otro|nueva?)\s+(trabajador|obrero|persona|personal)\b/.test(norm) ||
      /\b(trabajador|obrero|persona|personal)\s+(siguiente|nuevo|nueva?)\b/.test(norm)) {
    return { type: "next_worker" }
  }

  // ─── DELETE COMMANDS ───
  if (/\b(borrar|eliminar|quitar)\s+(ultimo|ultima|el\s+ultimo|registro)\b/.test(norm) ||
      /\b(ultimo|ultima)\s+(borrar|eliminar|quitar)\b/.test(norm) ||
      /\b(cancelar|deshacer)\b/.test(norm)) {
    return { type: "delete_last" }
  }

  // ─── MODIFY COMMANDS ───
  if (/\b(modificar|editar|corregir|cambiar)\b/.test(norm)) {
    
    // Check if there is a target worker specified ("modificar John Elme")
    const workerMatch = workers ? findBestWorkerMatch(text, workers) : null;
    
    // Check if they are specifying hours ("a 3 horas", "5 horas")
    let newHours = null;
    let hourType = "normal";
    
    // Explicit "a X horas" or "por X horas"
    const explicitMatch = norm.match(/\b(?:a|por)\s*(\d+[.,]?\d*)\s*horas?\s*(extras?)?\b/);
    if (explicitMatch) {
      newHours = extractNumber(explicitMatch[1]);
      if (explicitMatch[2] && explicitMatch[2].includes("extra")) hourType = "extra";
    } else {
      // Just find any hours mentioned. Take the last one (e.g., "de 5 horas a 3 horas" -> 3)
      const allMatches = [...norm.matchAll(/\b(\d+[.,]?\d*)\s*horas?\s*(extras?)?\b/g)];
      if (allMatches.length > 0) {
        const lastMatch = allMatches[allMatches.length - 1];
        newHours = extractNumber(lastMatch[1]);
        if (lastMatch[2] && lastMatch[2].includes("extra")) hourType = "extra";
      }
    }

    // Check if they specify an Actividad ("modificar topografia")
    const act = actividades ? findBestActividad(text, actividades) : null;

    if (workerMatch && workerMatch.score > 0.4) {
      // Modifying a specific worker ("modificar John Elme a 3 horas")
      return { 
        type: "modify_worker_record", 
        workerId: workerMatch.worker.id,
        newHours: newHours,
        hourType: hourType,
        targetActividadId: act ? act.id : null
      }
    } else {
      // Modifying the CURRENT active session or just general "modificar registro"
      if (act && newHours !== null) {
        return { type: "modify_partida", actividadId: act.id, partidaId: act.partidaId, horas: newHours, hourType }
      }
      if (newHours !== null) {
        return { type: "modify_last_hours", horas: newHours, hourType }
      }
      if (act) {
        return { type: "modify_last_partida", actividadId: act.id, partidaId: act.partidaId }
      }
      if (/\bregistro\b/.test(norm)) {
        return { type: "modify_record", workerRef: null }
      }
    }
  }

  // "cambiar frente a frente 2"
  const corregirFrente = norm.match(
    /\b(corregir|cambiar|modificar)\s+(?:frente|sector)\s+a?\s+(frente|sector)\s+(\w+)\b/
  )
  if (corregirFrente) {
    return { type: "change_frente", frenteTerm: `${corregirFrente[2]} ${corregirFrente[3]}` }
  }

  return null
}

/**
 * Parse a voice command for continuous mode.
 * Now supports: normal hours, overtime hours, and decimal values.
 */
export function parseContinuousVoice(text, workers, actividades, frentes, currentWorker) {
  const cleanText = stripFillerWords(text)
  const norm = normalize(cleanText)

  // 1. Check if it's a correction command
  const correction = detectCorrection(cleanText, workers, actividades)
  if (correction) {
    return { type: "correction", correction, raw: text }
  }

  // 2. Try to detect a worker name (switch)
  const workerMatch = findBestWorkerMatch(cleanText, workers)

  // 3. Detect frente/sector
  const frente = findBestFrenteMatch(cleanText, frentes)

  // 4. Extract Actividades and hours from the speech
  const assignments = extractAssignmentsWithActivity(cleanText, actividades)

  const isWorkerSwitch = workerMatch !== null &&
    (!currentWorker || workerMatch.worker.id !== currentWorker.id)

  if (isWorkerSwitch && assignments.length === 0) {
    return {
      type: "error",
      error: "Para registrar, diga el Trabajador, las Horas y la Partida juntos.",
      raw: text
    }
  }

  const worker = workerMatch ? workerMatch.worker : currentWorker

  if (!worker && !correction) {
    if (assignments.length > 0 || frente) {
      return {
        type: "data",
        error: "No se identificó al trabajador. Diga el nombre primero.",
        raw: text
      }
    }
    return { type: "unrecognized", raw: text }
  }

  return {
    type: "data",
    worker,
    frente,
    assignments,
    raw: text,
    isWorkerSwitch,
    confidence: workerMatch ? workerMatch.score : 0,
  }
}

function extractAssignmentsWithActivity(text, actividades) {
  const assignments = []
  const norm = normalize(text)
  
  // Try pattern: "2 horas topografia" or "4 extras vigia"
  const patternsMatches = [...norm.matchAll(/(\d+[.,]?\d*)\s*horas?\s*(extras?)?\s+(?!horas?)([\w\s]+?)(?=\d+[.,]?\d*\s*horas?|$)/g)]
  
  if (patternsMatches.length > 0) {
    for (const m of patternsMatches) {
      const hours = extractNumber(m[1])
      const isExtra = !!m[2]
      const activityText = m[3]
      
      const act = findBestActividad(activityText, actividades)
      if (act) {
        const hourType = isExtra ? "extra" : "normal"
        const existing = assignments.find(a => a.actividadId === act.id)
        if (existing) {
          if (hourType === "extra") {
            existing.horasExtras = (existing.horasExtras || 0) + hours
          } else {
            existing.horasNormales = (existing.horasNormales || 0) + hours
          }
        } else {
          assignments.push({
            actividadId: act.id,
            partidaId: act.partidaId,
            horasNormales: hourType === "normal" ? hours : 0,
            horasExtras: hourType === "extra" ? hours : 0,
          })
        }
      }
    }
  } else {
    // Basic format: "topografia 5 horas"
    const words = norm.split(/\s+/)
    for (let i = 0; i < words.length; i++) {
      if (/\b(\d+[.,]?\d*)\b/.test(words[i])) {
        const hours = extractNumber(words[i])
        if (hours !== null) {
          // Look around for "extras"
          let hourType = "normal"
          if (words[i+1] === "horas" && words[i+2] && words[i+2].startsWith("extra")) hourType = "extra"
          if (words[i+1] && words[i+1].startsWith("extra")) hourType = "extra"
          
          // Reconstruct the rest without the number/horas combo
          const phrase = words.filter((_, idx) => idx !== i && words[idx] !== "horas" && !words[idx].startsWith("extra")).join(" ")
          
          const act = findBestActividad(phrase, actividades)
          if (act) {
            const existing = assignments.find(a => a.actividadId === act.id)
            if (existing) {
              if (hourType === "extra") {
                existing.horasExtras = (existing.horasExtras || 0) + hours
              } else {
                existing.horasNormales = (existing.horasNormales || 0) + hours
              }
            } else {
              assignments.push({
                actividadId: act.id,
                partidaId: act.partidaId,
                horasNormales: hourType === "normal" ? hours : 0,
                horasExtras: hourType === "extra" ? hours : 0,
              })
            }
            break
          }
        }
      }
    }

    // Fallback: split segment
    if (assignments.length === 0) {
      const segments = norm.split(/(?:,|\sy\s|actividad|partida|con)/)
      for (const seg of segments) {
        const hours = extractNumber(seg)
        if (hours !== null && hours > 0) {
          const hourType = detectHourType(seg)
          const act = findBestActividad(seg, actividades)
          
          if (act) {
            const existing = assignments.find(a => a.actividadId === act.id)
            if (existing) {
              if (hourType === "extra") {
                existing.horasExtras = (existing.horasExtras || 0) + hours
              } else {
                existing.horasNormales = (existing.horasNormales || 0) + hours
              }
            } else {
              assignments.push({
                actividadId: act.id,
                partidaId: act.partidaId,
                horasNormales: hourType === "normal" ? hours : 0,
                horasExtras: hourType === "extra" ? hours : 0,
              })
            }
          }
        }
      }
    }
  }

  return assignments
}

function findBestActividad(text, actividades) {
  let normText = normalize(text)
  
  // Remove reserved words that frequently cause false positive fuzzy matches
  normText = normText.replace(/\b(horas|hora|extras|extra|normales|normal|actividad|partida|con|y)\b/g, "").trim()
  
  if (!normText || !actividades || actividades.length === 0) return null

  const fuse = new Fuse(actividades, {
    keys: ["nombre", "id"],
    includeScore: true,
    threshold: 0.6, // Slightly more generous for activities
    ignoreLocation: true,
    minMatchCharLength: 3,
  })

  const results = fuse.search(normText)

  if (results.length > 0) {
    const best = results[0]
    let finalScore = 1 - best.score // 0 to 1, higher is better

    // REINFORCEMENT: Substring match check
    const actNameNorm = normalize(best.item.nombre)
    if (actNameNorm.includes(normText) || normText.includes(actNameNorm)) {
      finalScore = 1.0
    }

    // Word count overlap check
    const transcriptWords = normText.split(/\s+/).filter(w => w.length > 3)
    const actWords = actNameNorm.split(/\s+/)
    const commonWords = transcriptWords.filter(tw => actWords.includes(tw))
    
    if (commonWords.length > 0) {
      finalScore = Math.max(finalScore, 0.7 + (commonWords.length * 0.1))
    }

    if (finalScore >= 0.5) {
       return best.item
    }
  }

  return null
}

// Keep the old API for backward compatibility
export function parseVoiceCommand(text, workers, actividades = []) {
  const workerMatch = findBestWorkerMatch(text, workers)
  if (!workerMatch) return { error: "No se identificó al trabajador", raw: text }

  const assignments = extractAssignmentsWithActivity(text, actividades)

  return {
    worker: workerMatch.worker,
    assignments,
    raw: text,
    confidence: workerMatch.score,
  }
}
