/**
 * Regenerate BOTH C4 fixtures from one composition of the live store, so the
 * document and its association set can never drift apart.
 *
 * Run from packages/subsystems-react:
 *   bun run src/stories/Subsystem/C4Graph/generateFixture.ts
 *
 * The two files it writes are paired:
 *   c4Fixture.ts            the composed document the graph renders
 *   c4Associations.fixture.ts  proposed associations keyed off that document
 *
 * They must be generated together. A document from one snapshot and an
 * association set from another produces merges that silently do nothing.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { toC4 } from '../../../subsystem/toC4';
import { buildAssociations, deriveConcerns, suggestMerges } from '../../../subsystem/c4Associations';
import type { SubsystemModelDocument, SubsystemComponent } from '../../../subsystem/model';

const REPO = 'pkg:github/principal-ai/subsystem-modeling';
const SYSTEM_LABEL = 'Subsystem Modeling';
const dir = path.join(os.homedir(), '.principal/subsystem-models');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== '_index.json');

/**
 * Compose every stored model for one repo key into a single document.
 *
 * One canonical component per (purl#symbol); aliases rebased to `c0..cn` so
 * two models cannot collide in one alias space.
 */
const byId = new Map<string, SubsystemComponent>();
const steps: NonNullable<SubsystemModelDocument['trails']>[number]['steps'] = [];
let n = 0;

for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as SubsystemModelDocument;
  const aliasMap = new Map<string, string>();
  for (const c of d.components ?? []) {
    if ((c.purl ?? '').split('#')[0] !== REPO) continue;
    const key = `${c.purl!.split('#')[1] ?? ''}::${c.symbol ?? c.alias}`;
    if (!byId.has(key)) byId.set(key, { ...c, alias: `c${n++}` });
    aliasMap.set(c.alias, key);
  }
  for (const t of d.trails ?? []) {
    for (const s of t.steps ?? []) {
      const a = aliasMap.get(s.from);
      const b = aliasMap.get(s.to);
      if (!a || !b || a === b) continue;
      steps.push({
        from: byId.get(a)!.alias,
        to: byId.get(b)!.alias,
        mechanism: s.mechanism,
        // Keep the site so the fixture is a faithful document, not a shape.
        file: s.file,
        line: s.line,
        purl: s.purl,
        symbol: s.symbol,
        ...(s.annotation ? { annotation: s.annotation } : {}),
      });
    }
  }
}

// The React-local document type carries components + trails only; the store
// record wraps it with title/description.
const document: SubsystemModelDocument = {
  components: [...byId.values()],
  trails: [{ id: 'all', title: 'all trails', steps }],
};

// --- Roll up once, then derive concerns off the same rollup -------------
const raw = toC4(document, { view: 'container', systemLabel: SYSTEM_LABEL });

const memberOf = new Map<string, SubsystemComponent>();
for (const c of byId.values()) memberOf.set(c.alias, c);

const rollup = raw.nodes
  .filter((x) => x.kind === 'container')
  .map((x) => {
    const members = x.members.map((a) => memberOf.get(a)!).filter(Boolean);
    const frameworks = [...new Set(members.map((m) => m.framework).filter(Boolean) as string[])];
    return { key: x.key ?? x.id, members, frameworks };
  });

const set = buildAssociations({ repoKey: REPO, rollup, author: 'c4-proposer' });
const merges = suggestMerges(rollup.map((r) => ({ key: r.key, memberCount: r.members.length })));
const concerns = rollup.flatMap((r) => deriveConcerns(r.key, r.members, { frameworks: r.frameworks }));

/** Every derived key, so a story can assert nothing was invented. */
const derivedKeys = rollup.map((r) => r.key).sort();

/** Components behind each derived key — the evidence that picks a merge survivor. */
const memberCounts = Object.fromEntries(
  rollup.map((r) => [r.key, r.members.length]).sort(([a], [b]) => String(a).localeCompare(String(b))),
);

// --- Write the document ------------------------------------------------
const docSrc = `// GENERATED from live store data by generateFixture.ts — do not hand-edit.
//
// Composite of ${files.length} stored subsystem models for ${REPO},
// joined on purl#symbol (one canonical component per real declaration).
//
// Regenerate together with c4Associations.fixture.ts — the association set is
// keyed off the container keys this document derives. Generating them
// separately produces merges that silently do nothing.

import type { SubsystemModelDocument } from "../../../subsystem/model";

/** Container keys this document is expected to derive. */
export const c4DerivedKeys = ${JSON.stringify(derivedKeys, null, 2)} as const;

/** Components behind each derived key — decides which side of a merge survives. */
export const c4MemberCounts: Record<string, number> = ${JSON.stringify(memberCounts, null, 2)};

export const c4FixtureModel: SubsystemModelDocument = ${JSON.stringify(document, null, 1)};
`;
fs.writeFileSync(path.join(__dirname, 'c4Fixture.ts'), docSrc);

// --- Write the associations -------------------------------------------
const assocSrc = `// GENERATED from live store data by generateFixture.ts — do not hand-edit.
//
// Derived from the SAME composition as c4Fixture.ts: ${byId.size} components
// → ${rollup.length} container keys → ${set.associations.length} associations.
//
// Every association is state:'proposed'. None of it is accepted — accepting is
// a human's decision, and this story exists to make that decision visible.

import type { C4Association } from "../../../subsystem/toC4";

/** Container keys whose trailing role matches — candidates for a merge. */
export const C4_MERGE_CANDIDATES = ${JSON.stringify(merges, null, 2)} as const;

/** Every mechanical concern, for the review panel. */
export const C4_CONCERNS = ${JSON.stringify(concerns, null, 2)} as const;

export const c4Associations: C4Association[] = ${JSON.stringify(set.associations, null, 2)};
`;
fs.writeFileSync(path.join(__dirname, 'c4Associations.fixture.ts'), assocSrc);

// --- Verify the pair actually agrees ----------------------------------
const reDerived = toC4(
  JSON.parse(JSON.stringify(document)),
  { view: 'container', systemLabel: SYSTEM_LABEL, associations: set.associations },
);
const claimed = new Set(set.associations.flatMap((a) => a.sourceKeys));
const orphans = derivedKeys.filter((k) => !claimed.has(k));

console.log('wrote c4Fixture.ts + c4Associations.fixture.ts');
console.log('  models composed :', files.length);
console.log('  components      :', byId.size);
console.log('  container keys  :', rollup.length);
console.log('  associations    :', set.associations.length);
console.log('  merge candidates:', merges.length);
console.log('  concerns        :', concerns.length);
console.log('  types           :', JSON.stringify(
  set.associations.reduce<Record<string, number>>((a, x) => ({ ...a, [x.type]: (a[x.type] ?? 0) + 1 }), {}),
));
console.log('  containers drawn:', reDerived.nodes.filter((x) => x.kind === 'container').length);
if (orphans.length > 0) console.warn('  !! derived keys with no association:', orphans);