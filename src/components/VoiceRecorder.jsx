import { useState, useRef, useCallback, useEffect } from "react"
import { MicIcon, CheckIcon, TrashIcon } from "./Icons"
import { parseContinuousVoice } from "../utils/voiceParser"
import { insertRegistro, updateRegistro, deleteRegistroById, fetchRegistros } from "../utils/supabaseClient"
import { getWeekRange } from "../utils/dateUtils"
import { useAuth } from "../contexts/AuthContext"
import { canDeleteTareos, normalizeRole } from "../utils/accessControl"

export default function VoiceRecorder({ workers, partidas, actividades, frentes, registros, setRegistros, getPartidaNombre, getFrenteNombre, fechaTareo, projectConfig }) {
  const { profile } = useAuth()
  const currentRole = normalizeRole(profile?.role)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [speechSupported, setSpeechSupported] = useState(true)
  const [feedbackMessage, setFeedbackMessage] = useState(null)

  // Continuous session state
  const [currentWorker, setCurrentWorker] = useState(null)
  const [currentFrente, setCurrentFrente] = useState(null)
  const [sessionAssignments, setSessionAssignments] = useState([])
  const [editingRegistroId, setEditingRegistroId] = useState(null)
  const [selectedRegistroIds, setSelectedRegistroIds] = useState([])
  const [sessionTime, setSessionTime] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  const recognitionRef = useRef(null)
  const shouldRestartRef = useRef(false)
  const timerRef = useRef(null)
  const sessionStartRef = useRef(null)
  const closedTareoDates = Array.isArray(projectConfig?.closedTareoDates) ? projectConfig.closedTareoDates : []
  const isPrivilegedUser = canDeleteTareos(currentRole)
  const isSelectedDateClosed = Boolean(fechaTareo && closedTareoDates.includes(fechaTareo))

  const canDeleteRegistro = useCallback((reg) => {
    if (!reg?.date) return true
    return isPrivilegedUser
  }, [isPrivilegedUser])

  const getDeleteBlockMessage = useCallback((reg) => {
    if (canDeleteRegistro(reg)) return ""
    if (!isPrivilegedUser) {
      return "Tu rol no puede eliminar tareos. Solicita a un admin o super admin."
    }
    return `La fecha ${reg.date} está cerrada. Solo admin o super admin puede eliminar este tareo.`
  }, [canDeleteRegistro, isPrivilegedUser])

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
      id: editingRegistroId || Date.now(),
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
      if (editingRegistroId) {
        const result = await updateRegistro(newReg, { source: "voice_edit" })
        const savedReg = result?.record ? { ...newReg, ...result.record } : { ...newReg }
        if (result?.id) savedReg.id = result.id
        if (result?.syncStatus) savedReg.syncStatus = result.syncStatus
        setRegistros(prev => [...prev, savedReg])
      } else {
        const result = await insertRegistro(newReg)
        const savedReg = result?.record ? { ...newReg, ...result.record } : { ...newReg }
        if (result?.id) savedReg.id = result.id
        if (result?.syncStatus) savedReg.syncStatus = result.syncStatus
        setRegistros(prev => [...prev, savedReg])
      }

      setSessionAssignments([])
      setEditingRegistroId(null)
    } catch (e) {
      setFeedbackMessage({ type: "error", message: e.message || "No se pudo guardar el registro.", timeout: 5000 })
    }
  }, [currentWorker, currentFrente, sessionAssignments, setRegistros, fechaTareo, editingRegistroId])

  const startEditingRegistro = useCallback((targetReg) => {
    if (!targetReg) return

    const worker = workers.find(w => String(w.id) === String(targetReg.workerId))
    if (!worker) {
      setFeedbackMessage({ type: "error", message: "No se encontró trabajador para este registro.", timeout: 4000 })
      return
    }

    setCurrentWorker(worker)
    setSessionAssignments(JSON.parse(JSON.stringify(targetReg.assignments || [])))
    setEditingRegistroId(targetReg.id)

    if (targetReg.frenteId) {
      const fr = frentes.find(f => String(f.id) === String(targetReg.frenteId))
      setCurrentFrente(fr || null)
    } else {
      setCurrentFrente(null)
    }

    setRegistros(prev => prev.filter(r => r.id !== targetReg.id))
    setFeedbackMessage({
      type: "success",
      message: `✎ Editando ${worker.nombre}. Corrija y pulse Registrar.`,
      timeout: 5000
    })
  }, [workers, frentes, setRegistros])

  const handleAssignmentChange = (idx, field, value) => {
    setSessionAssignments(prev => {
      const updated = [...prev]
      const current = { ...(updated[idx] || {}) }

      if (field === "actividadId") {
        const act = actividades?.find(a => String(a.id) === String(value))
        current.actividadId = value
        current.partidaId = act?.partidaId || current.partidaId || null
      } else {
        current[field] = parseFloat(value) || 0
      }

      updated[idx] = current
      return updated
    })
  }

  const removeSessionAssignment = (idx) => {
    setSessionAssignments(prev => prev.filter((_, i) => i !== idx))
  }

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
          startEditingRegistro(targetReg)
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
            
            startEditingRegistro({ ...targetReg, assignments: updatedAssignments })
            
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
          if (!canDeleteRegistro(last)) {
            setFeedbackMessage({
              type: "error",
              message: getDeleteBlockMessage(last),
              timeout: 5000
            })
            break
          }
          deleteRegistroById(last.id, { beforeData: last, source: "voice_delete_last" })
            .then(() => {
              setRegistros(prev => prev.slice(0, -1))
              setFeedbackMessage({
                type: "success",
                message: `Eliminado registro de ${last.workerNombre}`,
                timeout: 3000
              })
            })
            .catch(() => {
              setFeedbackMessage({
                type: "error",
                message: "No se pudo eliminar el registro.",
                timeout: 4000
              })
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
  }, [registros, workers, frentes, sessionAssignments, currentWorker, commitCurrentWorker, setRegistros, actividades, startEditingRegistro, canDeleteRegistro, getDeleteBlockMessage])

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
        setSessionAssignments(prev => {
          let newAssignments = [...prev]

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
            
            setFeedbackMessage({
              type: "success",
              message: `✓ ${assignText}`,
              timeout: 4000
            })
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
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setFeedbackMessage({
          type: "error",
          message: "El micrófono fue bloqueado. Permite el audio para esta app en Android.",
          timeout: 5000
        })
        return
      }
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

  const requestMicrophoneAccess = useCallback(async () => {
    if (!navigator?.mediaDevices?.getUserMedia) return true
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((track) => track.stop())
    return true
  }, [])

  const startListening = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setFeedbackMessage({
        type: "error",
        message: "No hay conexión de red. El sistema de voz solo funciona con internet.",
        timeout: 5000
      })
      return
    }
    if (!recognitionRef.current) return
    try {
      await requestMicrophoneAccess()
    } catch (error) {
      setFeedbackMessage({
        type: "error",
        message: "No se concedió acceso al micrófono. Habilítalo en los permisos de la app.",
        timeout: 5000
      })
      return
    }
    shouldRestartRef.current = true
    setTranscript("")
    setFeedbackMessage(null)
    setCurrentWorker(null)
    setCurrentFrente(null)
    setSessionAssignments([])
    setEditingRegistroId(null)
    setSessionTime(0)
    sessionStartRef.current = null
    setIsPaused(false)
    try {
      recognitionRef.current.start()
      setIsListening(true)
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        message: "No se pudo iniciar el micrófono. Revisa los permisos de audio de la app.",
        timeout: 5000
      })
    }
  }, [requestMicrophoneAccess])

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
    setEditingRegistroId(null)
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

  const toggleRegistroSelection = (id) => {
    setSelectedRegistroIds(prev => (
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    ))
  }

  const clearRegistroSelection = () => {
    setSelectedRegistroIds([])
  }

  const deleteRegistro = async (reg) => {
    if (!canDeleteRegistro(reg)) {
      setFeedbackMessage({ type: "error", message: getDeleteBlockMessage(reg), timeout: 5000 })
      return
    }

    const confirmed = window.confirm(`¿Seguro que deseas eliminar el registro de ${reg.workerNombre}?`)
    if (!confirmed) return

    try {
      await deleteRegistroById(reg.id, { beforeData: reg, source: "voice_list_delete" })
      const { dates } = getWeekRange(fechaTareo)
      const fresh = await fetchRegistros(dates[0], dates[dates.length - 1])
      setRegistros(fresh)
      setSelectedRegistroIds([])
      setFeedbackMessage({ type: "success", message: `Registro eliminado: ${reg.workerNombre}`, timeout: 3000 })
    } catch (e) {
      const { dates } = getWeekRange(fechaTareo)
      const fresh = await fetchRegistros(dates[0], dates[dates.length - 1])
      setRegistros(fresh)
      setFeedbackMessage({ type: "error", message: e.message || "No se pudo eliminar el registro.", timeout: 5000 })
    }
  }

  const deleteSelectedRegistros = async () => {
    if (selectedRegistroIds.length === 0) return

    const selected = registros.filter(r => selectedRegistroIds.includes(r.id))
    const blocked = selected.filter((reg) => !canDeleteRegistro(reg))
    const deletable = selected.filter((reg) => canDeleteRegistro(reg))

    if (deletable.length === 0) {
      setFeedbackMessage({
        type: "error",
        message: blocked[0] ? getDeleteBlockMessage(blocked[0]) : "No hay registros habilitados para eliminar.",
        timeout: 5000
      })
      return
    }

    const confirmed = window.confirm(`¿Seguro que deseas eliminar ${deletable.length} registros seleccionados?${blocked.length > 0 ? ` ${blocked.length} quedarán bloqueados por cierre.` : ""}`)
    if (!confirmed) return

    let success = 0
    let failed = 0

    for (const reg of deletable) {
      try {
        await deleteRegistroById(reg.id, { beforeData: reg, source: "voice_bulk_delete" })
        success++
      } catch {
        failed++
      }
    }

    // Re-sync desde Supabase para reflejar el estado real
    const { dates } = getWeekRange(fechaTareo)
    const fresh = await fetchRegistros(dates[0], dates[dates.length - 1])
    setRegistros(fresh)
    clearRegistroSelection()

    if (failed === 0) {
      setFeedbackMessage({ type: "success", message: `Se eliminaron ${success} registros.${blocked.length > 0 ? ` ${blocked.length} quedaron bloqueados por cierre.` : ""}`, timeout: 4000 })
    } else {
      setFeedbackMessage({ type: "error", message: `Se eliminaron ${success}, fallaron ${failed}.${blocked.length > 0 ? ` ${blocked.length} estaban cerrados.` : ""}`, timeout: 5000 })
    }
  }

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
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                  {sessionAssignments.map((a, i) => (
                    <div key={i} className="assignment-badge" style={{ display: 'grid', gridTemplateColumns: '1.8fr 0.6fr 0.6fr auto', gap: 8, alignItems: 'center' }}>
                      <select
                        value={a.actividadId}
                        onChange={(e) => handleAssignmentChange(i, "actividadId", e.target.value)}
                        style={{ background: 'var(--bg-dark)', color: 'var(--text-main)', border: '1px solid var(--border-dim)', borderRadius: 6, padding: '6px 8px' }}
                      >
                        {actividades?.map(act => (
                          <option key={act.id} value={act.id}>{act.nombre}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={a.horasNormales || 0}
                        onChange={(e) => handleAssignmentChange(i, "horasNormales", e.target.value)}
                        style={{ background: 'var(--bg-dark)', color: 'var(--accent-gold)', border: '1px solid var(--border-dim)', borderRadius: 6, padding: '6px 8px' }}
                      />
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={a.horasExtras || 0}
                        onChange={(e) => handleAssignmentChange(i, "horasExtras", e.target.value)}
                        style={{ background: 'var(--bg-dark)', color: '#e88', border: '1px solid var(--border-dim)', borderRadius: 6, padding: '6px 8px' }}
                      />
                      <button onClick={() => removeSessionAssignment(i)} className="btn-icon-danger" title="Quitar actividad">
                        <TrashIcon />
                      </button>
                    </div>
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

      {!isPrivilegedUser && (
        <div className="alert-info" style={{ marginBottom: 16 }}>
          ℹ Tu rol no puede eliminar tareos desde esta vista. Si necesitas eliminar un registro, solicita apoyo a un admin.
        </div>
      )}
      {isSelectedDateClosed && isPrivilegedUser && (
        <div className="alert-info" style={{ marginBottom: 16 }}>
          ℹ La fecha {fechaTareo} está cerrada para usuarios comunes. Tu perfil {profile?.role === "super_admin" ? "super admin" : "admin"} aún puede eliminar registros.
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div className="label">
            REGISTROS DEL DÍA ({registros.length})
          </div>
          {registros.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => {
                  if (selectedRegistroIds.length === registros.length) clearRegistroSelection()
                  else setSelectedRegistroIds(registros.map(r => r.id))
                }}
                className="btn-pill-sm"
              >
                {selectedRegistroIds.length === registros.length ? "Deseleccionar" : "Seleccionar todo"}
              </button>
              <button
                onClick={deleteSelectedRegistros}
                className="btn-pill-danger"
                disabled={selectedRegistroIds.length === 0}
                style={{ opacity: selectedRegistroIds.length === 0 ? 0.5 : 1, cursor: selectedRegistroIds.length === 0 ? "not-allowed" : "pointer" }}
              >
                Eliminar seleccionados ({selectedRegistroIds.length})
              </button>
            </div>
          )}
        </div>
        {registros.length === 0 ? (
          <div className="empty-state">
            Sin registros aún. Usa el micrófono o el ingreso manual.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {registros.map((reg) => (
              <div key={reg.id} className="registro-row">
                <input
                  type="checkbox"
                  checked={selectedRegistroIds.includes(reg.id)}
                  onChange={() => toggleRegistroSelection(reg.id)}
                  style={{ marginRight: 8 }}
                  title="Seleccionar registro"
                />
                <div style={{ minWidth: "88px", display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--accent-blue)" }}>
                    {reg.date}
                  </span>
                  <span className="mono" style={{ fontSize: 9, color: "var(--text-dim)" }}>
                    {reg.timestamp || ""}
                  </span>
                </div>
                <span style={{ fontWeight: 700, color: "var(--text-main)", minWidth: '160px', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {reg.workerNombre.split(',')[0]}
                </span>
                
                <div className="registro-assignments">
                  {reg.assignments.map((a, i) => (
                    <span key={i} className="hora-badge">
                      <span style={{ color: "var(--accent-gold)" }}>{a.horasNormales || 0}h</span>
                      {a.horasExtras > 0 && <span style={{ color: "#ef4444" }}>+{a.horasExtras}hE</span>}
                      <span style={{ opacity: 0.3 }}>|</span>
                      <span style={{ fontSize: '9px', color: "var(--text-dim)" }}>
                        {actividades?.find(act => act.id === a.actividadId)?.nombre || a.actividadId}
                      </span>
                    </span>
                  ))}
                </div>

                <button onClick={() => startEditingRegistro(reg)} className="btn-pill-sm" title="Editar Tareo" style={{ marginRight: 6 }}>
                  Editar
                </button>
                <button
                  onClick={() => deleteRegistro(reg)}
                  className="btn-icon-danger"
                  title={canDeleteRegistro(reg) ? "Eliminar Tareo" : getDeleteBlockMessage(reg)}
                  disabled={!canDeleteRegistro(reg)}
                  style={{ opacity: canDeleteRegistro(reg) ? 1 : 0.45, cursor: canDeleteRegistro(reg) ? "pointer" : "not-allowed" }}
                >
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
