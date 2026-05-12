# Tareador Padova

Aplicacion de control de horas hombre para obra, con registro manual, carga grupal, ingreso por voz, dashboard operativo/ejecutivo, exportaciones S10/Excel, sincronizacion cloud y despliegue web + movil.

## Estado actual del proyecto

El repositorio corresponde a una SPA en React/Vite que hoy opera en tres modalidades:

1. **Web de escritorio o tablet** para operacion diaria.
2. **Web movil / PWA** accesible desde celulares.
3. **App Android con Capacitor** que embebe el build web compilado.

La aplicacion usa almacenamiento local para cache, catalogos y cola offline, pero el acceso actual al sistema esta amarrado al flujo de autenticacion con **Supabase**. En otras palabras: **sin credenciales de Supabase no hay ingreso funcional a la app actual**, aunque la capa local siga existiendo en el codigo.

## Funcionalidades implementadas

### Registro de tareo

- **Carga grupal** para asignar una misma actividad a varios trabajadores.
- **Ingreso manual** con multiples actividades por trabajador.
- **Registro por voz** con comandos en espanol usando `SpeechRecognition` / `webkitSpeechRecognition`.
- **Control semanal** con vista por trabajador y por dias de la semana activa.
- **Planilla / Resumen** con consolidado por trabajador, actividad y partida.

### Analitica y reportes

- **Dashboard operativo y ejecutivo** con filtros por trabajador, frente, categoria, actividad y horas extra.
- **Drill-down** sobre tarjetas y rankings.
- **Exportacion a PDF** del dashboard.
- **Exportacion a Excel visual** y **Excel contable** desde planilla.
- **Exportacion S10 (.xls)** por semana.

### Integraciones y soporte operativo

- **Supabase** para autenticacion, persistencia compartida y sincronizacion.
- **Google Gemini** para consultas en lenguaje natural.
- **Modo offline** con cola de sincronizacion en IndexedDB.
- **Importadores S10 / XLSX** para personal, partidas, modelo TMO, costos, actividades y tareos.
- **Portal contratista** con padron, estados y QR.
- **Vigilancia** con ingresos/salidas y validacion por QR, DNI o codigo.
- **Prevencion / SOMA** con checklist documental por persona.
- **Gestion de usuarios** dentro de Configuracion.

## Arquitectura real

### Frontend

- React 18
- Vite 6
- CSS nativo
- `react-select`

### Persistencia

- `localStorage` para catalogos y configuracion local
- **IndexedDB** (`src/utils/offlineDb.js`) para registros locales y cola de sincronizacion
- **Supabase** para autenticacion y almacenamiento compartido

### Exportaciones e importaciones

- `xlsx`
- `exceljs`
- `jspdf`
- `jspdf-autotable`
- `qrcode`

### Movil y PWA

- `vite-plugin-pwa`
- `@capacitor/core`, `@capacitor/android`, `@capacitor/cli`

### IA

- `@google/generative-ai`

## Como se conecta con celulares

El proyecto **si tiene salida movil** y hoy contempla tres escenarios:

| Modalidad | Como funciona | Estado actual |
|---|---|---|
| Navegador movil | Abrir la URL de la app desde el celular | Disponible |
| PWA | Instalable desde navegador compatible | Disponible |
| App Android | Build nativo via Capacitor con `webDir: dist` | Disponible |

### 1. Uso desde celular por navegador

En desarrollo, Vite esta configurado con `host: true` y puerto `3000`, por lo que puedes abrir la app desde un celular conectado a la misma red usando:

```bash
http://IP_DE_TU_PC:3000
```

Esto sirve para pruebas en campo sin compilar APK.

### 2. PWA instalable

La app genera `manifest.webmanifest`, `sw.js` y assets PWA durante el build. Eso permite instalarla como acceso directo en Android y usar cache local.

### 3. App Android con Capacitor

La carpeta `android/` contiene el proyecto nativo. La configuracion actual:

- `appId`: `com.melcen.tareador`
- `appName`: `Tareador`
- `webDir`: `dist`

El `AndroidManifest.xml` ya declara:

- `android.permission.INTERNET`
- `android.permission.RECORD_AUDIO`
- `android.permission.MODIFY_AUDIO_SETTINGS`

Eso confirma que la app Android esta preparada para conectarse a internet y usar microfono.

> Nota: el registro por voz depende de soporte del entorno WebView/navegador para `SpeechRecognition`. En navegador de escritorio el objetivo operativo actual es Chrome o Edge.

## Flujo de datos

1. El usuario inicia sesion con Supabase.
2. La app carga catalogos y configuracion.
3. Los registros se guardan localmente.
4. Si hay conectividad y credenciales, se sincronizan con Supabase.
5. Si no hay internet, quedan en cola en IndexedDB hasta reintento.

Indicadores visibles en la cabecera:

- **Sin conexion**
- **Sincronizando...**
- **X pendientes**
- **En linea**

## Reglas operativas ya implementadas

- Semana activa basada en la fecha seleccionada.
- Rango semanal principal: **Lunes a Sabado**.
- Tope de **Horas Normales**: `8.5h` por dia.
- Tope de **Horas Extras**: `2.5h` por dia.
- No existe conversion automatica entre HN y HE.
- Configuracion permite **cerrar fechas de tareo** para restringir eliminaciones/ediciones.

## Modulos principales

### Dashboard

- Vista operativa y ejecutiva
- Indicadores semanales y acumulados
- Filtros y exportacion PDF

### Carga Grupal

- Seleccion multiple de personal
- Registro masivo de actividad, frente, HN y HE

### Control Semanal

- Matriz por trabajador / dia
- Edicion rapida sobre la semana activa

### Manual

- Registro individual con varias asignaciones

### Voz

- Sesion continua por trabajador
- Comandos de registrar, corregir, modificar y cambiar trabajador

### Planilla

- Vista semanal por trabajador
- Vista por actividad
- Resumen semanal
- Exportacion S10, Excel visual y Excel contable

### Asistente IA

- Preguntas en lenguaje natural
- Usa Gemini con clave local o por variable de entorno

### Configuracion

- Gestion de trabajadores, partidas, frentes, actividades y tipos de hora
- Datos de proyecto
- Carga de plantillas e importaciones
- Cierre de fechas
- Gestion de usuarios

### Portal Contratista

- Empresas
- Padron de personal externo
- Estados: apto, pendiente, bloqueado
- Generacion y lectura de QR

### Vigilancia

- Ingreso/salida de personal interno y contratista
- Resolucion por QR, DNI o codigo
- Resumen por empresa

### Prevencion

- Checklist documental por persona
- Seguimiento de cumplimiento por empresa

## Roles y accesos

El proyecto mantiene estos roles:

- `super_admin`
- `admin`
- `user`
- `contratista`
- `vigilancia`
- `prevencion`

Puntos importantes del estado actual:

- `super_admin` y `admin` acceden a **Config**.
- Solo `super_admin` puede **gestionar usuarios**.
- Las pestañas operativas principales (`Dashboard`, `Carga Grupal`, `Control Semanal`, `Manual`, `Voz`, `Planilla`, `Asistente`) estan visibles para `super_admin`, `admin` y `user`.
- En la navegacion actual, `Portal Contratista`, `Vigilancia` y `Prevencion` estan expuestas desde tabs de `super_admin`.

## Estructura principal del repositorio

```text
Tareo/
|-- src/
|   |-- App.jsx
|   |-- main.jsx
|   |-- components/
|   |   |-- Dashboard.jsx
|   |   |-- MobileEntry.jsx
|   |   |-- WeeklyControl.jsx
|   |   |-- ManualEntry.jsx
|   |   |-- VoiceRecorder.jsx
|   |   |-- Summary.jsx
|   |   |-- AIAssistant.jsx
|   |   |-- Config.jsx
|   |   |-- Login.jsx
|   |   |-- UserManagementPanel.jsx
|   |   |-- ContractorPortalPanel.jsx
|   |   |-- VigilanciaPanel.jsx
|   |   |-- PrevencionPanel.jsx
|   |   `-- Help.jsx
|   |-- contexts/
|   |   `-- AuthContext.jsx
|   |-- data/
|   |   |-- defaults.js
|   |   `-- actividades.js
|   `-- utils/
|       |-- supabaseClient.js
|       |-- offlineDb.js
|       |-- voiceParser.js
|       |-- aiService.js
|       |-- s10Importer.js
|       |-- s10Exporter.js
|       |-- planillaExports.js
|       |-- exportCSV.js
|       |-- contractorPortal.js
|       |-- tareoLogic.js
|       `-- accessControl.js
|-- public/
|-- scripts/
|   |-- supabase_app_settings.sql
|   |-- supabase_registros_policies.sql
|   |-- supabase_registros_logs.sql
|   `-- audit_ai_traffic.py
|-- android/
|-- server.mjs
|-- vite.config.js
|-- capacitor.config.json
|-- package.json
|-- Formato_Obra/
|-- Formatos_S10/
|-- Partidas_Control/
`-- README.md
```

## Carpetas y archivos auxiliares relevantes

Ademas del codigo principal, el repo incluye insumos operativos:

- `Formato_Obra/`: archivos base de obra usados para analisis o consolidacion.
- `Formatos_S10/`: ejemplos/exportaciones semanales S10.
- `Partidas_Control/`: plantillas/modelos auxiliares.
- `analyze_tareo.js`, `generate_maestro.js`, `merge_files.js`, `update.js`: scripts puntuales de soporte y preparacion de datos.
- `actividades_log.txt`: salida generada en procesos de analisis/importacion.

Estos archivos **no forman parte del runtime principal** de la app, pero si del contexto operativo del proyecto.

## Requisitos

- Node.js 18+
- npm 9+
- Chrome o Edge para el flujo web de voz recomendado
- Cuenta Supabase para modo colaborativo
- API Key de Gemini para asistente IA
- Android Studio si vas a compilar APK

## Instalacion

```bash
npm install
```

## Variables de entorno

Crea un archivo `.env` en la raiz:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
VITE_GEMINI_API_KEY=tu-api-key-gemini
```

Notas:

- Sin `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, el login no funcionara en el flujo productivo.
- `VITE_GEMINI_API_KEY` es opcional si la clave se carga manualmente desde Configuracion.
- `.env` ya esta ignorado por git.

## Comandos disponibles

| Comando | Descripcion |
|---|---|
| `npm run dev` | Levanta Vite en puerto 3000 |
| `npm run build` | Genera `dist/` y artefactos PWA |
| `npm run preview` | Preview local del build |
| `npm start` | Sirve `dist/` con `server.mjs` |

## Desarrollo local

### Web / escritorio

```bash
npm run dev
```

### Acceso desde celular en la misma red

```bash
npm run dev
```

Luego abre en el celular:

```bash
http://IP_DE_TU_PC:3000
```

### Flujo de trabajo que venias usando para Android

Si trabajabas en **VS Code** y luego abrias **Android Studio** para ver los cambios en la app, ese flujo correcto es este:

1. Editar el proyecto en VS Code.
2. Generar el nuevo build web con `npm run build`.
3. Sincronizar Capacitor con `npx cap sync android`.
4. Abrir Android Studio con `npx cap open android`.
5. Desde Android Studio, volver a compilar o ejecutar la app en emulador/celular.

Esto es importante porque la app Android **no lee directamente `src/`**: consume el contenido compilado de `dist/`, y `cap sync` copia ese build al proyecto nativo.

### Produccion local

```bash
npm run build
npm start
```

## Build Android

```bash
npm run build
npx cap sync android
npx cap open android
```

Luego compila el APK/AAB desde Android Studio.

Si quieres ejecutar en dispositivo Android conectado:

```bash
npx cap run android
```

### Cuando haces cambios en el proyecto

Para actualizar la app Android despues de cualquier cambio en el frontend, usa este ciclo:

```bash
npm run build
npx cap sync android
npx cap open android
```

Si Android Studio ya estaba abierto, igual conviene volver a ejecutar al menos:

```bash
npm run build
npx cap sync android
```

Luego recompilas desde Android Studio para ver los cambios en el dispositivo o emulador.

## Configuracion de Supabase

Los scripts de `scripts/` cubren la puesta en marcha base:

### 1. Persistencia compartida de catalogos y configuracion

Ejecuta:

```sql
scripts/supabase_app_settings.sql
```

Sirve para compartir entre dispositivos:

- trabajadores
- partidas
- actividades
- frentes
- tipos de hora
- configuracion del proyecto
- usuarios gestionados
- accesos
- empresas/roster contratista

### 2. Politicas sobre `registros`

Ejecuta:

```sql
scripts/supabase_registros_policies.sql
```

Habilita lectura/insercion/edicion/eliminacion segun politicas del proyecto.

### 3. Bitacora de cambios

Ejecuta:

```sql
scripts/supabase_registros_logs.sql
```

Registra historial de cambios sobre tareos.

## Gemini

La app usa `@google/generative-ai` y consulta el catalogo real de modelos compatibles con `generateContent`.

Puedes configurar la clave de dos formas:

1. `.env` con `VITE_GEMINI_API_KEY`
2. Desde la pestaña **Config** guardandola en `localStorage` (`gemini_api_key`)

## Importaciones y plantillas

Desde Configuracion existen flujos para:

- importar personal S10
- importar partidas por proyecto
- importar modelo TMO
- importar consolidado de costos
- importar actividades
- importar tareo desde Excel
- descargar plantillas base para cada flujo

El proyecto tolera archivos `.xlsx` y `.xls` en varias de estas entradas.

## Servidor de produccion

`server.mjs` es un servidor HTTP nativo de Node que:

- sirve `dist/`
- usa puerto `3000` por defecto
- resuelve rutas SPA devolviendo `index.html`

## Estado de automatizacion

Hoy el repositorio **no define tests automatizados ni scripts de lint** en `package.json`.

El comando operativo vigente de validacion es:

```bash
npm run build
```

## Uso interno

Proyecto de uso privado para **Constructora Padova SAC**.
