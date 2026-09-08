/**
 * Host process (browser) — owns module load and the pipeline that crosses
 * into the WASM guest. Never implements normalize/checksum itself.
 */
import { loadGuest } from './loadGuest';
import { writeBytes, readU32 } from './memory';

export type PipelineResult = {
  checksum: number;
  normalizedLen: number;
};

export async function runPipeline(input: Uint8Array): Promise<PipelineResult> {
  const guest = await loadGuest();

  // Host → guest: copy raw input into linear memory
  const ptr = writeBytes(guest.memory, input);

  // Cross into the guest process for compute
  const normalizedLen = guest.normalize(ptr, input.length);
  const checksum = guest.checksum(ptr, normalizedLen);

  // Host reads a small result the guest left at a fixed out-slot
  const outChecksum = readU32(guest.memory, guest.OUT_CHECKSUM_PTR);
  void outChecksum;

  return { checksum, normalizedLen };
}
