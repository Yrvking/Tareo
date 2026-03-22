import React, { useState, useRef, useEffect } from "react"
import { SendIcon, SparklesIcon, TrashIcon } from "./Icons"
import { askAssistant, getAvailableModels } from "../utils/aiService"

export default function AIAssistant({ workers, registros, actividades, fechaTareo }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hola. Soy tu consultor S10 Pro. He activado el nuevo sistema de Failover Arquitectónico. ¿Qué analizamos hoy?" }
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [modelsInfo, setModelsInfo] = useState("Cargando catálogo...")

  useEffect(() => {
    // Diagnóstico inicial de modelos disponibles
    const checkModels = async () => {
      const apiKey = localStorage.getItem("gemini_api_key")
      const available = await getAvailableModels(apiKey)
      if (available && available.length > 0) {
        setModelsInfo(`Conectado: ${available[0]} (Resilient Mode)`)
      } else {
        setModelsInfo("Esperando API Key o Configuración de Railway...")
      }
    }
    checkModels()
  }, [])
  const chatEndRef = useRef(null)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  const handleSend = async () => {
    if (!input.trim() || isTyping) return

    const apiKey = localStorage.getItem("GEMINI_API_KEY")
    const userMsg = input.trim()
    setInput("")
    setMessages(prev => [...prev, { role: "user", text: userMsg }])
    setIsTyping(true)

    try {
      const response = await askAssistant(apiKey, userMsg, {
        workers, registros, actividades, fechaTareo
      })
      setMessages(prev => [...prev, { role: "assistant", text: response }])
    } catch (error) {
      console.error("AI Assistant Error:", error)
      let errorMsg = "Lo siento, hubo un error al procesar tu consulta."
      
      if (error.message === "MISSING_KEY") {
        errorMsg = "⚠️ Por favor, configura tu **Gemini API Key** en la pestaña de **Configuración**."
      } else if (error.message === "RATE_LIMIT") {
        errorMsg = "⏳ Límite alcanzado (15 consultas/min). Espera 30 segundos."
      } else {
        // Mostrar el error real para depuración
        errorMsg = `❌ Error: ${error.message || "Error desconocido en el servidor de Google"}`
      }
      setMessages(prev => [...prev, { role: "assistant", text: errorMsg, isError: true }])
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <div className="chat-viewport" style={{ 
      height: 'calc(100vh - 180px)', 
      display: 'flex', 
      flexDirection: 'column',
      background: 'var(--bg-dark)',
      borderRadius: '20px',
      overflow: 'hidden',
      border: '1px solid var(--border-dim)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
    }}>
      {/* Header */}
      <div style={{ 
        padding: '16px 20px', 
        background: 'var(--bg-card)', 
        borderBottom: '1px solid var(--border-dim)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ 
            width: '36px', 
            height: '36px', 
            borderRadius: '10px', 
            background: 'var(--accent-blue)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'white'
          }}>
            <SparklesIcon />
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '14px', letterSpacing: '0.5px', color: 'white' }}>TAREADOR AI</div>
            <div style={{ fontSize: '10px', color: 'var(--accent-blue)', fontWeight: '700', textTransform: 'uppercase' }}>
              {modelsInfo}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button 
            onClick={() => {
              if(window.confirm("¿Aplicar actualizaciones de arquitectura v1.1.5?")) {
                window.location.reload(true);
              }
            }}
            style={{ fontSize: '10px', padding: '4px 8px', background: 'rgba(37,99,235,0.1)', border: '1px solid var(--accent-blue)', borderRadius: '4px', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
          >
             ACTUALIZAR v1.1.5
          </button>
          <button 
            onClick={() => setMessages([{ role: "assistant", text: "Chat reiniciado. ¿En qué puedo ayudarte ahora?" }])}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-area" style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '20px', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '20px',
        scrollbarWidth: 'none'
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{ 
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '90%',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <div style={{ 
              background: m.role === 'user' ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
              padding: '14px 18px',
              borderRadius: m.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
              color: m.isError ? '#ff6b6b' : 'var(--text-main)',
              fontSize: '14px',
              lineHeight: '1.6',
              boxShadow: m.role === 'user' ? '0 4px 12px rgba(37,99,235,0.2)' : 'none',
              border: m.isError ? '1px solid #ff6b6b33' : 'none'
            }}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
            </div>
            <div style={{ 
              fontSize: '9px', 
              color: 'var(--text-dim)', 
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              padding: '0 4px'
            }}>
              {m.role === 'user' ? 'Tú' : 'Asistente'}
            </div>
          </div>
        ))}
        {isTyping && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 6, padding: '12px 18px', background: 'rgba(255,255,255,0.03)', borderRadius: '20px' }}>
            <span className="dot-typing"></span>
            <span className="dot-typing"></span>
            <span className="dot-typing"></span>
          </div>
        )}
        <div ref={chatEndRef}></div>
      </div>

      {/* Suggestions */}
      <div style={{ padding: '0 20px', display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: '10px', scrollbarWidth: 'none' }}>
        {["Resumen de hoy", "Top 3 horas extras", "¿Novedades?"].map(s => (
          <button 
            key={s}
            onClick={() => { setInput(s); }}
            className="btn-pill-sm"
            style={{ whiteSpace: 'nowrap', background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border-dim)' }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Box */}
      <div style={{ 
        padding: '16px 20px 24px 20px', 
        background: 'var(--bg-card)', 
        borderTop: '1px solid var(--border-dim)' 
      }}>
        <div style={{ 
          display: 'flex', 
          background: 'var(--bg-dark)', 
          borderRadius: '30px', 
          padding: '4px 4px 4px 16px',
          alignItems: 'center',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
          border: '1px solid var(--border-dim)'
        }}>
          <input 
            type="text" 
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Pregunta sobre la obra..."
            style={{ 
              flex: 1, 
              background: 'none', 
              border: 'none', 
              color: 'white', 
              outline: 'none',
              fontSize: '14px',
              padding: '10px 0'
            }}
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '50%', 
              background: input.trim() ? 'var(--accent-blue)' : 'var(--border-dim)',
              border: 'none',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              opacity: input.trim() ? 1 : 0.5
            }}
          >
            <SendIcon />
          </button>
        </div>
      </div>

      <style>{`
        .dot-typing {
          width: 6px;
          height: 6px;
          background: var(--accent-blue);
          border-radius: 50%;
          animation: dot-pulse 1.4s infinite ease-in-out;
        }
        .dot-typing:nth-child(2) { animation-delay: 0.2s; }
        .dot-typing:nth-child(3) { animation-delay: 0.4s; }
        @keyframes dot-pulse {
          0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
        .messages-area::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
