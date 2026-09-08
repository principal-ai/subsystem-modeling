import type { ShowcaseCaseMeta } from '../types';

export const meta: ShowcaseCaseMeta = {
  id: 'sensor-controller',
  shortTitle: 'Sensor → actuator',
  blurb: 'Embedded C++ loop: read sensor, decide, drive actuator hardware.',
  stack: 'C++',
  axes: ['job', 'stack'],
  complexity: 'medium',
  storyTitle: 'C++/Sensor to actuator',
};
