/**
 * Host: allocate device buffers, launch kernel, copy results back.
 */
#include <cuda_runtime.h>
#include <cstdio>

__global__ void add_kernel(const float *a, const float *b, float *out, int n);

int main() {
  const int n = 1024;
  const size_t bytes = n * sizeof(float);

  float *h_a = new float[n];
  float *h_b = new float[n];
  float *h_out = new float[n];
  for (int i = 0; i < n; ++i) {
    h_a[i] = 1.0f;
    h_b[i] = 2.0f;
  }

  float *d_a = nullptr, *d_b = nullptr, *d_out = nullptr;
  cudaMalloc(&d_a, bytes);
  cudaMalloc(&d_b, bytes);
  cudaMalloc(&d_out, bytes);

  cudaMemcpy(d_a, h_a, bytes, cudaMemcpyHostToDevice);
  cudaMemcpy(d_b, h_b, bytes, cudaMemcpyHostToDevice);

  add_kernel<<<(n + 255) / 256, 256>>>(d_a, d_b, d_out, n);
  cudaDeviceSynchronize();

  cudaMemcpy(h_out, d_out, bytes, cudaMemcpyDeviceToHost);

  cudaFree(d_a);
  cudaFree(d_b);
  cudaFree(d_out);
  delete[] h_a;
  delete[] h_b;
  delete[] h_out;
  return 0;
}
