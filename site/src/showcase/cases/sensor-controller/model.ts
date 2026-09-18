import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/sensor-controller';

export const components: SubsystemComponent[] = [
  {
    id: 'main',
    process: 'sensor-controller',
    name: 'main',
    construct: 'function',
    symbol: 'main',
    role: 'entry',
    purl: PURL,
    file: 'src/main.cpp',
    declarationRef: {
      file: 'src/main.cpp',
      startLine: 10,
      lineHash: '775b36031c81d0d71f6c4f6b390810ed',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'Firmware entry — init hardware, then forever control tick.',
    layer: 1,
  },
  {
    id: 'sensor',
    process: 'sensor-controller',
    name: 'Sensor',
    construct: 'class',
    symbol: 'Sensor',
    purl: PURL,
    file: 'src/sensor.cpp',
    declarationRef: {
      file: 'src/sensor.cpp',
      startLine: 3,
      lineHash: '836c350bc7c5318d33d2581c0ba65003',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'ADC / I2C read path — engineering units from hardware.',
    layer: 2,
  },
  {
    id: 'control-logic',
    process: 'sensor-controller',
    name: 'ControlLogic',
    construct: 'class',
    symbol: 'ControlLogic',
    purl: PURL,
    file: 'src/control.cpp',
    declarationRef: {
      file: 'src/control.cpp',
      startLine: 3,
      lineHash: 'cbad614745551f5a52f3aee5c744ae56',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'Threshold decision — no hardware I/O.',
    layer: 2,
  },
  {
    id: 'actuator',
    process: 'sensor-controller',
    name: 'Actuator',
    construct: 'class',
    symbol: 'Actuator',
    purl: PURL,
    file: 'src/actuator.cpp',
    declarationRef: {
      file: 'src/actuator.cpp',
      startLine: 3,
      lineHash: '1eb26c660c7c94d1066672602b01c879',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'GPIO / PWM write path — apply Heat/Cool/Off.',
    layer: 2,
  },
  {
    id: 'SensorHW',
    name: 'Sensor hardware',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Temperature probe / ADC.',
    layer: 3,
  },
  {
    id: 'ActuatorHW',
    name: 'Actuator hardware',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Heater / cooler outputs.',
    layer: 3,
  },
];

export const relations = [] as SubsystemRelation[];

export const walkthroughs = [
  {
    "id": "tl-tick",
    "title": "Control loop tick",
    "steps": [
      {
        "from": "main",
        "to": "sensor",
        "mechanism": "calls",
        "file": "src/main.cpp",
        "line": 19,
        "symbol": "sensor.read",
        "annotation": "One tick starts with a fresh sample."
      },
      {
        "from": "sensor",
        "to": "SensorHW",
        "mechanism": "reads",
        "file": "src/sensor.cpp",
        "line": 7,
        "symbol": "read",
        "annotation": "ADC → engineering units (hardware read)."
      },
      {
        "from": "main",
        "to": "control-logic",
        "mechanism": "calls",
        "file": "src/main.cpp",
        "line": 20,
        "symbol": "control.decide",
        "annotation": "Pure decision — Heat / Cool / Off."
      },
      {
        "from": "main",
        "to": "actuator",
        "mechanism": "calls",
        "file": "src/main.cpp",
        "line": 21,
        "symbol": "actuator.apply",
        "annotation": "Drive outputs for this tick."
      },
      {
        "from": "actuator",
        "to": "ActuatorHW",
        "mechanism": "writes",
        "file": "src/actuator.cpp",
        "line": 7,
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
        "line": 19,
        "symbol": "sensor.read",
        "annotation": "Sample comes in cold."
      },
      {
        "from": "main",
        "to": "control-logic",
        "mechanism": "calls",
        "file": "src/control.cpp",
        "line": 4,
        "symbol": "decide",
        "annotation": "celsius < kLow → Command::Heat."
      },
      {
        "from": "main",
        "to": "actuator",
        "mechanism": "calls",
        "file": "src/main.cpp",
        "line": 21,
        "symbol": "actuator.apply",
        "annotation": "Apply Heat for this tick."
      },
      {
        "from": "actuator",
        "to": "ActuatorHW",
        "mechanism": "writes",
        "file": "src/actuator.cpp",
        "line": 9,
        "symbol": "Command::Heat",
        "annotation": "Heater pin asserted."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Sensor → actuator';

export const description =
  'Embedded **C++** control loop: read a sensor, run threshold logic, drive an actuator. Hardware shows up as externals. Open **Walkthroughs** for a generic tick and the heat path.';
