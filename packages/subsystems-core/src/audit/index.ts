/**
 * Full audit surface (Node-only).
 *
 * Pure policy and types are re-exported from `./pure`; the engine and source
 * hashing live here because they touch the filesystem and Node crypto.
 */

export * from './pure'
export {
  buildAuditFingerprint,
  runSubsystemModelAudit,
  type AuditCallSiteClaim,
  type AuditEngineDeps,
  type AuditEngineResult,
  type AuditGraphifySlot,
  type AuditModel,
  type AuditModelFileCheck,
} from './engine'
export {
  buildSourceSpan,
  hashContentRange,
  normalizeDeclarationLine,
  parseSourceLocation,
} from './hash'
export * from './verify'
export {
  cacheSlotKey,
  createLocalGraphifyAuditProvider,
  LocalGraphifyCache,
  localGraphifyStoreRoot,
  sanitizePurlDirName,
  type CurrentLocalGraphifySlot,
  type LocalGraphifyConfig,
} from './local-graphify'
