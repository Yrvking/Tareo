import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

if (!hasSupabaseConfig) {
  console.warn("Faltan credenciales de Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)")
}

export const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null

function rowToRegistro(row) {
  return {
    id: row.id,
    workerId: row.worker_id,
    workerNombre: row.worker_nombre,
    frenteId: row.frente_id,
    frenteNombre: row.frente_nombre,
    date: row.tareo_date,
    timestamp: row.time_stamp,
    raw: row.raw_text,
    assignments: row.assignments || []
  }
}

function registroToRow(reg) {
  return {
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
}

async function appendRegistroLog(action, registroId, beforeData = null, afterData = null, source = null) {
  if (!supabase) return

  let actor = 'anon'
  try {
    const { data } = await supabase.auth.getUser()
    actor = data?.user?.email || data?.user?.id || 'anon'
  } catch {
    actor = 'anon'
  }

  const { error } = await supabase
    .from('registros_logs')
    .insert([
      {
        registro_id: registroId || null,
        action,
        actor,
        source: source || null,
        before_data: beforeData,
        after_data: afterData,
        changed_at: new Date().toISOString()
      }
    ])

  if (error) {
    console.warn('No se pudo guardar log en registros_logs:', error.message)
  }
}

// Función para obtener los registros (por día o rango semanal)
export async function fetchRegistros(startDate = null, endDate = null) {
  if (!supabase) return []

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
  
  return (data || []).map(rowToRegistro)
}

// Función para insertar un registro individual y devolver la ID
export async function insertRegistro(reg) {
  if (!supabase) {
    throw new Error('SUPABASE_CONFIG_MISSING')
  }

  const row = registroToRow(reg)

  const { data, error } = await supabase
    .from('registros')
    .insert([row])
    .select()

  if (error) {
    console.error('Error insertRegistro:', error)
    throw error
  }
  
  const createdId = data && data.length > 0 ? data[0].id : null
  await appendRegistroLog('insert', createdId, null, row, reg.raw)
  return createdId
}

export async function updateRegistro(reg, options = {}) {
  if (!supabase) {
    throw new Error('SUPABASE_CONFIG_MISSING')
  }
  if (!reg?.id) {
    throw new Error('REGISTRO_ID_REQUIRED')
  }

  let beforeData = options.beforeData || null
  if (!beforeData) {
    const { data: current } = await supabase
      .from('registros')
      .select('*')
      .eq('id', reg.id)
      .maybeSingle()

    beforeData = current ? rowToRegistro(current) : null
  }

  const row = registroToRow(reg)
  const { data, error } = await supabase
    .from('registros')
    .update(row)
    .eq('id', reg.id)
    .select()

  if (error) {
    console.error('Error updateRegistro:', error)
    throw error
  }

  if (!data || data.length === 0) {
    throw new Error('UPDATE_NOT_APPLIED')
  }

  await appendRegistroLog('update', reg.id, beforeData, rowToRegistro(data?.[0] || { id: reg.id, ...row }), options.source || reg.raw)
  return data?.[0]?.id || reg.id
}

export async function deleteRegistroById(id, options = {}) {
  if (!supabase) {
    throw new Error('SUPABASE_CONFIG_MISSING')
  }
  if (!id) {
    throw new Error('REGISTRO_ID_REQUIRED')
  }

  let beforeData = options.beforeData || null
  if (!beforeData) {
    const { data: current } = await supabase
      .from('registros')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    beforeData = current ? rowToRegistro(current) : null
  }

  const { error } = await supabase
    .from('registros')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleteRegistroById:', error)
    throw error
  }

  // Verificar que la fila realmente se eliminó (RLS puede silenciar el DELETE)
  const { data: stillExists } = await supabase
    .from('registros')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (stillExists) {
    const err = new Error('El registro no se pudo eliminar. Verifica los permisos en Supabase (RLS).')
    err.code = 'DELETE_BLOCKED'
    throw err
  }

  await appendRegistroLog('delete', id, beforeData, null, options.source || 'delete')
}
