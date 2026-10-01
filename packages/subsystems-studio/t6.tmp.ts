import { listSubsystemModels, getSubsystemModel } from "./src/bun/subsystem-model-store";
const { subsystemTrailsFromModel } = await import("./src/bun/index.ts").catch(() => ({ subsystemTrailsFromModel: null })) as any;
const idx = await listSubsystemModels();
let models = 0, steps = 0, withPurl = 0;
for (const e of idx) {
  const full = await getSubsystemModel(e.id); if (!full) continue;
  models++;
  for (const t of full.trails ?? []) for (const s of t.steps ?? []) { steps++; if (s.purl) withPurl++; }
}
console.log(`models=${models} trail steps=${steps} with purl=${withPurl} (${withPurl === steps ? "all attributed" : "SOME UNATTRIBUTED"})`);
