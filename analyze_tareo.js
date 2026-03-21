import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

const dir = 'C:\\Users\\Yrving\\Tareo\\Formato_Obra';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'));

// Check all files and build a dictionary of Actividad -> PC
const actividadesPC = {};
let log = "";

for (const file of files) {
  const wb = xlsx.readFile(path.join(dir, file));
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('tareo actividades'));

  if (sheetName) {
    const sheet = wb.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    // Look for the header row (has 'ACTIVIDADES' and 'PC' or similar)
    // Actually, usually data starts below row 5. Let's just scan all rows.
    for (let i = 0; i < data.length; i++) {
       const row = data[i];
       if (!row || row.length < 3) continue;
       
       // the number is usually col 1, actividad col 2, PC col 3
       const col1 = String(row[1] || "").trim();
       const col2 = String(row[2] || "").trim();
       const col3 = String(row[3] || "").trim();
       const col4 = String(row[4] || "").trim();

       log += `[F:${file}] [R:${i+1}] C1:${col1} | C2:${col2} | C3:${col3} | C4:${col4}\n`;
    }
  }
}
fs.writeFileSync('C:\\Users\\Yrving\\Tareo\\actividades_log.txt', log);
