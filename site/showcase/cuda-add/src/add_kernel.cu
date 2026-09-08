/** Device kernel — element-wise add on the GPU. */
__global__ void add_kernel(const float *a, const float *b, float *out, int n) {
  int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n) {
    out[i] = a[i] + b[i];
  }
}
