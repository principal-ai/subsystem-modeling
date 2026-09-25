import { resolveRepoRootForPurl, resolveCurrentGraphifySlot, listGraphifyGraphs } from "./src/bun/graphify-store";
const purl = "pkg:github/principal-ai/subsystem-modeling";
const repoRoot = resolveRepoRootForPurl(purl);
console.log("repoRoot:", repoRoot);
const slot = await resolveCurrentGraphifySlot(purl);
console.log("current slot:", slot ? `${slot.slotKey} cached=${!!slot.cached}` : "none");
const entries = (await listGraphifyGraphs()).filter(e => e.purlKey === purl);
console.log("index slots:", entries.map(e => e.slotKey));
