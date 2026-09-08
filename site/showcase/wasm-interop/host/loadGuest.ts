/**
 * Host-side loader — instantiates the guest module once and wires imports
 * the guest may call back into (guest → host boundary).
 */
export type GuestExports = {
  memory: WebAssembly.Memory;
  normalize: (ptr: number, len: number) => number;
  checksum: (ptr: number, len: number) => number;
  OUT_CHECKSUM_PTR: number;
};

export async function loadGuest(): Promise<GuestExports> {
  const result = await WebAssembly.instantiateStreaming(fetch('/pipeline.wasm'), {
    env: {
      /** Guest → host: progress/trace callback into the browser process. */
      host_trace: (code: number) => {
        console.debug('[wasm guest]', code);
      },
      abort: () => {
        throw new Error('wasm abort');
      },
    },
  });

  const exports = result.instance.exports as unknown as GuestExports & {
    out_checksum_ptr: () => number;
  };

  return {
    memory: exports.memory,
    normalize: exports.normalize,
    checksum: exports.checksum,
    OUT_CHECKSUM_PTR: exports.out_checksum_ptr(),
  };
}
