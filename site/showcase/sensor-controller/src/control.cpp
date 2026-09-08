#include "control.hpp"

Command ControlLogic::decide(float celsius) const {
  if (celsius < kLow) return Command::Heat;
  if (celsius > kHigh) return Command::Cool;
  return Command::Off;
}
