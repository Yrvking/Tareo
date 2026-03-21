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
  "eh", "este", "este", "mmm", "am", "a ver", "bueno", "entonces",
  "pues", "aver", "haber", "ahi", "ya", "aja", "ok", "okay",
  "digamos", "osea", "o sea"
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
  let best = null
  let bestScore = 0

  for (const w of workers) {
    const wNorm = normalize(w.nombre)
    const parts = wNorm.split(/\s+/)

    if (norm.includes(wNorm)) return { worker: w, score: 100 }

    let score = 0
    for (const p of parts) {
      if (p.length > 2 && norm.includes(p)) score += 40
    }

    if (parts.length >= 2) {
      const firstName = parts[0]
      const lastName = parts[parts.length - 1]
      if (norm.includes(firstName) && norm.includes(lastName)) score += 30
    }

    if (score > bestScore) {
      bestScore = score
      best = w
    }
  }

  // Lower threshold (35 instead of 40) for better noise tolerance
  return bestScore >= 35 ? { worker: best, score: bestScore } : null
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
export function detectCorrection(text, workers, partidas) {
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
  
  if (!normText) return null
  
  const tokens = normText.split(/\s+/)
  
  // Fuzzy token match using Levenshtein distance
  let bestScore = 0
  let bestActividad = null
  
  for (const a of actividades) {
    const aTokens = normalize(a.nombre).split(/\s+/)
    let score = 0
    for (const t of tokens) {
      if (t === normalize(a.id)) {
        score += 50
        continue
      }
      
      let maxLen = 0
      for (const pt of aTokens) {
        if (t.length < 3 || pt.length < 3) continue
        
        const dist = levenshteinDistance(t, pt)
        // Allow 1 typo for 4-letter words, 2 typos for 5+ letter words
        const maxDist = t.length > 4 ? 2 : (t.length === 4 ? 1 : 0)
        
        if (dist <= maxDist) {
          maxLen = Math.max(maxLen, t.length)
        }
      }
      score += maxLen
    }
    
    // Add exact substring bonus so "vigia fachada" matches better than "vigia" if they said "vigia fachada"
    if (normalize(a.nombre).includes(normText) || normText.includes(normalize(a.nombre))) {
      score += Math.min(normText.length, normalize(a.nombre).length)
    }

    if (score > bestScore) {
      bestScore = score
      bestActividad = a
    }
  }
  
  // A match exists if score is at least 3
  return bestScore >= 3 ? bestActividad : null
}

function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

// Keep the old API for backward compatibility
export function parseVoiceCommand(text, workers, partidas) {
  const workerMatch = findBestWorkerMatch(text, workers)
  if (!workerMatch) return { error: "No se identificó al trabajador", raw: text }

  const norm = normalize(text)
  const assignments = extractAssignments(norm, partidas)

  return {
    worker: workerMatch.worker,
    assignments,
    raw: text,
    confidence: workerMatch.score,
  }
}
