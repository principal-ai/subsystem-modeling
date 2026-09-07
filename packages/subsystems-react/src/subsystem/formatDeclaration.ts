/**
 * Generate a TypeScript declaration string from a SubsystemComponent's detail.
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
  const detail = component.detail;
  // Type-family constructs own their rendering even when the detail payload
  // is the shared `type` shape — the construct says which keyword is honest.
  const construct = TYPE_FAMILY_CONSTRUCTS.has(component.construct)
    ? component.construct
    : detail?.kind ?? component.construct;
  const rawName = component.symbol || component.name || 'untitled';
  // Strip class/object prefix from dotted symbols (e.g. "SessionReader.normalize" → "normalize").
  const name = rawName.includes('.') ? rawName.split('.').pop()! : rawName;

  switch (construct) {
    case 'class':
      return generateClass(name, detail);
    case 'function':
      return generateFunction(name, detail);
    case 'method':
      return generateMethod(name, detail);
    case 'interface':
    case 'type_alias':
    case 'enum':
      return generateType(name, component.construct, detail);
    case 'module':
      return generateModule(detail);
    case 'store':
      return generateStore(name, detail);
    case 'external':
      // Not valid TypeScript — caller should handle formatting.
      return `external '${detail?.kind === 'external' ? detail.label : name}'`;
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

function generateClass(name: string, detail?: GraphifyComponentDetail): string {
  const cls = detail?.kind === 'class' ? detail : undefined;
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

function generateFunction(name: string, detail?: GraphifyComponentDetail): string {
  const fn = detail?.kind === 'function' ? detail : undefined;
  const params = formatParams(fn?.parameters ?? []);
  const ret = fn?.returnType ? `: ${fn.returnType}` : '';
  return `function ${name}(${params})${ret};`;
}

function generateMethod(name: string, detail?: GraphifyComponentDetail): string {
  const m = detail?.kind === 'method' ? detail : undefined;
  const hostClass = m?.hostClass ?? 'Host';
  const params = formatParams(m?.parameters ?? []);
  const ret = m?.returnType ? `: ${m.returnType}` : '';
  return `class ${hostClass} {\n  ${name}(${params})${ret};\n}`;
}

function generateType(
  name: string,
  construct: SubsystemComponentConstruct,
  detail?: GraphifyComponentDetail,
): string {
  // The type-family constructs render their declaration keyword honestly —
  // the construct itself says interface / type (alias) / enum / variable.
  const tpe = detail?.kind === 'type' ? detail : undefined;
  const props = (tpe?.properties ?? [])
    .map((p) => `  ${p.name}${p.type ? `: ${p.type}` : ''};`)
    .join('\n');

  switch (construct) {
    case 'enum':
      return `enum ${name} { ${(tpe?.properties ?? []).map((p) => p.name).join(', ')} }`;
    case 'type_alias':
      return props
        ? `type ${name} = {\n${props}\n};`
        : `type ${name} = unknown;`;
    default:
      if (props) {
        return `interface ${name} {\n${props}\n}`;
      }
      return `interface ${name} {}`;
  }
}

function generateModule(detail?: GraphifyComponentDetail): string {
  const mod = detail?.kind === 'module' ? detail : undefined;
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
function generateStore(name: string, detail?: GraphifyComponentDetail): string {
  const store = detail?.kind === 'store' ? detail : undefined;
  const props = (store?.properties ?? [])
    .map((p) => `declare const ${p.name}${p.type ? `: ${p.type}` : ''};`)
    .join('\n');

  if (!props) {
    return `// store: ${name} — no captured state members`;
  }
  return `// store: ${name}\n${props}`;
}
