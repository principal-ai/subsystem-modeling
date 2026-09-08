/**
 * Host-owned view of WASM linear memory — alloc/copy helpers stay in the
 * browser process; the guest only sees raw pointers.
 */
export function writeBytes(memory: WebAssembly.Memory, bytes: Uint8Array): number {
  const ptr = 16; // showcase bump; real code would call guest alloc
  new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes);
  return ptr;
}

export function readU32(memory: WebAssembly.Memory, ptr: number): number {
  return new DataView(memory.buffer).getUint32(ptr, true);
}
