function normalizeCode(value) {
  return String(value ?? "")
    .trim()
    .replace(/\.0+$/, "")
    .replace(/\D/g, "")
}

function normalizeCodeKey(value) {
  const digits = normalizeCode(value)
  return digits.replace(/^0+/, "") || digits
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase()
}

const ACCOUNTING_PARTIDA_ROWS = [
  ["2330302", "010101001", "Demolicion", "DEMOLICION, CARGUIO Y ELIMINACION"],
  ["234040104", "010201005", "Caseta Para Oficinas, Comedor Y Cerco Perimetrico", "CASETA PARA OFICINAS, COMEDOR Y CERCO PERIMETRICO"],
  ["234040105", "010201010", "Servicios Higienicos para Staff y Obreros", "FACILIDADES DE OBRA (S.H., OBREROS, VESTIDOR, COMEDOR ALMACEN, CERCO)"],
  ["234040107", "010201015", "Traslado Vertical Y Horizontal", "TRASLADO VERTICAL Y HORIZONTAL"],
  ["234040108", "010201020", "Equipos Y Herramientas", "EQUIPOS Y HERRAMIENTAS"],
  ["234040109", "010201025", "Varios - Obras Preliminares", "VARIOS - OBRAS PRELIMINARES"],
  ["234040201", "010201030", "Topografia", "TOPOGRAFIA"],
  ["234040203", "010201035", "Servicios, Energia, Agua y Comunicaciones", "SERVICIOS DE LUZ Y AGUA PARA LA OBRA"],
  ["234040204", "010201040", "Eliminacion De Desmonte Y Limpieza Permanente", "ELIMINACION DE DESMONTE Y LIMPIEZA PERMANENTE"],
  ["234040209", "010201045", "Eliminacion De Basura Y Desmonte Con Cajas Ecologicas", "ELIMINACION DE BASURA Y DESMONTE CON CAJAS ECOLOGICAS"],
  ["234040211", "010201050", "Control de Calidad", "CONTROL DE CALIDAD"],
  ["234040205", "010201055", "Seguridad Industrial (EPP y EPC), Patrimonial", "SEGURIDAD EN OBRA E IMPLEMENTOS"],
  ["234040210", "010201060", "Varios - Obras Provisionales", "VARIOS - OBRAS PROVISIONALES"],
  ["23406010401", "010202005", "Movimiento De Tierras", "MANO DE OBRA-Movimiento De Tierras"],
  ["23406040201", "010202010", "Muros Anclados - Estabilizacion", "MANO DE OBRA-Muros Anclados - Estabilizacion"],
  ["234060601", "010202015", "Concreto Cimentacion", "MANO DE OBRA-Concreto Cimentacion"],
  ["234063601", "010202020", "Concreto Muros Anclados", "MANO DE OBRA-Concreto Muros Anclados"],
  ["234063701", "010202025", "Concreto Estacionamientos", "MANO DE OBRA-Concreto Estacionamientos"],
  ["234063801", "010202030", "Concreto Residencial", "MANO DE OBRA-Concreto Residencial"],
  ["234063901", "010202035", "Acero Cimentacion", "MANO DE OBRA-Acero Cimentacion"],
  ["234064001", "010202040", "Acero Muros Anclados", "MANO DE OBRA-Acero Muros Anclados"],
  ["234064101", "010202045", "Acero Estacionamientos", "MANO DE OBRA-Acero Estacionamientos"],
  ["234064201", "010202050", "Acero Residencial", "MANO DE OBRA-Acero Residencial"],
  ["234064301", "010202055", "Encofrado Cimentacion", "MANO DE OBRA-Encofrado Cimentacion"],
  ["234064401", "010202060", "Encofrado Muros Anclados", "MANO DE OBRA-Encofrado Muros Anclados"],
  ["234064501", "010202065", "Encofrado Estacionamientos", "MANO DE OBRA-Encofrado Estacionamientos"],
  ["234064601", "010202070", "Encofrado Residencial", "MANO DE OBRA-Encofrado Residencial"],
  ["234064701", "010202075", "Sistema De Losas Estacionamientos", "MANO DE OBRA-Sistema De Losas Estacionamientos"],
  ["234064801", "010202080", "Sistema De Losas Residencial", "MANO DE OBRA-Sistema De Losas Residencial"],
  ["234064901", "010202085", "Varios - Estructuras", "MANO DE OBRA-Varios - Estructuras"],
  ["234072001", "010203005", "Muros de Albañileria", "MANO DE OBRA-Muros de Albañileria"],
  ["234072101", "010203010", "Tarrajeo, Revoques Y Enlucido", "MANO DE OBRA-Tarrajeo, Revoques Y Enlucido"],
  ["234072201", "010203015", "Contrapiso y Acabados en Cemento", "MANO DE OBRA-Contrapiso y Acabados en Cemento"],
  ["234070401", "010203020", "Pisos De Enchape Ceramico Y Porcelanato", "MANO DE OBRA-Pisos De Enchape Ceramico Y Porcelanato"],
  ["234072601", "010203025", "Otros Formatos de Pisos", "MANO DE OBRA-Mano De Obra"],
  ["234070301", "010203030", "Drywall Y Falso Cielo Raso", "MANO DE OBRA-Drywall Y Falso Cielo Raso"],
  ["234072701", "010203035", "Zocalos", "MANO DE OBRA-Mano De Obra"],
  ["234070501", "010203040", "Contrazocalos", "MANO DE OBRA-Mano De Obra"],
  ["234072801", "010203045", "Marmol, Granito, Cuarzo", "MANO DE OBRA-Marmol, Granito, Cuarzo"],
  ["234072901", "010203050", "Carpinteria De Melamina", "MANO DE OBRA-Carpinteria De Melamina"],
  ["234070601", "010203055", "Carpinteria De Madera", "MANO DE OBRA-Carpinteria De Madera"],
  ["234071101", "010203060", "Carpinteria Metalica", "MANO DE OBRA-Carpinteria Metalica"],
  ["234071201", "010203065", "Vidrios Y Cristales", "MANO DE OBRA-Vidrios Y Cristales"],
  ["234073001", "010203070", "Cerrajeria", "MANO DE OBRA-Cerrajeria"],
  ["234071801", "010203075", "Placas y acabados Electricas", "MANO DE OBRA-Placas y acabados Electricas"],
  ["234071401", "010203080", "Aparatos Sanitarios y Accesorios", "MANO DE OBRA-Aparatos Sanitarios y Accesorios"],
  ["234071501", "010203085", "Griferia", "MANO DE OBRA-Griferia"],
  ["234070201", "010203090", "Coberturas", "MANO DE OBRA-Coberturas"],
  ["234071601", "010203095", "Pintura y Recubrimiento", "MANO DE OBRA-Pintura y Recubrimiento"],
  ["234071901", "010203100", "Jardineria Interior", "MANO DE OBRA-Jardineria Interior"],
  ["234071901", "010203105", "Jardineria Exterior", "MANO DE OBRA-Jardineria Exterior"],
  ["234073201", "010203110", "Otros, Obras Exteriores", "MANO DE OBRA-Otros, Obras Exteriores"],
  ["234071701", "010203115", "Papel y Molduras", "MANO DE OBRA-Papel y Molduras"],
  ["234073301", "010203120", "Varios - Arquitectura", "MANO DE OBRA-Varios - Arquitectura"],
  ["234073401", "010203125", "Indeci", "MANO DE OBRA-INDECI"],
  ["234090301", "010204005", "IIEE, Voz y Data en Casco", "MANO DE OBRA-IIEE, Voz y Data en Casco"],
  ["234090201", "010204010", "IIEE, Voz Y Data En Acabados", "MANO DE OBRA-IIEE, Voz Y Data En Acabados"],
  ["234090501", "010204015", "Cables Alimentadores", "MANO DE OBRA-Mano De Obra"],
  ["234090601", "010204020", "Tableros Electricos", "MANO DE OBRA-Mano De Obra"],
  ["234080101", "010205005", "IISS Redes De Agua Y Desague", "MANO DE OBRA-IISS Redes De Agua Y Desague"],
  ["234080401", "010205010", "A.C.I.", "MANO DE OBRA-A.C.I."],
  ["234120102", "010303001", "Gastos de Personal ( Sueldos Staff)", "GASTOS DE PERSONAL"],
]

const ACCOUNTING_PARTIDA_BY_CODE = new Map()
const ACCOUNTING_PARTIDA_BY_DESCRIPTION = new Map()

ACCOUNTING_PARTIDA_ROWS.forEach(([accountingCode, s10Code, s10Description, accountingDescription]) => {
  const entry = {
    s10Code: normalizeCode(s10Code),
    accountingCode: normalizeCode(accountingCode),
    s10Description: String(s10Description || "").trim(),
    accountingDescription: String(accountingDescription || "").trim(),
  }

  ACCOUNTING_PARTIDA_BY_CODE.set(normalizeCodeKey(entry.s10Code), entry)
  ACCOUNTING_PARTIDA_BY_DESCRIPTION.set(normalizeText(entry.s10Description), entry)
})

function findByDescription(description) {
  const normalized = normalizeText(description)
  if (!normalized) return null

  const exactMatch = ACCOUNTING_PARTIDA_BY_DESCRIPTION.get(normalized)
  if (exactMatch) return exactMatch

  for (const [mappedDescription, entry] of ACCOUNTING_PARTIDA_BY_DESCRIPTION.entries()) {
    if (
      mappedDescription === normalized ||
      mappedDescription.includes(normalized) ||
      normalized.includes(mappedDescription)
    ) {
      return entry
    }
  }

  return null
}

export function resolveAccountingPartida(partidaId, partidaNombre = "") {
  const codeMatch = ACCOUNTING_PARTIDA_BY_CODE.get(normalizeCodeKey(partidaId))
  if (codeMatch) return codeMatch

  const descriptionMatch = findByDescription(partidaNombre)
  if (descriptionMatch) return descriptionMatch

  return {
    s10Code: normalizeCode(partidaId),
    accountingCode: "",
    s10Description: String(partidaNombre || "").trim(),
    accountingDescription: "",
  }
}

