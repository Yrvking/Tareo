import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { INITIAL_PARTIDAS } from './src/data/defaults.js';

function normalize(str) {
  if (!str) return '';
  return str.toString()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getBestPartida(pcName) {
  const norm = normalize(pcName);
  let best = null;
  let bestScore = -1;

  for (const p of INITIAL_PARTIDAS) {
    const pNorm = normalize(p.nombre);
    if (pNorm === norm) return p;
    
    let score = 0;
    
    // Custom domain mappings since Excel names don't perfectly match
    if (norm.includes("provosionales") && pNorm.includes("provisionales")) score += 5;
    if (norm.includes("estabilizacion") && pNorm.includes("estabilizacion")) score += 5;
    if (norm.includes("arquitectura") && pNorm.includes("arquitectura")) score += 5;
    if (norm.includes("albañileria") && pNorm.includes("albañileria")) score += 5;
    if (norm.includes("seguridad") && pNorm.includes("seguridad")) score += 5;
    if (norm.includes("cajas ecologicas") && pNorm.includes("cajas ecologicas")) score += 5;
    if (norm.includes("movimientos de tierra") && pNorm.includes("movimiento de tierras")) score += 5;
    
    const words1 = norm.split(' ').filter(x => x.length > 3);
    const words2 = pNorm.split(' ').filter(x => x.length > 3);
    for (const w of words1) if (words2.includes(w)) score++;
    
    if (pNorm.includes(norm) && norm.length > 5) score += 3;
    if (norm.includes(pNorm) && pNorm.length > 5) score += 3;

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore > 0 ? best : null;
}

const logContent = fs.readFileSync('C:\\Users\\Yrving\\Tareo\\actividades_log.txt', 'utf-8');
const lines = logContent.split('\n');

const actividadesMap = new Map();

for (const line of lines) {
  if (!line.trim()) continue;
  
  const m1 = line.match(/C2:(.*?)\s*\|/);
  const m2 = line.match(/C3:(.*?)\s*\|/);
  
  if (m1 && m2) {
    let actName = m1[1].trim();
    let pcName = m2[1].trim();
    
    if (!actName || !pcName) continue;
    
    // Spelling fixes based on user request
    if (actName.toLowerCase() === "umedecer terreno") actName = "Humedecer terreno";
    if (actName.toLowerCase() === "sndicato") actName = "Sindicato";
    actName = actName.replace(/provicionales/gi, "PROVISIONALES");
    actName = actName.replace(/provicional/gi, "PROVISIONAL");
    actName = actName.replace(/manparas/gi, "MAMPARAS");
    actName = actName.replace(/gimnacio/gi, "GIMNASIO");
    actName = actName.replace(/acentado/gi, "ASENTADO");
    actName = actName.replace(/enchapesy/gi, "ENCHAPES Y");
    actName = actName.replace(/encofradoy/gi, "ENCOFRADO Y");
    actName = actName.replace(/pasosy/gi, "PASOS Y");
    actName = actName.replace(/señaletias/gi, "SEÑALETICAS");
    actName = actName.replace(/meza/gi, "MESA");
    actName = actName.replace(/provetas/gi, "PROBETAS");
    actName = actName.replace(/desmotaje/gi, "DESMONTAJE");
    actName = actName.replace(/solaqueos/gi, "SOLAQUEO");
    
    // Capitalize all
    actName = actName.toUpperCase();
    
    const normAct = normalize(actName);
    
    if (!actividadesMap.has(normAct)) {
      const bestPC = getBestPartida(pcName);
      if (bestPC) {
        actividadesMap.set(normAct, {
          nombre: actName,
          partidaId: bestPC.id
        });
      } else {
        console.log("Could not resolve Partida for:", pcName);
      }
    }
  }
}

const finalArray = Array.from(actividadesMap.values()).map((v) => ({
  nombre: v.nombre,
  partidaId: v.partidaId
}));

// Sort alphabetically
finalArray.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

// Re-assign IDs after sorting
finalArray.forEach((a, idx) => {
  a.id = `A${String(idx + 1).padStart(3, '0')}`;
});

let fileContent = `export const INITIAL_ACTIVIDADES = [\n`;
for (const a of finalArray) {
  fileContent += `  { id: "${a.id}", nombre: "${a.nombre}", partidaId: "${a.partidaId}" },\n`;
}
fileContent += `];\n`;

fs.writeFileSync('C:\\Users\\Yrving\\Tareo\\src\\data\\actividades.js', fileContent);
console.log(`Successfully generated ${finalArray.length} activities to src/data/actividades.js`);
