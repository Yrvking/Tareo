export default function Help() {
  const sections = [
    {
      icon: "📈",
      title: "Dashboard",
      subtitle: "Vista operativa y ejecutiva con filtros",
      items: [
        "Es la pantalla inicial del sistema y resume la semana activa seleccionada.",
        "Puedes filtrar por trabajador, frente, categoría, actividad o mostrar solo registros con horas extra.",
        "La Vista Operativa muestra horas por día, top actividades, frentes, categorías y trabajadores.",
        "La Vista Ejecutiva resume costos, cobertura, concentración operativa y comparativos semanales.",
        "Haz clic en una tarjeta, barra o fila para abrir el drill-down con el detalle real de asignaciones.",
      ]
    },
    {
      icon: "👥",
      title: "Carga Grupal",
      subtitle: "Registra horas para varios trabajadores a la vez",
      items: [
        "Selecciona la Actividad/Partida y el Frente (sector de obra) en el panel izquierdo.",
        "Ingresa las Horas Normales (HN) y Horas Extras (HE) que aplican a todos.",
        "En el panel derecho, marca los trabajadores que realizaron esa tarea.",
        "Presiona REGISTRAR TAREO GRUPAL. El sistema guarda un registro por cada trabajador seleccionado.",
        "Usa el buscador para filtrar por nombre, código o categoría.",
      ]
    },
    {
      icon: "📅",
      title: "Control Semanal",
      subtitle: "Vista por semana de cada trabajador",
      items: [
        "Muestra todos los trabajadores con sus días Lun–Sáb de la semana seleccionada.",
        "Los días con horas registradas aparecen resaltados en azul.",
        "Haz clic en cualquier día para agregar o editar una tarea.",
        "El total de horas normales de la semana se muestra a la derecha del nombre.",
        "Usa el buscador para encontrar un trabajador específico.",
      ]
    },
    {
      icon: "✏️",
      title: "Entrada Manual",
      subtitle: "Registro individual con múltiples actividades",
      items: [
        "Selecciona un trabajador, el frente y la fecha de tareo.",
        "Agrega tantas filas de actividad como sean necesarias (ej: 4h en partida A + 2h en partida B).",
        "Presiona GUARDAR REGISTRO para insertar en la base de datos.",
      ]
    },
    {
      icon: "🎤",
      title: "Entrada por Voz",
      subtitle: "Registra tareos hablando",
      items: [
        "Presiona el botón de micrófono y habla naturalmente: 'Juan Pérez, 8 horas partida 101'.",
        "Di otro nombre para cambiar de trabajador automáticamente.",
        "Di 'Registrar' para guardar el trabajador actual y continuar.",
        "Di 'Cambiar trabajador' para guardar y esperar el siguiente nombre.",
        "Los registros del día aparecen en la lista inferior; puedes editarlos o eliminarlos.",
        "Comandos: 'Borrar último', 'Modificar registro de [nombre]', 'Corregir partida 101 a 5 horas'.",
      ]
    },
    {
      icon: "📊",
      title: "Planilla (Resumen)",
      subtitle: "Reportes y exportación a S10",
      items: [
        "Vista Semana por Trabajador: tabla con HN y HE por día, total semanal y valor en soles.",
        "Vista Tareo por Actividad: matriz semanal de actividades vs días.",
        "Vista Resumen Semanal: consolidado por actividad o por partida de control.",
        "Botón Exportar S10: genera el archivo .XLS en el formato requerido por el software S10.",
        "Botón Exportar DB: descarga toda la base de datos en Excel para respaldo.",
      ]
    },
    {
      icon: "🤖",
      title: "Asistente IA",
      subtitle: "Consultas inteligentes sobre el tareo",
      items: [
        "Hace preguntas en lenguaje natural sobre los datos del día o la semana.",
        "Ejemplos: '¿Quién trabajó más horas hoy?', '¿Cuántas horas extras llevamos esta semana?'",
        "El asistente recibe el contexto de los registros de forma anónima.",
        "Requiere una API Key de Google Gemini configurada en la pestaña Config.",
      ]
    },
    {
      icon: "⚙️",
      title: "Configuración",
      subtitle: "Administración del sistema (solo admins)",
      items: [
        "Importar Personal S10: carga el archivo XLSX de personal exportado desde S10 (Personal > Listado). Modo Combinar agrega nuevos sin borrar los existentes; Reemplazar sobreescribe toda la lista.",
        "Importar Partidas S10: carga el presupuesto desde S10 para obtener las partidas y actividades del proyecto.",
        "Importar Partidas Modelo: carga una plantilla de partidas estándar si no tienes el presupuesto S10.",
        "Trabajadores: agrega o elimina trabajadores manualmente. Ingresa nombre y selecciona categoría.",
        "Partidas y Actividades: define las partidas de control y sus actividades asociadas.",
        "Frentes: crea los sectores o frentes de obra (ej: FRENTE 1, SECTOR A) para usarlos en los registros y filtros del dashboard.",
        "Datos del Proyecto: edita empresa, obra, código de proyecto y código de nómina para exportaciones y dashboard.",
        "API Key Gemini: pega tu clave de Google AI Studio para habilitar el Asistente IA.",
      ]
    },
    {
      icon: "📌",
      title: "Filtro de Fechas",
      subtitle: "Cómo funciona el selector de fecha",
      items: [
        "El selector de fecha en la cabecera define la SEMANA activa para todas las pestañas.",
        "Al cambiar la fecha, el sistema recarga automáticamente los registros de esa semana (Lun–Sáb).",
        "En Planilla puedes navegar semanas usando el selector de fecha sin afectar las otras pestañas.",
      ]
    },
  ]

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="card" style={{ marginBottom: 16, background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>📋</span>
          <div>
            <div className="title" style={{ fontSize: 18 }}>Guía de uso — TAREADOR S10</div>
            <div className="subtitle">Sistema de control de horas para obras de construcción civil</div>
          </div>
        </div>
      </div>

      {sections.map((sec) => (
        <div key={sec.title} className="card" style={{ marginBottom: 10, padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>{sec.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-main)' }}>{sec.title}</div>
              <div style={{ fontSize: 11, color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>{sec.subtitle}</div>
            </div>
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sec.items.map((item, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>{item}</li>
            ))}
          </ul>
        </div>
      ))}

      <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 11, color: 'var(--text-muted)' }}>
        TAREADOR S10 · v1.1.10 · Soporte: yleon@padovasac.com
      </div>
    </div>
  )
}
