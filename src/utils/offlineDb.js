const DB_NAME = "tareador_offline_db"
const DB_VERSION = 1
const REGISTROS_STORE = "registros"
const QUEUE_STORE = "sync_queue"

let dbPromise = null

function isIndexedDbAvailable() {
  return typeof indexedDB !== "undefined"
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error || new Error("IDB_TRANSACTION_ABORTED"))
  })
}

function cursorToArray(request) {
  return new Promise((resolve, reject) => {
    const results = []

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(results)
        return
      }
      results.push(cursor.value)
      cursor.continue()
    }
  })
}

export async function openOfflineDb() {
  if (!isIndexedDbAvailable()) {
    throw new Error("INDEXED_DB_NOT_AVAILABLE")
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result

        if (!db.objectStoreNames.contains(REGISTROS_STORE)) {
          const registrosStore = db.createObjectStore(REGISTROS_STORE, { keyPath: "id" })
          registrosStore.createIndex("by_date", "date", { unique: false })
          registrosStore.createIndex("by_remote_id", "remoteId", { unique: false })
          registrosStore.createIndex("by_sync_status", "syncStatus", { unique: false })
        }

        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const queueStore = db.createObjectStore(QUEUE_STORE, { keyPath: "recordId" })
          queueStore.createIndex("by_updated_at", "updatedAt", { unique: false })
          queueStore.createIndex("by_type", "type", { unique: false })
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  return dbPromise
}

async function withStore(storeName, mode, runner) {
  const db = await openOfflineDb()
  const transaction = db.transaction(storeName, mode)
  const store = transaction.objectStore(storeName)
  const result = await runner(store, transaction)
  await transactionDone(transaction)
  return result
}

export async function getRegistroLocal(id) {
  return withStore(REGISTROS_STORE, "readonly", async (store) => {
    return requestToPromise(store.get(id))
  })
}

export async function getRegistroLocalByRemoteId(remoteId) {
  if (remoteId === null || remoteId === undefined || remoteId === "") return null

  return withStore(REGISTROS_STORE, "readonly", async (store) => {
    const index = store.index("by_remote_id")
    const matches = await cursorToArray(index.openCursor(IDBKeyRange.only(remoteId)))
    return matches[0] || null
  })
}

export async function putRegistroLocal(record) {
  return withStore(REGISTROS_STORE, "readwrite", async (store) => {
    return requestToPromise(store.put(record))
  })
}

export async function putManyRegistrosLocal(records = []) {
  return withStore(REGISTROS_STORE, "readwrite", async (store) => {
    for (const record of records) {
      store.put(record)
    }
    return records.length
  })
}

export async function deleteRegistroLocal(id) {
  return withStore(REGISTROS_STORE, "readwrite", async (store) => {
    store.delete(id)
    return true
  })
}

export async function getRegistrosLocalByRange(startDate = null, endDate = null) {
  return withStore(REGISTROS_STORE, "readonly", async (store) => {
    if (!startDate && !endDate) {
      return cursorToArray(store.openCursor())
    }

    const index = store.index("by_date")
    if (startDate && endDate) {
      return cursorToArray(index.openCursor(IDBKeyRange.bound(startDate, endDate)))
    }

    const dateKey = startDate || endDate
    return cursorToArray(index.openCursor(IDBKeyRange.only(dateKey)))
  })
}

export async function putQueueItem(item) {
  return withStore(QUEUE_STORE, "readwrite", async (store) => {
    return requestToPromise(store.put(item))
  })
}

export async function getQueueItem(recordId) {
  return withStore(QUEUE_STORE, "readonly", async (store) => {
    return requestToPromise(store.get(recordId))
  })
}

export async function deleteQueueItem(recordId) {
  return withStore(QUEUE_STORE, "readwrite", async (store) => {
    store.delete(recordId)
    return true
  })
}

export async function getAllQueueItems() {
  return withStore(QUEUE_STORE, "readonly", async (store) => {
    const index = store.index("by_updated_at")
    return cursorToArray(index.openCursor())
  })
}

export async function countQueueItems() {
  return withStore(QUEUE_STORE, "readonly", async (store) => {
    return requestToPromise(store.count())
  })
}
