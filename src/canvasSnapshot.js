import { createTLStore } from 'tldraw'

export function isCanvasSnapshot(value) {
  return value && typeof value === 'object' && value.store && value.schema
}

export function firstErrorLine(error) {
  return error instanceof Error ? error.message.split('\n')[0] : String(error).split('\n')[0]
}

export function describeSkippedRecord(record, reason) {
  return {
    id: typeof record?.id === 'string' ? record.id : '(missing id)',
    typeName: typeof record?.typeName === 'string' ? record.typeName : '(missing typeName)',
    type: typeof record?.type === 'string' ? record.type : null,
    reason: firstErrorLine(reason)
  }
}

function getRecordDependencies(record) {
  const dependencies = []
  if (record?.typeName === 'shape') {
    if (typeof record.parentId === 'string') dependencies.push(record.parentId)
    if (record.type === 'image' && typeof record.props?.assetId === 'string') {
      dependencies.push(record.props.assetId)
    }
  }
  if (record?.typeName === 'binding') {
    const fromId = record.fromId ?? record.props?.fromId
    const toId = record.toId ?? record.props?.toId
    if (typeof fromId === 'string') dependencies.push(fromId)
    if (typeof toId === 'string') dependencies.push(toId)
  }
  return dependencies
}

function pruneRecordsWithMissingDependencies(store, skippedRecords) {
  const prunedStore = { ...store }
  let changed = true

  while (changed) {
    changed = false
    for (const record of Object.values(prunedStore)) {
      const missingDependency = getRecordDependencies(record).find((id) => !prunedStore[id])
      if (!missingDependency) continue

      delete prunedStore[record.id]
      skippedRecords.push(
        describeSkippedRecord(record, `Missing dependent record: ${missingDependency}`)
      )
      changed = true
    }
  }

  return prunedStore
}

export function sanitizeCanvasSnapshotForTldraw(snapshot) {
  if (!isCanvasSnapshot(snapshot)) {
    return { snapshot: null, skippedRecords: [] }
  }

  const validationStore = createTLStore()
  const skippedRecords = []
  let migratedSnapshot

  try {
    migratedSnapshot = validationStore.migrateSnapshot(snapshot)
  } catch (error) {
    return {
      snapshot: null,
      skippedRecords: [
        {
          id: '(snapshot)',
          typeName: 'snapshot',
          type: null,
          reason: firstErrorLine(error)
        }
      ]
    }
  }

  const validStore = {}
  for (const record of Object.values(migratedSnapshot.store)) {
    try {
      validationStore.put([record], 'initialize')
      validStore[record.id] = validationStore.get(record.id)
    } catch (error) {
      skippedRecords.push(describeSkippedRecord(record, error))
    }
  }

  return {
    snapshot: {
      schema: migratedSnapshot.schema,
      store: pruneRecordsWithMissingDependencies(validStore, skippedRecords)
    },
    skippedRecords
  }
}
