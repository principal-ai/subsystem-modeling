#pragma once

/** Temperature (or similar) sensor driver — hardware read boundary. */
class Sensor {
public:
  void init();
  /** Degrees C (showcase). Blocks briefly for ADC sample. */
  float read();
};
