export type { ShowcaseCaseMeta } from './types';

export { dailyDigestCase } from './daily-digest';
export { bookingPageCase } from './booking-page';
export { multiplayerBoardCase } from './multiplayer-board';
export { tracedApiCase } from './traced-api';
export { androidNotesCase } from './android-notes';
export { jobWorkerCase } from './job-worker';
export { sensorControllerCase } from './sensor-controller';
export { swiftNotesCase } from './swift-notes';
export { elixirCacheCase } from './elixir-cache';
export { dbtOrdersCase } from './dbt-orders';
export { terraformSiteCase } from './terraform-site';
export { wasmInteropCase } from './wasm-interop';
export { luaEmbedCase } from './lua-embed';
export { cudaAddCase } from './cuda-add';

import { dailyDigestCase } from './daily-digest';
import { bookingPageCase } from './booking-page';
import { multiplayerBoardCase } from './multiplayer-board';
import { tracedApiCase } from './traced-api';
import { androidNotesCase } from './android-notes';
import { jobWorkerCase } from './job-worker';
import { sensorControllerCase } from './sensor-controller';
import { swiftNotesCase } from './swift-notes';
import { elixirCacheCase } from './elixir-cache';
import { dbtOrdersCase } from './dbt-orders';
import { terraformSiteCase } from './terraform-site';
import { wasmInteropCase } from './wasm-interop';
import { luaEmbedCase } from './lua-embed';
import { cudaAddCase } from './cuda-add';

/**
 * Showcase case registry — Storybook stories and a future marketing carousel
 * both read from here so models stay single-sourced.
 */
export const showcaseCases = [
  dailyDigestCase,
  bookingPageCase,
  multiplayerBoardCase,
  tracedApiCase,
  androidNotesCase,
  jobWorkerCase,
  sensorControllerCase,
  swiftNotesCase,
  elixirCacheCase,
  dbtOrdersCase,
  terraformSiteCase,
  wasmInteropCase,
  luaEmbedCase,
  cudaAddCase,
] as const;

export type ShowcaseCase = (typeof showcaseCases)[number];
