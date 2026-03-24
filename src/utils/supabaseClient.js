import { createClient } from "@supabase/supabase-js"
import {
  countQueueItems,
  deleteQueueItem,
  deleteRegistroLocal,
  getAllQueueItems,
  getQueueItem,
  getRegistroLocal,
  getRegistroLocalByRemoteId,
  getRegistrosLocalByRange,
  putQueueItem,
  putRegistroLocal,
  putManyRegistrosLocal,
} from "./offlineDb"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

if (!hasSupabaseConfig) {
  console.warn("Faltan credenciales de Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)")
}

export const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null

const DATA_EVENT = "tareador:data-changed"
const SYNC_EVENT = "tareador:sync-status"
let appSettingsTableMissing = false

function isNavigatorOnline() {
  if (typeof navigator === "undefined") return true
  return navigator.onLine !== false
}

function canReachSupabase() {
  return Boolean(supabase && isNavigatorOnline())
}

function dispatchBrowserEvent(eventName, detail = {}) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return
  window.dispatchEvent(new CustomEvent(eventName, { detail }))
}

async function emitSyncStatus(detail = {}) {
  let pendingCount = 0
  try {
    pendingCount = await countQueueItems()
  } catch {
    pendingCount = 0
  }

  dispatchBrowserEvent(SYNC_EVENT, {
    pendingCount,
    online: isNavigatorOnline(),
    ...detail,
  })
}

function emitDataChanged(detail = {}) {
  dispatchBrowserEvent(DATA_EVENT, detail)
}

function createLocalId(prefix = "local") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sortRegistros(registros = []) {
  return [...registros].sort((a, b) => {
    if (a.date !== b.date) return String(a.date).localeCompare(String(b.date))
    return String(a.timestamp || "").localeCompare(String(b.timestamp || ""))
  })
}

function sanitizeAssignments(assignments = []) {
  return Array.isArray(assignments) ? assignments.map((assignment) => ({ ...assignment })) : []
}

function localRecordToRegistro(record) {
  return {
    id: record.id,
    remoteId: record.remoteId || null,
    syncStatus: record.syncStatus || "synced",
    workerId: record.workerId,
    workerNombre: record.workerNombre,
    frenteId: record.frenteId,
    frenteNombre: record.frenteNombre,
    date: record.date,
    timestamp: record.timestamp,
    raw: record.raw,
    assignments: sanitizeAssignments(record.assignments),
  }
}

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
    assignments: sanitizeAssignments(row.assignments),
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
    assignments: sanitizeAssignments(reg.assignments),
  }
}

function makeLocalRecord(reg, overrides = {}) {
  const providedId = typeof reg.id === "string" ? reg.id : null
  const id = providedId || createLocalId(overrides.remoteId ? "remote" : "local")
  return {
    id,
    remoteId: overrides.remoteId ?? reg.remoteId ?? null,
    workerId: String(reg.workerId),
    workerNombre: reg.workerNombre,
    frenteId: reg.frenteId ? String(reg.frenteId) : null,
    frenteNombre: reg.frenteNombre || null,
    date: reg.date,
    timestamp: reg.timestamp,
    raw: reg.raw || "",
    assignments: sanitizeAssignments(reg.assignments),
    syncStatus: overrides.syncStatus || reg.syncStatus || "synced",
    deleted: overrides.deleted ?? reg.deleted ?? false,
    updatedAt: overrides.updatedAt || new Date().toISOString(),
    lastSyncedAt: overrides.lastSyncedAt || reg.lastSyncedAt || null,
  }
}

async function appendRegistroLog(action, registroId, beforeData = null, afterData = null, source = null) {
  if (!supabase) return

  let actor = "anon"
  try {
    const { data } = await supabase.auth.getUser()
    actor = data?.user?.email || data?.user?.id || "anon"
  } catch {
    actor = "anon"
  }

  const { error } = await supabase
    .from("registros_logs")
    .insert([
      {
        registro_id: registroId || null,
        action,
        actor,
        source: source || null,
        before_data: beforeData,
        after_data: afterData,
        changed_at: new Date().toISOString(),
      },
    ])

  if (error) {
    console.warn("No se pudo guardar log en registros_logs:", error.message)
  }
}

function shouldSilenceAppSettings(error) {
  const message = String(error?.message || "")
  return error?.code === "42P01" || message.includes("app_settings") || message.includes("does not exist")
}

async function fetchRemoteRegistros(startDate = null, endDate = null) {
  if (!supabase) return []

  let query = supabase.from("registros").select("*").order("tareo_date", { ascending: true })

  if (startDate && endDate) {
    query = query.gte("tareo_date", startDate).lte("tareo_date", endDate)
  } else if (startDate) {
    query = query.eq("tareo_date", startDate)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function remoteInsertRegistroRow(row, source = null) {
  const { data, error } = await supabase.from("registros").insert([row]).select()
  if (error) throw error

  const created = data?.[0] || null
  const createdId = created?.id || null
  await appendRegistroLog("insert", createdId, null, row, source)
  return created
}

async function remoteUpdateRegistroRow(remoteId, row, source = null, beforeData = null) {
  const { data, error } = await supabase
    .from("registros")
    .update(row)
    .eq("id", remoteId)
    .select()

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error("UPDATE_NOT_APPLIED")
  }

  const updated = data[0]
  await appendRegistroLog("update", remoteId, beforeData, rowToRegistro(updated), source)
  return updated
}

async function remoteDeleteRegistro(remoteId, beforeData = null, source = null) {
  const { error } = await supabase.from("registros").delete().eq("id", remoteId)
  if (error) throw error

  const { data: stillExists } = await supabase
    .from("registros")
    .select("id")
    .eq("id", remoteId)
    .maybeSingle()

  if (stillExists) {
    const err = new Error("El registro no se pudo eliminar. Verifica los permisos en Supabase (RLS).")
    err.code = "DELETE_BLOCKED"
    throw err
  }

  await appendRegistroLog("delete", remoteId, beforeData, null, source || "delete")
}

async function upsertRemoteRowsIntoLocal(rows = [], startDate = null, endDate = null) {
  const remoteIds = new Set(rows.map((row) => row.id))
  const now = new Date().toISOString()
  const updates = []

  for (const row of rows) {
    const existing = await getRegistroLocalByRemoteId(row.id)
    if (existing && existing.syncStatus && existing.syncStatus !== "synced") {
      continue
    }

    updates.push({
      ...(existing || {}),
      id: existing?.id || createLocalId("remote"),
      remoteId: row.id,
      workerId: String(row.worker_id),
      workerNombre: row.worker_nombre,
      frenteId: row.frente_id ? String(row.frente_id) : null,
      frenteNombre: row.frente_nombre || null,
      date: row.tareo_date,
      timestamp: row.time_stamp,
      raw: row.raw_text || "",
      assignments: sanitizeAssignments(row.assignments),
      deleted: false,
      syncStatus: "synced",
      updatedAt: now,
      lastSyncedAt: now,
    })
  }

  if (updates.length > 0) {
    await putManyRegistrosLocal(updates)
  }

  if (startDate || endDate) {
    const localRecords = await getRegistrosLocalByRange(startDate, endDate)
    for (const localRecord of localRecords) {
      if (
        localRecord.remoteId &&
        localRecord.syncStatus === "synced" &&
        !remoteIds.has(localRecord.remoteId)
      ) {
        await deleteRegistroLocal(localRecord.id)
      }
    }
  }
}

async function enqueueRecord(recordId, type, payload = null, remoteId = null) {
  const current = await getQueueItem(recordId)
  const now = new Date().toISOString()
  await putQueueItem({
    recordId,
    type,
    remoteId: remoteId ?? current?.remoteId ?? null,
    payload,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  })
  await emitSyncStatus()
}

async function clearQueuedRecord(recordId) {
  await deleteQueueItem(recordId)
  await emitSyncStatus()
}

async function storePendingCreate(reg) {
  const localRecord = makeLocalRecord(reg, { syncStatus: "pending_create" })
  await putRegistroLocal(localRecord)
  await enqueueRecord(localRecord.id, "create", localRecord, null)
  emitDataChanged({ reason: "insert_pending" })
  return { id: localRecord.id, syncStatus: "pending_create" }
}

async function storePendingUpdate(reg, existingRecord) {
  const updatedRecord = makeLocalRecord(
    { ...existingRecord, ...reg, id: existingRecord.id, remoteId: existingRecord.remoteId },
    { syncStatus: existingRecord.remoteId ? "pending_update" : "pending_create" }
  )

  await putRegistroLocal(updatedRecord)
  await enqueueRecord(
    updatedRecord.id,
    updatedRecord.remoteId ? "update" : "create",
    updatedRecord,
    updatedRecord.remoteId
  )
  emitDataChanged({ reason: "update_pending" })
  return {
    id: updatedRecord.id,
    syncStatus: updatedRecord.syncStatus,
  }
}

async function storePendingDelete(existingRecord) {
  if (!existingRecord.remoteId && existingRecord.syncStatus === "pending_create") {
    await deleteRegistroLocal(existingRecord.id)
    await clearQueuedRecord(existingRecord.id)
    emitDataChanged({ reason: "delete_local_only" })
    return { id: existingRecord.id, syncStatus: "deleted_local" }
  }

  const deletedRecord = {
    ...existingRecord,
    deleted: true,
    syncStatus: "pending_delete",
    updatedAt: new Date().toISOString(),
  }
  await putRegistroLocal(deletedRecord)
  await enqueueRecord(deletedRecord.id, "delete", null, deletedRecord.remoteId)
  emitDataChanged({ reason: "delete_pending" })
  return { id: deletedRecord.id, syncStatus: "pending_delete" }
}

async function getLocalRangeRecords(startDate = null, endDate = null) {
  const localRecords = await getRegistrosLocalByRange(startDate, endDate)
  return localRecords
    .filter((record) => !record.deleted)
    .map(localRecordToRegistro)
}

export async function fetchAppSettings(settingKey = "catalogs") {
  if (!supabase || appSettingsTableMissing) return null

  const { data, error } = await supabase
    .from("app_settings")
    .select("payload, updated_at")
    .eq("setting_key", settingKey)
    .maybeSingle()

  if (error) {
    if (shouldSilenceAppSettings(error)) {
      appSettingsTableMissing = true
      console.warn("No se encontró la tabla app_settings. Se usará almacenamiento local.", error.message)
      return null
    }
    console.warn("No se pudo leer app_settings:", error.message)
    return null
  }

  return data?.payload || null
}

export async function saveAppSettings(payload, settingKey = "catalogs") {
  if (!supabase || appSettingsTableMissing) return false

  const { error } = await supabase
    .from("app_settings")
    .upsert(
      [
        {
          setting_key: settingKey,
          payload,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "setting_key" }
    )

  if (error) {
    if (shouldSilenceAppSettings(error)) {
      appSettingsTableMissing = true
      console.warn("No se encontró la tabla app_settings. Se conservará solo almacenamiento local.", error.message)
      return false
    }
    console.warn("No se pudo guardar app_settings:", error.message)
    return false
  }

  return true
}

export async function fetchRegistros(startDate = null, endDate = null) {
  if (canReachSupabase()) {
    try {
      const remoteRows = await fetchRemoteRegistros(startDate, endDate)
      await upsertRemoteRowsIntoLocal(remoteRows, startDate, endDate)
    } catch (error) {
      console.warn("No se pudo refrescar registros desde Supabase. Se usará la copia local.", error.message)
    }
  }

  const localRecords = await getLocalRangeRecords(startDate, endDate)
  return sortRegistros(localRecords)
}

export async function insertRegistro(reg) {
  if (!supabase && typeof indexedDB === "undefined") {
    throw new Error("SUPABASE_CONFIG_MISSING")
  }

  const localId = typeof reg.id === "string" ? reg.id : createLocalId("local")
  const normalizedReg = {
    ...reg,
    id: localId,
    workerId: String(reg.workerId),
    frenteId: reg.frenteId ? String(reg.frenteId) : null,
    assignments: sanitizeAssignments(reg.assignments),
  }

  if (canReachSupabase()) {
    try {
      const insertedRow = await remoteInsertRegistroRow(registroToRow(normalizedReg), normalizedReg.raw)
      const syncedRecord = makeLocalRecord(normalizedReg, {
        remoteId: insertedRow?.id || null,
        syncStatus: "synced",
        lastSyncedAt: new Date().toISOString(),
      })
      await putRegistroLocal(syncedRecord)
      await clearQueuedRecord(syncedRecord.id)
      emitDataChanged({ reason: "insert_synced" })
      return { id: syncedRecord.id, syncStatus: "synced" }
    } catch (error) {
      console.warn("Insert offline fallback:", error.message)
    }
  }

  return storePendingCreate(normalizedReg)
}

export async function updateRegistro(reg, options = {}) {
  if ((!supabase || !hasSupabaseConfig) && typeof indexedDB === "undefined") {
    throw new Error("SUPABASE_CONFIG_MISSING")
  }
  if (!reg?.id) {
    throw new Error("REGISTRO_ID_REQUIRED")
  }

  const existingRecord =
    (await getRegistroLocal(reg.id)) ||
    (options.beforeData ? makeLocalRecord(options.beforeData, {
      remoteId: options.beforeData.remoteId ?? null,
      syncStatus: options.beforeData.remoteId ? "synced" : "pending_create",
    }) : null)

  if (!existingRecord) {
    throw new Error("REGISTRO_NOT_FOUND_LOCAL")
  }

  const normalizedReg = {
    ...reg,
    id: existingRecord.id,
    remoteId: existingRecord.remoteId,
    assignments: sanitizeAssignments(reg.assignments),
  }

  if (canReachSupabase() && existingRecord.remoteId) {
    try {
      const updatedRow = await remoteUpdateRegistroRow(
        existingRecord.remoteId,
        registroToRow(normalizedReg),
        options.source || reg.raw,
        options.beforeData || localRecordToRegistro(existingRecord)
      )

      const syncedRecord = makeLocalRecord(normalizedReg, {
        remoteId: updatedRow?.id || existingRecord.remoteId,
        syncStatus: "synced",
        lastSyncedAt: new Date().toISOString(),
      })
      await putRegistroLocal(syncedRecord)
      await clearQueuedRecord(syncedRecord.id)
      emitDataChanged({ reason: "update_synced" })
      return { id: syncedRecord.id, syncStatus: "synced" }
    } catch (error) {
      console.warn("Update offline fallback:", error.message)
    }
  }

  return storePendingUpdate(normalizedReg, existingRecord)
}

export async function deleteRegistroById(id, options = {}) {
  if ((!supabase || !hasSupabaseConfig) && typeof indexedDB === "undefined") {
    throw new Error("SUPABASE_CONFIG_MISSING")
  }
  if (!id) {
    throw new Error("REGISTRO_ID_REQUIRED")
  }

  const existingRecord =
    (await getRegistroLocal(id)) ||
    (options.beforeData
      ? makeLocalRecord(options.beforeData, {
          remoteId: options.beforeData.remoteId ?? null,
          syncStatus: options.beforeData.remoteId ? "synced" : "pending_create",
        })
      : null)

  if (!existingRecord) {
    return { id, syncStatus: "deleted_local" }
  }

  if (canReachSupabase() && existingRecord.remoteId) {
    try {
      await remoteDeleteRegistro(
        existingRecord.remoteId,
        options.beforeData || localRecordToRegistro(existingRecord),
        options.source || "delete"
      )
      await deleteRegistroLocal(existingRecord.id)
      await clearQueuedRecord(existingRecord.id)
      emitDataChanged({ reason: "delete_synced" })
      return { id: existingRecord.id, syncStatus: "synced" }
    } catch (error) {
      console.warn("Delete offline fallback:", error.message)
    }
  }

  return storePendingDelete(existingRecord)
}

export async function syncPendingRegistros() {
  const baseResult = { synced: 0, failed: 0, pending: 0 }

  if (!canReachSupabase()) {
    baseResult.pending = await countQueueItems()
    await emitSyncStatus({ syncing: false })
    return baseResult
  }

  await emitSyncStatus({ syncing: true })

  const queueItems = await getAllQueueItems()
  const orderedItems = [...queueItems].sort((a, b) => {
    const aTime = String(a.updatedAt || a.createdAt || "")
    const bTime = String(b.updatedAt || b.createdAt || "")
    return aTime.localeCompare(bTime)
  })

  const result = { synced: 0, failed: 0, pending: orderedItems.length }

  for (const item of orderedItems) {
    const localRecord = await getRegistroLocal(item.recordId)

    try {
      if (item.type === "create") {
        if (!localRecord || localRecord.deleted) {
          await clearQueuedRecord(item.recordId)
          continue
        }

        const createdRow = await remoteInsertRegistroRow(registroToRow(localRecord), localRecord.raw)
        await putRegistroLocal({
          ...localRecord,
          remoteId: createdRow?.id || null,
          syncStatus: "synced",
          deleted: false,
          lastSyncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        await clearQueuedRecord(item.recordId)
        result.synced++
        continue
      }

      if (item.type === "update") {
        if (!localRecord || localRecord.deleted) {
          await clearQueuedRecord(item.recordId)
          continue
        }

        if (!localRecord.remoteId) {
          const createdRow = await remoteInsertRegistroRow(registroToRow(localRecord), localRecord.raw)
          await putRegistroLocal({
            ...localRecord,
            remoteId: createdRow?.id || null,
            syncStatus: "synced",
            lastSyncedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        } else {
          await remoteUpdateRegistroRow(
            localRecord.remoteId,
            registroToRow(localRecord),
            localRecord.raw,
            localRecordToRegistro(localRecord)
          )
          await putRegistroLocal({
            ...localRecord,
            syncStatus: "synced",
            deleted: false,
            lastSyncedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        }

        await clearQueuedRecord(item.recordId)
        result.synced++
        continue
      }

      if (item.type === "delete") {
        const remoteId = item.remoteId || localRecord?.remoteId
        if (remoteId) {
          await remoteDeleteRegistro(
            remoteId,
            localRecord ? localRecordToRegistro(localRecord) : null,
            "sync_delete"
          )
        }
        if (localRecord) {
          await deleteRegistroLocal(localRecord.id)
        }
        await clearQueuedRecord(item.recordId)
        result.synced++
      }
    } catch (error) {
      console.warn("No se pudo sincronizar registro pendiente:", error.message)
      result.failed++

      if (localRecord) {
        await putRegistroLocal({
          ...localRecord,
          syncStatus: "error",
          updatedAt: new Date().toISOString(),
        })
      }
    }
  }

  result.pending = await countQueueItems()
  emitDataChanged({ reason: "sync_complete" })
  await emitSyncStatus({ syncing: false })
  return result
}

export async function getPendingSyncCount() {
  return countQueueItems()
}

export function getDataEventName() {
  return DATA_EVENT
}

export function getSyncEventName() {
  return SYNC_EVENT
}
