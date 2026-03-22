import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Faltan credenciales de Supabase en el archivo .env")
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "")

// Función para obtener los registros (por día o rango semanal)
export async function fetchRegistros(startDate = null, endDate = null) {
  let query = supabase.from('registros').select('*').order('tareo_date', { ascending: true })
  
  if (startDate && endDate) {
    query = query.gte('tareo_date', startDate).lte('tareo_date', endDate)
  } else if (startDate) {
    query = query.eq('tareo_date', startDate)
  }

  const { data, error } = await query
  
  if (error) {
    console.error('Error fetching registros:', error)
    return []
  }
  
  return (data || []).map(row => ({
    id: row.id,
    workerId: row.worker_id,
    workerNombre: row.worker_nombre,
    frenteId: row.frente_id,
    frenteNombre: row.frente_nombre,
    date: row.tareo_date,
    timestamp: row.time_stamp,
    raw: row.raw_text,
    assignments: row.assignments || []
  }))
}

// Función para insertar un registro individual y devolver la ID
export async function insertRegistro(reg) {
  const { data, error } = await supabase
    .from('registros')
    .insert([
      {
        record_time: Date.now(),
        worker_id: String(reg.workerId),
        worker_nombre: reg.workerNombre,
        frente_id: reg.frenteId ? String(reg.frenteId) : null,
        frente_nombre: reg.frenteNombre || null,
        tareo_date: reg.date,
        time_stamp: reg.timestamp,
        raw_text: reg.raw,
        assignments: reg.assignments
      }
    ])
    .select()

  if (error) {
    console.error('Error insertRegistro:', error)
    throw error
  }
  
  return data && data.length > 0 ? data[0].id : null
}
