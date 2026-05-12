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

