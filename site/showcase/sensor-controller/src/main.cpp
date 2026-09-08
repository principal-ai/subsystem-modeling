/**
 * Embedded control loop — read a sensor, decide, drive an actuator.
 *
 * Typical MCU / IoT firmware shape: one forever tick, hardware as the edges.
 */
#include "sensor.hpp"
#include "control.hpp"
#include "actuator.hpp"

int main() {
  Sensor sensor;
  Actuator actuator;
  ControlLogic control;

  sensor.init();
  actuator.init();

  while (true) {
    const float reading = sensor.read();
    const Command cmd = control.decide(reading);
    actuator.apply(cmd);
  }
}
