  // Strategy 3: Direct Levenshtein fallback for short tokens against all worker name words
  // This catches cases like "john" vs "jhon" where fuzzy search might fail
  if (bestScore < 50) {
    for (const token of tokens) {
      if (token.length <= 6) { // Only for short words (names)
        for (const worker of workers) {
          const workerNameWords = normalize(worker.nombre).split(/\s+/)
          for (const nameWord of workerNameWords) {
            const distance = levenshtein(token, nameWord)
            // Exact match or 1-char difference for short words
            if (distance === 0) {
              const s = 100
              if (s > bestScore) { bestScore = s; bestWorker = worker }
            } else if (distance === 1 && Math.abs(token.length - nameWord.length) <= 1) {
              const s = 75 // Slightly higher than fuzzy-based near-match
              if (s > bestScore) { bestScore = s; bestWorker = worker }
            }
          }
        }
      }
    }
  }

  return bestScore >= 40 ? { worker: bestWorker, score: bestScore } : null
