#include "actuator.hpp"

void Actuator::init() {
  // configure GPIO / PWM
}

void Actuator::apply(Command cmd) {
  switch (cmd) {
    case Command::Heat:
      // gpio_set(HEATER_PIN, 1);
      break;
    case Command::Cool:
      // gpio_set(COOLER_PIN, 1);
      break;
    case Command::Off:
      // gpio_set(HEATER_PIN, 0); gpio_set(COOLER_PIN, 0);
      break;
  }
}
