//! WASM guest process — normalize then checksum. Calls back into the host
//! via `host_trace` so the guest→host boundary is visible.

extern "C" {
    fn host_trace(code: u32);
}

const TRACE_NORMALIZE: u32 = 1;
const TRACE_CHECKSUM: u32 = 2;

static mut OUT_CHECKSUM: u32 = 0;

#[no_mangle]
pub extern "C" fn out_checksum_ptr() -> *const u32 {
    unsafe { &OUT_CHECKSUM as *const u32 }
}

/// In-place ASCII lowercase + strip spaces. Returns new length.
#[no_mangle]
pub extern "C" fn normalize(ptr: *mut u8, len: usize) -> usize {
    unsafe {
        host_trace(TRACE_NORMALIZE);
        let buf = std::slice::from_raw_parts_mut(ptr, len);
        let mut w = 0;
        for i in 0..len {
            let b = buf[i];
            if b == b' ' {
                continue;
            }
            buf[w] = if (b'A'..=b'Z').contains(&b) { b + 32 } else { b };
            w += 1;
        }
        w
    }
}

/// Sum bytes; also stash the result where the host can read it back.
#[no_mangle]
pub extern "C" fn checksum(ptr: *const u8, len: usize) -> u32 {
    unsafe {
        host_trace(TRACE_CHECKSUM);
        let bytes = std::slice::from_raw_parts(ptr, len);
        let mut sum: u32 = 0;
        for b in bytes {
            sum = sum.wrapping_add(u32::from(*b));
        }
        OUT_CHECKSUM = sum;
        sum
    }
}
