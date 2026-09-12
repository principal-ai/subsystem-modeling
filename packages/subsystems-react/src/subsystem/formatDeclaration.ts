/**
 * Generate a TypeScript declaration string from a SubsystemComponent's
 * structured `declaration`.
 *
 * This is the "source code" that Prettier will format. The output is valid
 * TypeScript (except for `external`, which is handled separately). The string
 * is intentionally simple — no indentation, no line breaks — because Prettier
 * handles all formatting.
 */

import type { SubsystemComponent, SubsystemComponentConstruct } from './model';
import type { GraphifyComponentDetail } from '../graphify';

const TYPE_FAMILY_CONSTRUCTS: ReadonlySet<string> = new Set([
  'interface',
  'type_alias',
  'enum',
]);

export function generateDeclarationString(component: SubsystemComponent): string {
  const declaration = component.declaration;
  // Type-family constructs own their rendering even when the declaration
  // payload is the shared `type` shape — the construct says which keyword is honest.
  const construct = TYPE_FAMILY_CONSTRUCTS.has(component.construct)
    ? component.construct
    : declaration?.kind ?? component.construct;
  const rawName = component.symbol || component.name || 'untitled';
  // Strip class/object prefix from dotted symbols (e.g. "SessionReader.normalize" → "normalize").
  const name = rawName.includes('.') ? rawName.split('.').pop()! : rawName;

  switch (construct) {
    case 'class':
      return generateClass(name, declaration);
    case 'function':
      return generateFunction(name, declaration);
    case 'method':
      return generateMethod(name, declaration);
    case 'interface':
    case 'type_alias':
    case 'enum':
      return generateType(name, component.construct, declaration);
    case 'module':
      return generateModule(declaration);
    case 'store':
      return generateStore(name, declaration);
    case 'external':
      // Not valid TypeScript — caller should handle formatting.
      return `external '${declaration?.kind === 'external' ? declaration.label : name}'`;
    case 'custom_entity':
      // An actor, not code — no declaration to generate. Renders as a
      // non-TypeScript block: `entity 'Name' — kind` followed by the authored
      // attributes (key: value) indented beneath. Not valid TS — callers
      // bypass Prettier.
    {
      const kindLabel = component.entityKind ? ` — ${component.entityKind}` : '';
      const attrs = declaration?.kind === 'custom_entity' ? declaration.attributes : [];
      const attrLines = attrs.map((a) => `  ${a.key}: ${a.value}`).join('\n');
      return attrLines
        ? `entity '${name}'${kindLabel}\n${attrLines}`
        : `entity '${name}'${kindLabel}`;
    }
    default:
      return `${construct} ${name}`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format parameters, synthesising names for unnamed positionals. */
function formatParams(params: { name?: string; type: string }[]): string {
  return params
    .map((p, i) => (p.name ? `${p.name}: ${p.type}` : `arg${i}: ${p.type}`))
    .join(', ');
}

// ---------------------------------------------------------------------------
// Per-construct generators
// ---------------------------------------------------------------------------

function generateClass(name: string, declaration?: GraphifyComponentDetail): string {
  const cls = declaration?.kind === 'class' ? declaration : undefined;
  const parts: string[] = [`class ${name}`];

  if (cls?.extends && cls.extends.length > 0) {
    parts.push(`extends ${cls.extends.join(', ')}`);
  }
  if (cls?.implements && cls.implements.length > 0) {
    parts.push(`implements ${cls.implements.join(', ')}`);
  }

  const members: string[] = [];

  for (const m of cls?.methods ?? []) {
    const ret = m.returnType ? `: ${m.returnType}` : '';
    members.push(`  ${m.name}(${formatParams(m.parameters ?? [])})${ret};`);
  }

  for (const prop of cls?.properties ?? []) {
    const t = prop.type ? `: ${prop.type}` : '';
    members.push(`  ${prop.name}${t};`);
  }

  if (members.length > 0) {
    parts.push(`{\n${members.join('\n')}\n}`);
  } else {
    parts.push('{}');
  }

  return parts.join(' ');
}

function generateFunction(name: string, declaration?: GraphifyComponentDetail): string {
  const fn = declaration?.kind === 'function' ? declaration : undefined;
  const params = formatParams(fn?.parameters ?? []);
  const ret = fn?.returnType ? `: ${fn.returnType}` : '';
  return `function ${name}(${params})${ret};`;
}

function generateMethod(name: string, declaration?: GraphifyComponentDetail): string {
  const m = declaration?.kind === 'method' ? declaration : undefined;
  const hostClass = m?.hostClass ?? 'Host';
  const params = formatParams(m?.parameters ?? []);
  const ret = m?.returnType ? `: ${m.returnType}` : '';
  return `class ${hostClass} {\n  ${name}(${params})${ret};\n}`;
}

function generateType(
  name: string,
  construct: SubsystemComponentConstruct,
  declaration?: GraphifyComponentDetail,
): string {
  // The type-family constructs render their declaration keyword honestly —
  // the construct itself says interface / type (alias) / enum / variable.
  const tpe = declaration?.kind === 'type' ? declaration : undefined;
  const params = (tpe?.generics ?? [])
    .map((g) => `${g.name}${g.constraint ? ` extends ${g.constraint}` : ''}`)
    .join(', ');
  const header = params ? `${name}<${params}>` : name;

  // Verbatim RHS escape hatch — shown as-is when the shape doesn't fit one
  // of the structured buckets below. Wins over everything else.
  if (tpe?.rhs) return `type ${header} = ${tpe.rhs};`;
  if (tpe?.aliasOf) return `type ${header} = ${tpe.aliasOf};`;
  if (tpe?.signature) {
    const sigParams = formatParams(tpe.signature.parameters ?? []);
    const ret = tpe.signature.returnType ?? 'void';
    return `type ${header} = (${sigParams}) => ${ret};`;
  }
  if (tpe?.unionOf?.length) {
    return `type ${header} = ${tpe.unionOf.join(' | ')};`;
  }
  if (construct === 'enum') {
    const members = tpe?.enumMembers?.length
      ? tpe.enumMembers.map((m) => `${m.name}${m.value ? ` = ${m.value}` : ''}`).join(', ')
      : (tpe?.properties ?? []).map((p) => p.name).join(', ');
    return `enum ${header} { ${members} }`;
  }

  const props = (tpe?.properties ?? [])
    .map((p) => `  ${p.name}${p.type ? `: ${p.type}` : ''};`)
    .join('\n');

  switch (construct) {
    case 'type_alias':
      return props
        ? `type ${header} = {\n${props}\n};`
        : `type ${header} = unknown;`;
    default:
      if (props) {
        return `interface ${header} {\n${props}\n}`;
      }
      return `interface ${header} {}`;
  }
}

function generateModule(declaration?: GraphifyComponentDetail): string {
  const mod = declaration?.kind === 'module' ? declaration : undefined;
  if (!mod) return 'module {}';

  const parts: string[] = [];

  for (const imp of mod.imports ?? []) {
    parts.push(`import '${imp.name}';`);
  }

  if ((mod.exports ?? []).length > 0) {
    parts.push(`export { ${mod.exports!.join(', ')} };`);
  }

  return parts.join('\n') || `module {}`;
}

/**
 * A store renders as its retained state — ambient `declare const` lines for
 * the state members, never a class/method stub. The node's name labels the
 * block; the access mechanism lives in separate accessor nodes.
 */
function generateStore(name: string, declaration?: GraphifyComponentDetail): string {
  const store = declaration?.kind === 'store' ? declaration : undefined;
  const backing = store?.storage ? `\n// backing: ${store.storage}` : '';
  const props = (store?.properties ?? [])
    .map((p) => `declare const ${p.name}${p.type ? `: ${p.type}` : ''};`)
    .join('\n');

  if (!props) {
    return `// store: ${name} — no captured state members${backing}`;
  }
  return `// store: ${name}${backing}\n${props}`;
}
