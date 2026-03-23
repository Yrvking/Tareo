# Tareador - Control de Horas Hombre por Voz

Sistema de registro de horas hombre mediante reconocimiento de voz.
Permite asignar horas por partida de control a cada trabajador usando comandos de voz o ingreso manual.

## Requisitos

- Node.js 18 o superior
- Navegador Chrome o Edge (para reconocimiento de voz)

## Instalación

```bash
cd C:\Users\Yrving\Tareo
npm install
```

## Ejecutar en desarrollo

```bash
npm run dev
```

Se abrirá automáticamente en http://localhost:3000

## Configurar Gemini API Key (gratis)

### 1) Crear la key en Google AI Studio

1. Abre: https://aistudio.google.com/app/apikey
2. Inicia sesión con tu cuenta de Google.
3. Haz clic en **Create API key**.
4. Si te pide proyecto, crea o selecciona uno.
5. Copia la key generada.

### 2) Cargar la key dentro de la app

1. Ejecuta el proyecto con `npm run dev`.
2. En la app, entra a la pestaña **Configuración**.
3. Baja hasta **CONFIGURACIÓN DEL ASISTENTE IA**.
4. Pega la key en el campo **Pega tu nueva API Key aquí...**.
5. Haz clic en **GUARDAR**.
6. Ve a la pestaña del asistente y prueba una consulta.

### 3) Opción alternativa por variable de entorno local

Si prefieres configurar por archivo local:

1. Crea/edita `.env` en la raíz del proyecto.
2. Agrega:

```env
VITE_GEMINI_API_KEY=TU_API_KEY_AQUI
```

3. Reinicia `npm run dev`.

### 4) Seguridad (muy importante)

- Nunca subas la key a git.
- Este proyecto ya ignora `.env` en `.gitignore`.
- Si compartiste una key por chat o captura, rótala y crea una nueva.

### 5) Error 404 de modelo (ya corregido)

Si viste este error:

`models/gemini-pro is not found for API version v1beta`

ya está corregido en el proyecto. Ahora el sistema consulta el catálogo real de modelos disponibles y usa solo modelos compatibles con `generateContent`.

## Auditoria de cambios de tareo (logs)

Para registrar historial de correcciones (ediciones y eliminaciones) en la nube:

1. Abre Supabase SQL Editor.
2. Ejecuta el script [scripts/supabase_registros_logs.sql](scripts/supabase_registros_logs.sql).
3. Vuelve a desplegar o recarga la app.

La app seguira funcionando sin esa tabla, pero no guardara bitacora en la nube hasta crearla.

## Permisos RLS para eliminar/editar registros

Si borras y al recargar vuelven a aparecer, normalmente es por politicas RLS de Supabase en tabla `registros`.

1. Abre Supabase SQL Editor.
2. Ejecuta [scripts/supabase_registros_policies.sql](scripts/supabase_registros_policies.sql).
3. Vuelve a probar eliminar y recargar.

Con esto, usuarios autenticados podran leer, insertar, editar y eliminar registros en la nube.

## Compilar para producción

```bash
npm run build
```

Los archivos compilados quedan en la carpeta `dist/`.

## Estructura del proyecto

```
Tareo/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── Config.jsx          # Tab de configuración
│   │   ├── Icons.jsx           # Iconos SVG
│   │   ├── ManualEntry.jsx     # Tab de ingreso manual
│   │   ├── Summary.jsx         # Tab de resumen y exportación
│   │   └── VoiceRecorder.jsx   # Tab de registro por voz
│   ├── data/
│   │   └── defaults.js         # Datos iniciales de ejemplo
│   ├── utils/
│   │   ├── exportCSV.js        # Lógica de exportación CSV
│   │   └── voiceParser.js      # Parser de comandos de voz
│   ├── App.css                 # Estilos globales de componentes
│   ├── App.jsx                 # Componente principal
│   ├── index.css               # Reset CSS base
│   └── main.jsx                # Punto de entrada React
├── index.html
├── package.json
└── vite.config.js
```

## Uso de comandos de voz

Formato: "[Nombre], [X] horas partida [código], [Y] horas partida [código]"

Ejemplos:
- "Juan Pérez, 4 horas partida 101, 3 horas partida 201"
- "Carlos García, 8 horas partida 102"
- "María López, 5 horas excavación, 3 horas concreto"
