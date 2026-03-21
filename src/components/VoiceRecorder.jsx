import { useState, useRef, useCallback, useEffect } from "react"
import { MicIcon, CheckIcon, TrashIcon } from "./Icons"
import { parseContinuousVoice, detectCorrection } from "../utils/voiceParser"
import { insertRegistro } from "../utils/supabaseClient"

export default function VoiceRecorder({ workers, partidas, actividades, frentes, registros, setRegistros, getPartidaNombre, getFrenteNombre, fechaTareo }) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [speechSupported, setSpeechSupported] = useState(true)
  const [feedbackMessage, setFeedbackMessage] = useState(null)

  // Continuous session state
  const [currentWorker, setCurrentWorker] = useState(null)
  const [currentFrente, setCurrentFrente] = useState(null)
  const [sessionAssignments, setSessionAssignments] = useState([])
  const [sessionTime, setSessionTime] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  const recognitionRef = useRef(null)
  const shouldRestartRef = useRef(false)
  const timerRef = useRef(null)
  const sessionStartRef = useRef(null)

  // Timer for session duration
  useEffect(() => {
    if (isListening && !isPaused) {
      sessionStartRef.current = sessionStartRef.current || Date.now()
      timerRef.current = setInterval(() => {
        setSessionTime(Math.floor((Date.now() - sessionStartRef.current) / 1000))
      }, 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isListening, isPaused])

  const formatTime = (s) => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const commitCurrentWorker = useCallback(async () => {
    if (!currentWorker || sessionAssignments.length === 0) return

    const newReg = {
      id: Date.now(),
      workerId: currentWorker.id,
      workerNombre: currentWorker.nombre,
      frenteId: currentFrente?.id || null,
      frenteNombre: currentFrente?.nombre || null,
      assignments: [...sessionAssignments],
      date: fechaTareo,
      timestamp: new Date().toLocaleTimeString("es-PE"),
      raw: "Registro por voz continuo",
    }
    
    try {
      const dbId = await insertRegistro(newReg)
      if (dbId) newReg.id = dbId
      
      setRegistros(prev => [...prev, newReg])
      setSessionAssignments([])
    } catch (e) {
      setFeedbackMessage({ type: "error", message: "Error guardando en la Nube", timeout: 5000 })
    }
  }, [currentWorker, currentFrente, sessionAssignments, setRegistros, fechaTareo])

  const handleCorrection = useCallback((correction) => {
    switch (correction.type) {
      case "commit_session": {
        // Voice "registrar" → same as clicking the Registrar button
        if (currentWorker && sessionAssignments.length > 0) {
          commitCurrentWorker()
          setFeedbackMessage({
            type: "success",
            message: `✓ Registrado: ${currentWorker.nombre}`,
            timeout: 3000
          })
        } else {
          setFeedbackMessage({
            type: "error",
            message: "Faltan datos obligatorios. Requerido: 1) Trabajador, 2) Partida, 3) Horas.",
            timeout: 5000
          })
        }
        break
      }
      case "next_worker": {
        // Voice "cambiar trabajador" → commit current + reset for next
        if (currentWorker && sessionAssignments.length > 0) {
          commitCurrentWorker()
          setFeedbackMessage({
            type: "success",
            message: `✓ ${currentWorker.nombre} registrado. Diga el nombre del siguiente trabajador.`,
            timeout: 4000
          })
          setCurrentWorker(null)
          setSessionAssignments([])
        } else {
          setFeedbackMessage({
            type: "error",
            message: "Faltan datos para guardar. Requerido: 1) Trabajador, 2) Partida, 3) Horas.",
            timeout: 5000
          })
        }
        break
      }
      case "modify_record": {
        // Voice "modificar registro (de Juan)" → load an existing record into session
        const workerRef = correction.workerRef
        let targetReg = null

        if (workerRef) {
          // Find the record by worker name match
          const normRef = workerRef.toLowerCase()
          targetReg = registros.findLast(r =>
            r.workerNombre.toLowerCase().includes(normRef)
          )
        }

        if (!targetReg) {
          // Fall back to last record
          targetReg = registros.length > 0 ? registros[registros.length - 1] : null
        }

        if (targetReg) {
          // Load the record into the current session for editing
          const worker = workers.find(w => String(w.id) === String(targetReg.workerId))
          if (worker) {
            setCurrentWorker(worker)
            setSessionAssignments([...targetReg.assignments])
            if (targetReg.frenteId) {
              const fr = frentes.find(f => f.id === targetReg.frenteId)
              if (fr) setCurrentFrente(fr)
            }
            // Remove the old record (it will be re-committed when done)
            setRegistros(prev => prev.filter(r => r.id !== targetReg.id))
            setFeedbackMessage({
              type: "success",
              message: `✎ Editando registro de ${worker.nombre}. Modifique y diga \"registrar\" para guardar.`,
              timeout: 5000
            })
          }
        } else {
          setFeedbackMessage({
            type: "info",
            message: "No se encontró registro para modificar.",
            timeout: 3000
          })
        }
        break
      }
      case "modify_worker_record": {
        const targetReg = registros.findLast(r => String(r.workerId) === String(correction.workerId))
        
        if (targetReg) {
          const worker = workers.find(w => String(w.id) === String(targetReg.workerId))
          if (worker) {
            setCurrentWorker(worker)
            let updatedAssignments = JSON.parse(JSON.stringify(targetReg.assignments))
            
            if (correction.newHours !== null) {
              if (correction.targetActividadId) {
                const idx = updatedAssignments.findIndex(a => String(a.actividadId) === String(correction.targetActividadId))
                if (idx >= 0) {
                  const field = correction.hourType === "extra" ? "horasExtras" : "horasNormales"
                  updatedAssignments[idx][field] = correction.newHours
                }
              } else if (updatedAssignments.length > 0) {
                const idx = updatedAssignments.length - 1
                const field = correction.hourType === "extra" ? "horasExtras" : "horasNormales"
                updatedAssignments[idx][field] = correction.newHours
              }
            }
            
            setSessionAssignments(updatedAssignments)
            if (targetReg.frenteId) {
              const fr = frentes.find(f => String(f.id) === String(targetReg.frenteId))
              if (fr) setCurrentFrente(fr)
            }
            
            setRegistros(prev => prev.filter(r => r.id !== targetReg.id))
            
            let msg = `✎ Editando registro de ${worker.nombre}.`
            if (correction.newHours !== null) {
              msg += ` Horas actualizadas a ${correction.newHours}.`
            } else {
              msg += ` Diga "registrar" al terminar.`
            }
            
            setFeedbackMessage({
              type: "success",
              message: msg,
              timeout: 5000
            })
          }
        } else {
          setFeedbackMessage({
            type: "info",
            message: "No se encontró registro previo para este trabajador.",
            timeout: 3000
          })
        }
        break
      }
      case "delete_last": {
        if (registros.length > 0) {
          const last = registros[registros.length - 1]
          setRegistros(prev => prev.slice(0, -1))
          setFeedbackMessage({
            type: "success",
            message: `Eliminado registro de ${last.workerNombre}`,
            timeout: 3000
          })
        } else if (sessionAssignments.length > 0) {
          setSessionAssignments(prev => prev.slice(0, -1))
          setFeedbackMessage({
            type: "success",
            message: "Eliminada última asignación",
            timeout: 3000
          })
        }
        break
      }
      case "modify_partida": {
        setSessionAssignments(prev => {
          const idx = prev.findIndex(a => a.actividadId === correction.actividadId)
          if (idx >= 0) {
            const updated = [...prev]
            const field = correction.hourType === "extra" ? "horasExtras" : "horasNormales"
            updated[idx] = { ...updated[idx], [field]: correction.horas }
            return updated
          }
          return prev
        })
        const label = correction.hourType === "extra" ? "hE" : "h"
        const targetAct = actividades?.find(act => act.id === correction.actividadId)
        setFeedbackMessage({
          type: "success",
          message: `${targetAct ? targetAct.nombre : correction.actividadId} → ${correction.horas}${label}`,
          timeout: 3000
        })
        break
      }
      case "modify_last_partida": {
        setSessionAssignments(prev => {
          if (prev.length === 0) return prev
          const updated = [...prev]
          const last = updated[updated.length - 1]
          updated[updated.length - 1] = { ...last, actividadId: correction.actividadId, partidaId: correction.partidaId }
          return updated
        })
        const targetAct = actividades?.find(act => act.id === correction.actividadId)
        setFeedbackMessage({
          type: "success",
          message: `Última actividad cambiada a ${targetAct ? targetAct.nombre : correction.actividadId}`,
          timeout: 3000
        })
        break
      }
      case "modify_last_hours": {
        setSessionAssignments(prev => {
          if (prev.length === 0) return prev
          const updated = [...prev]
          const last = updated[updated.length - 1]
          const field = correction.hourType === "extra" ? "horasExtras" : "horasNormales"
          updated[updated.length - 1] = { ...last, [field]: correction.horas }
          return updated
        })
        const label = correction.hourType === "extra" ? " extras" : ""
        setFeedbackMessage({
          type: "success",
          message: `Horas${label} corregidas a ${correction.horas}h`,
          timeout: 3000
        })
        break
      }
      case "change_frente": {
        const frente = frentes.find(f => {
          const norm = correction.frenteTerm.toLowerCase()
          return f.nombre.toLowerCase().includes(norm) || f.id.toLowerCase().includes(norm)
        })
        if (frente) {
          setCurrentFrente(frente)
          setFeedbackMessage({
            type: "success",
            message: `Frente cambiado a ${frente.nombre}`,
            timeout: 3000
          })
        }
        break
      }
      case "undo_last": {
        if (sessionAssignments.length > 0) {
          setSessionAssignments(prev => prev.slice(0, -1))
          setFeedbackMessage({
            type: "success",
            message: "Última asignación deshecha",
            timeout: 3000
          })
        }
        break
      }
      default:
        break
    }
  }, [registros, workers, frentes, sessionAssignments, currentWorker, commitCurrentWorker, setRegistros, actividades])

  const handleFinalTranscript = useCallback((text) => {
    const result = parseContinuousVoice(text, workers, actividades, frentes, currentWorker)

    if (result.type === "correction") {
      handleCorrection(result.correction)
      return
    }

    if (result.type === "unrecognized") {
      setFeedbackMessage({ type: "info", message: `No reconocido: "${text}"`, timeout: 3000 })
      return
    }

    if (result.error) {
      setFeedbackMessage({ type: "error", message: result.error })
      return
    }

    if (result.type === "data") {
      // Worker switch: save current worker's data first
      if (result.isWorkerSwitch && currentWorker && sessionAssignments.length > 0) {
        commitCurrentWorker()
      }

      if (result.isWorkerSwitch || !currentWorker) {
        setCurrentWorker(result.worker)
        setFeedbackMessage({
          type: "success",
          message: `Trabajador: ${result.worker.nombre}`,
          timeout: 3000
        })
      }

      if (result.frente) {
        setCurrentFrente(result.frente)
        setFeedbackMessage(prev => ({
          type: "success",
          message: `${prev?.message || ""} | Frente: ${result.frente.nombre}`,
          timeout: 3000
        }))
      }

      if (result.assignments.length > 0) {
        const pastNormal = registros
          .filter(r => String(r.workerId) === String(result.worker.id))
          .reduce((sum, r) => sum + r.assignments.reduce((s, a) => s + (a.horasNormales || 0), 0), 0)

        setSessionAssignments(prev => {
          let newAssignments = [...prev]
          const currentNormal = prev.reduce((sum, a) => sum + (a.horasNormales || 0), 0)
          let previousHoursToday = pastNormal + currentNormal
          
          let overflowHappened = false

          for (const a of result.assignments) {
            let addNormal = a.horasNormales || 0
            let addExtra = a.horasExtras || 0
            
            const existingIdx = newAssignments.findIndex(x => x.partidaId === a.partidaId)
            if (existingIdx >= 0) {
              newAssignments[existingIdx] = {
                ...newAssignments[existingIdx],
                horasNormales: (newAssignments[existingIdx].horasNormales || 0) + addNormal,
                horasExtras: (newAssignments[existingIdx].horasExtras || 0) + addExtra,
              }
            } else {
              newAssignments.push({
                ...a,
                horasNormales: addNormal,
                horasExtras: addExtra
              })
            }
          }

          // Schedule feedback message update after state settles
          setTimeout(() => {
            const formatAssign = (a) => {
              const parts = []
              if (a.horasNormales > 0) parts.push(`${a.horasNormales}h`)
              if (a.horasExtras > 0) parts.push(`${a.horasExtras}hE`)
              const actName = actividades?.find(act => act.id === a.actividadId)?.nombre || a.actividadId
              return `${parts.join("+")} → ${actName}`
            }
            
            // Show only the newly parsed assignments or the entire session?
            // The user wants to see their session context. 
            const assignText = newAssignments.map(formatAssign).join(", ")
            
            if (overflowHappened) {
              setFeedbackMessage({
                type: "info",
                message: `Límite 8.5h superado. Exceso convertido a Horas Extras: [${assignText}]`,
                timeout: 6000
              })
            } else {
              setFeedbackMessage({
                type: "success",
                message: `✓ ${assignText}`,
                timeout: 4000
              })
            }
          }, 0)

          return newAssignments
        })
      }
    }
  }, [workers, actividades, frentes, currentWorker, sessionAssignments, handleCorrection, commitCurrentWorker]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFinalTranscriptRef = useRef(null)

  useEffect(() => {
    handleFinalTranscriptRef.current = handleFinalTranscript
  }, [handleFinalTranscript])

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setSpeechSupported(false)
      return
    }
    const recognition = new SR()
    recognition.lang = "es-PE"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 3

    recognition.onresult = (event) => {
      let interim = ""
      let finalText = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += t
        else interim += t
      }
      setTranscript(finalText || interim)
      if (finalText && handleFinalTranscriptRef.current) {
        handleFinalTranscriptRef.current(finalText)
      }
    }

    recognition.onerror = (e) => {
      if (e.error === "no-speech") {
        // In continuous mode, just ignore no-speech errors
        return
      }
      if (e.error === "aborted") return
      setFeedbackMessage({ type: "error", message: `Error: ${e.error}` })
    }

    recognition.onend = () => {
      // Auto-restart if we should keep listening
      if (shouldRestartRef.current) {
        try {
          setTimeout(() => {
            if (shouldRestartRef.current) {
              recognition.start()
            }
          }, 300)
        } catch (err) {
          // Ignore restart errors
        }
      } else {
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition
    
    // Cleanup on unmount
    return () => {
      shouldRestartRef.current = false
      if (recognitionRef.current) {
        recognitionRef.current.onend = null
        recognitionRef.current.onerror = null
        recognitionRef.current.onresult = null
        try {
          recognitionRef.current.stop()
        } catch (e) { /* ignore */ }
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return
    shouldRestartRef.current = true
    setTranscript("")
    setFeedbackMessage(null)
    setCurrentWorker(null)
    setCurrentFrente(null)
    setSessionAssignments([])
    setSessionTime(0)
    sessionStartRef.current = null
    setIsPaused(false)
    try {
      recognitionRef.current.start()
      setIsListening(true)
    } catch (err) {
      // May already be started
    }
  }, [])

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    // Commit any pending worker data
    if (currentWorker && sessionAssignments.length > 0) {
      commitCurrentWorker()
    }
    setIsListening(false)
    setIsPaused(false)
    setCurrentWorker(null)
    setCurrentFrente(null)
    setSessionAssignments([])
    setSessionTime(0)
    sessionStartRef.current = null
  }, [currentWorker, sessionAssignments, commitCurrentWorker])

  const togglePause = useCallback(() => {
    if (isPaused) {
      // Resume
      shouldRestartRef.current = true
      try {
        recognitionRef.current.start()
      } catch (err) { /* ignore */ }
      setIsPaused(false)
    } else {
      // Pause
      shouldRestartRef.current = false
      recognitionRef.current.stop()
      setIsPaused(true)
    }
  }, [isPaused])

  const manualCommit = useCallback(() => {
    if (currentWorker && sessionAssignments.length > 0) {
      commitCurrentWorker()
      setFeedbackMessage({
        type: "success",
        message: `Registrado: ${currentWorker.nombre}`,
        timeout: 3000
      })
    }
  }, [currentWorker, sessionAssignments, commitCurrentWorker])

  const deleteRegistro = (id) => setRegistros((prev) => prev.filter((r) => r.id !== id))

  // Auto-clear feedback messages
  useEffect(() => {
    if (feedbackMessage?.timeout) {
      const timer = setTimeout(() => setFeedbackMessage(null), feedbackMessage.timeout)
      return () => clearTimeout(timer)
    }
  }, [feedbackMessage])

  return (
    <div>
      {/* Voice Control Card */}
      <div className="card" style={{ marginBottom: 20, textAlign: "center" }}>
        <p className="label" style={{ marginBottom: 8 }}>
          Diga el nombre del trabajador, luego las partidas y horas. Diga otro nombre para cambiar.
        </p>

        {!speechSupported && (
          <div className="alert-error" style={{ marginBottom: 16 }}>
            Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge en escritorio.
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={!speechSupported}
            className={`mic-button ${isListening ? "mic-active" : ""}`}
            style={{ cursor: speechSupported ? "pointer" : "not-allowed" }}
          >
            <MicIcon active={isListening} />
          </button>

          {isListening && (
            <button
              onClick={togglePause}
              className="btn-pause"
              title={isPaused ? "Continuar" : "Pausar"}
            >
              {isPaused ? "▶" : "⏸"}
            </button>
          )}
        </div>

        <p className="mono" style={{
          marginTop: 12,
          fontSize: 13,
          color: isListening ? (isPaused ? "#d4a55a" : "#e74c3c") : "#5a7a8a",
          fontWeight: 500,
        }}>
          {isListening
            ? isPaused
              ? `⏸ Pausado (${formatTime(sessionTime)})`
              : `● Escuchando... (${formatTime(sessionTime)})`
            : "Presiona para iniciar sesión de tareo"
          }
        </p>

        {transcript && (
          <div className="transcript-box">
            <span className="label">TRANSCRIPCIÓN:</span>
            <br />
            {transcript}
          </div>
        )}
      </div>

      {/* Active Session Panel */}
      {isListening && currentWorker && (
        <div className="session-panel" style={{ marginBottom: 16 }}>
          <div className="session-header">
            <div>
              <span className="label" style={{ color: "#d4a55a" }}>TRABAJADOR ACTIVO</span>
              <div className="session-worker-name">{currentWorker.nombre}</div>
            </div>
            {currentFrente && (
              <div className="session-frente-badge">
                <span className="label" style={{ fontSize: 10 }}>FRENTE</span>
                <span>{currentFrente.nombre}</span>
              </div>
            )}
          </div>

          {sessionAssignments.length > 0 && (
            <>
              <div style={{ marginTop: 12 }}>
                <span className="label" style={{ fontSize: 10 }}>ASIGNACIONES:</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                  {sessionAssignments.map((a, i) => (
                    <span key={i} className="assignment-badge">
                      {a.horasNormales > 0 && (
                        <span style={{ color: "#d4a55a" }}>{a.horasNormales}h</span>
                      )}
                      {a.horasNormales > 0 && a.horasExtras > 0 && (
                        <span style={{ color: "#5a7a8a" }}> + </span>
                      )}
                      {a.horasExtras > 0 && (
                        <span style={{ color: "#e88" }}>{a.horasExtras}hE</span>
                      )}
                      <span style={{ color: "#5a7a8a" }}> → </span>
                      <span style={{ color: "#8ab4c8" }} title={getPartidaNombre(a.partidaId)}>
                        {actividades?.find(act => act.id === a.actividadId)?.nombre || a.actividadId}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={manualCommit} className="btn-confirm" style={{ fontSize: 12 }}>
                  <CheckIcon /> Registrar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Feedback Messages */}
      {feedbackMessage?.type === "error" && (
        <div className="alert-error" style={{ marginBottom: 16 }}>
          ⚠ {feedbackMessage.message}
        </div>
      )}
      {feedbackMessage?.type === "success" && (
        <div className="alert-success" style={{ marginBottom: 16 }}>
          {feedbackMessage.message}
        </div>
      )}
      {feedbackMessage?.type === "info" && (
        <div className="alert-info" style={{ marginBottom: 16 }}>
          ℹ {feedbackMessage.message}
        </div>
      )}

      {/* Voice Command Guide */}
      {!isListening && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="label" style={{ marginBottom: 12 }}>COMANDOS DE VOZ</div>
          <div style={{ fontSize: 13, color: "#8899aa", lineHeight: 1.8 }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: "#d4a55a" }}>Registrar:</span><br />
              • "Juan Pérez" → activa trabajador<br />
              • "4 horas partida 101, 3 horas partida 201"<br />
              • "2 horas extras partida 101" → horas extras<br />
              • "1.5 horas" o "una hora y media" → decimales<br />
              • "Frente 1" o "Sector A" → asigna frente<br />
              • <strong style={{ color: "#2ecc71" }}>"Registrar"</strong> → guarda el registro actual
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: "#d4a55a" }}>Cambiar trabajador:</span><br />
              • Diga otro nombre → registra al anterior y cambia<br />
              • <strong style={{ color: "#2ecc71" }}>"Cambiar trabajador"</strong> → guarda y espera nuevo nombre
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: "#d4a55a" }}>Modificar:</span><br />
              • <strong style={{ color: "#2ecc71" }}>"Modificar registro"</strong> → edita el último registro<br />
              • <strong style={{ color: "#2ecc71" }}>"Modificar registro de Juan"</strong> → edita el de Juan<br />
              • "Corregir partida 101 a 5 horas"<br />
              • "Corregir partida 101 a 2 horas extras"
            </div>
            <div>
              <span style={{ color: "#d4a55a" }}>Otros:</span><br />
              • "Borrar último" / "Cancelar"<br />
              • "Cambiar frente a Frente 2"
            </div>
          </div>
        </div>
      )}

      {/* Registros del día */}
      <div style={{ marginTop: 20 }}>
        <div className="label" style={{ marginBottom: 10 }}>
          REGISTROS DEL DÍA ({registros.length})
        </div>
        {registros.length === 0 ? (
          <div className="empty-state">
            Sin registros aún. Usa el micrófono o el ingreso manual.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {registros.map((reg) => (
              <div key={reg.id} className="registro-row">
                <span className="mono" style={{ fontSize: 11, color: "#3a5a6a", minWidth: 60 }}>
                  {reg.timestamp}
                </span>
                <span style={{ fontWeight: 600, color: "#e8dcc8", minWidth: 140, fontSize: 14 }}>
                  {reg.workerNombre}
                </span>
                {reg.frenteNombre && (
                  <span className="frente-badge-sm">
                    {reg.frenteNombre}
                  </span>
                )}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
                  {reg.assignments.map((a, i) => (
                    <span key={i} className="hora-badge">
                      {a.horasNormales > 0 && (
                        <span style={{ color: "#d4a55a" }}>{a.horasNormales}h</span>
                      )}
                      {a.horasNormales > 0 && a.horasExtras > 0 && (
                        <span style={{ color: "#3a5a6a" }}>+</span>
                      )}
                      {a.horasExtras > 0 && (
                        <span style={{ color: "#e88" }}>{a.horasExtras}hE</span>
                      )}
                      <span style={{ color: "#3a5a6a" }}>/</span>
                      <span style={{ color: "#6a9ab4" }} title={getPartidaNombre(a.partidaId)}>
                        {actividades?.find(act => act.id === a.actividadId)?.nombre || a.actividadId}
                      </span>
                    </span>
                  ))}
                </div>
                <button onClick={() => deleteRegistro(reg.id)} className="btn-icon-danger">
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
