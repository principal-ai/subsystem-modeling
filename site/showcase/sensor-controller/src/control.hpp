#pragma once

enum class Command { Off, Heat, Cool };

/** Threshold controller — pure decision, no hardware I/O. */
class ControlLogic {
public:
  Command decide(float celsius) const;

private:
  static constexpr float kLow = 18.0f;
  static constexpr float kHigh = 24.0f;
};
