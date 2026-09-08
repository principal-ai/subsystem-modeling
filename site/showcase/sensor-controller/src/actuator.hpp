#pragma once

#include "control.hpp"

/** Heater / cooler driver — hardware write boundary. */
class Actuator {
public:
  void init();
  void apply(Command cmd);
};
