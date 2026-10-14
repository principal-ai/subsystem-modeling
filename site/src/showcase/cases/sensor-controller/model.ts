import type {
  SubsystemComponent,
  SubsystemTrail,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/sensor-controller';

export const components: SubsystemComponent[] = [
  {
    alias: 'main',
    process: 'sensor-controller',
    name: 'main',
    construct: 'function',
    symbol: 'main',
    role: 'entry',
    purl: PURL,
    file: 'src/main.cpp',
    declarationSpan: {
      startLine: 10,
      endLine: 10,
      contentHash: '775b36031c81d0d71f6c4f6b390810ed',
    },
    purpose: 'Firmware entry — init hardware, then forever control tick.',
    layer: 1,
  },
  {
    alias: 'sensor',
    process: 'sensor-controller',
    name: 'Sensor',
    construct: 'class',
    symbol: 'Sensor',
    purl: PURL,
    file: 'src/sensor.cpp',
    declarationSpan: {
      startLine: 3,
      endLine: 3,
      contentHash: '836c350bc7c5318d33d2581c0ba65003',
    },
    purpose: 'ADC / I2C read path — engineering units from hardware.',
    layer: 2,
  },
  {
    alias: 'control-logic',
    process: 'sensor-controller',
    name: 'ControlLogic',
    construct: 'class',
    symbol: 'ControlLogic',
    purl: PURL,
    file: 'src/control.cpp',
    declarationSpan: {
      startLine: 3,
      endLine: 3,
      contentHash: 'cbad614745551f5a52f3aee5c744ae56',
    },
    purpose: 'Threshold decision — no hardware I/O.',
    layer: 2,
  },
  {
    alias: 'actuator',
    process: 'sensor-controller',
    name: 'Actuator',
    construct: 'class',
    symbol: 'Actuator',
    purl: PURL,
    file: 'src/actuator.cpp',
    declarationSpan: {
      startLine: 3,
      endLine: 3,
      contentHash: '1eb26c660c7c94d1066672602b01c879',
    },
    purpose: 'GPIO / PWM write path — apply Heat/Cool/Off.',
    layer: 2,
  },
  {
    alias: 'SensorHW',
    name: 'Sensor hardware',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Temperature probe / ADC.',
    layer: 3,
  },
  {
    alias: 'ActuatorHW',
    name: 'Actuator hardware',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Heater / cooler outputs.',
    layer: 3,
  },
];

export const trails = [
  {
    "id": "tl-tick",
    "title": "Control loop tick",
    "steps": [
      {
        "from": "main",
        "to": "sensor",
        "mechanism": "calls",
        "file": "src/main.cpp",
        "span": {
          "startLine": 19,
          "endLine": 19,
          "contentHash": "9386aaebe1b6b5d31aa65169a0ed7fd5"
        },
        "purl": PURL,
        "symbol": "sensor.read",
        "annotation": "One tick starts with a fresh sample."
      },
      {
        "from": "sensor",
        "to": "SensorHW",
        "mechanism": "reads",
        "file": "src/sensor.cpp",
        "span": {
          "startLine": 7,
          "endLine": 7,
          "contentHash": "cb9298222cf8e57f92bb5e0fb56095b3"
        },
        "purl": PURL,
        "symbol": "read",
        "annotation": "ADC → engineering units (hardware read)."
      },
      {
        "from": "main",
        "to": "control-logic",
        "mechanism": "calls",
        "file": "src/main.cpp",
        "span": {
          "startLine": 20,
          "endLine": 20,
          "contentHash": "0c1bd320ba4ca1214bda11b3b477c658"
        },
        "purl": PURL,
        "symbol": "control.decide",
        "annotation": "Pure decision — Heat / Cool / Off."
      },
      {
        "from": "main",
        "to": "actuator",
        "mechanism": "calls",
        "file": "src/main.cpp",
        "span": {
          "startLine": 21,
          "endLine": 21,
          "contentHash": "439272a8ea48668763ff7b5de448be2a"
        },
        "purl": PURL,
        "symbol": "actuator.apply",
        "annotation": "Drive outputs for this tick."
      },
      {
        "from": "actuator",
        "to": "ActuatorHW",
        "mechanism": "writes",
        "file": "src/actuator.cpp",
        "span": {
          "startLine": 7,
          "endLine": 7,
          "contentHash": "ac45f986007b8d65a99cb7933fb4c1da"
        },
        "purl": PURL,
        "symbol": "apply",
        "annotation": "GPIO/PWM write to actuator hardware."
      }
    ]
  },
  {
    "id": "tl-heat",
    "title": "Below threshold → heat",
    "steps": [
      {
        "from": "main",
        "to": "sensor",
        "mechanism": "calls",
        "file": "src/main.cpp",
        "span": {
          "startLine": 19,
          "endLine": 19,
          "contentHash": "9386aaebe1b6b5d31aa65169a0ed7fd5"
        },
        "purl": PURL,
        "symbol": "sensor.read",
        "annotation": "Sample comes in cold."
      },
      {
        "from": "main",
        "to": "control-logic",
        "mechanism": "calls",
        "file": "src/control.cpp",
        "span": {
          "startLine": 4,
          "endLine": 4,
          "contentHash": "75efa18e1e300900bc1a0f12cf357c9c"
        },
        "purl": PURL,
        "symbol": "decide",
        "annotation": "celsius < kLow → Command::Heat."
      },
      {
        "from": "main",
        "to": "actuator",
        "mechanism": "calls",
        "file": "src/main.cpp",
        "span": {
          "startLine": 21,
          "endLine": 21,
          "contentHash": "439272a8ea48668763ff7b5de448be2a"
        },
        "purl": PURL,
        "symbol": "actuator.apply",
        "annotation": "Apply Heat for this tick."
      },
      {
        "from": "actuator",
        "to": "ActuatorHW",
        "mechanism": "writes",
        "file": "src/actuator.cpp",
        "span": {
          "startLine": 9,
          "endLine": 9,
          "contentHash": "b800b79bbe924e5d4a613007199317f8"
        },
        "purl": PURL,
        "symbol": "Command::Heat",
        "annotation": "Heater pin asserted."
      }
    ]
  }
] as SubsystemTrail[];

export const title = 'Sensor → actuator';

export const description =
  'Embedded **C++** control loop: read a sensor, run threshold logic, drive an actuator. Hardware shows up as externals. Open **Trails** for a generic tick and the heat path.';
