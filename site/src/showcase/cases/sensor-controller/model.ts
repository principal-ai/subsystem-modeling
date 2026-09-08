import type {
  SubsystemComponent,
  SubsystemComponentEdge,
} from '@principal-ai/subsystems-react';
import type { SubsystemThroughline } from '@principal-ai/subsystems-react/dist/subsystem/model.js';

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

export const edges: SubsystemComponentEdge[] = [
  { id: 'e0', from: 'main', to: 'sensor', mechanism: 'calls' },
  { id: 'e1', from: 'main', to: 'control-logic', mechanism: 'calls' },
  { id: 'e2', from: 'main', to: 'actuator', mechanism: 'calls' },
  { id: 'e3', from: 'sensor', to: 'SensorHW', mechanism: 'reads' },
  { id: 'e4', from: 'actuator', to: 'ActuatorHW', mechanism: 'writes' },
];

export const throughlines: SubsystemThroughline[] = [
  {
    id: 'tl-tick',
    title: 'Control loop tick',
    steps: [
      {
        edgeId: 'e0',
        file: 'src/main.cpp',
        line: 19,
        symbol: 'sensor.read',
        annotation: 'One tick starts with a fresh sample.',
      },
      {
        edgeId: 'e3',
        file: 'src/sensor.cpp',
        line: 7,
        symbol: 'read',
        annotation: 'ADC → engineering units (hardware read).',
      },
      {
        edgeId: 'e1',
        file: 'src/main.cpp',
        line: 20,
        symbol: 'control.decide',
        annotation: 'Pure decision — Heat / Cool / Off.',
      },
      {
        edgeId: 'e2',
        file: 'src/main.cpp',
        line: 21,
        symbol: 'actuator.apply',
        annotation: 'Drive outputs for this tick.',
      },
      {
        edgeId: 'e4',
        file: 'src/actuator.cpp',
        line: 7,
        symbol: 'apply',
        annotation: 'GPIO/PWM write to actuator hardware.',
      },
    ],
  },
  {
    id: 'tl-heat',
    title: 'Below threshold → heat',
    steps: [
      {
        edgeId: 'e0',
        file: 'src/main.cpp',
        line: 19,
        symbol: 'sensor.read',
        annotation: 'Sample comes in cold.',
      },
      {
        edgeId: 'e1',
        file: 'src/control.cpp',
        line: 4,
        symbol: 'decide',
        annotation: 'celsius < kLow → Command::Heat.',
      },
      {
        edgeId: 'e2',
        file: 'src/main.cpp',
        line: 21,
        symbol: 'actuator.apply',
        annotation: 'Apply Heat for this tick.',
      },
      {
        edgeId: 'e4',
        file: 'src/actuator.cpp',
        line: 9,
        symbol: 'Command::Heat',
        annotation: 'Heater pin asserted.',
      },
    ],
  },
];

export const title = 'Sensor → actuator';

export const description =
  'Embedded **C++** control loop: read a sensor, run threshold logic, drive an actuator. Hardware shows up as externals. Open **Flows** for a generic tick and the heat path.';
