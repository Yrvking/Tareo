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
