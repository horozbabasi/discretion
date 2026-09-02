/**
 * public-api.test.ts — the published surface, pinned and checked.
 *
 * SPEC.md M12: "finalize core's public API surface with explicit exports and
 * no internal leakage".
 *
 * Two different failures are checked here, because they fail in different
 * ways and neither implies the other:
 *
 *   1. DRIFT. An export added or removed without anyone deciding to. Once the
 *      package is on npm, adding is a minor version and removing is a major
 *      one, so the surface changing by accident is a semver violation that no
 *      other test would notice. The pin below makes any change show up as a
 *      diff a reviewer has to approve.
 *
 *   2. LEAKAGE. A type named in a public signature that is NOT itself
 *      exported. `tsc` never complains: the type is reachable through the
 *      generated `.d.ts`, so the package compiles and consumers can even call
 *      the function. What they cannot do is NAME what it returns, which means
 *      they cannot write a typed wrapper, store it in a typed field, or
 *      re-export it. It is discovered by the consumer, not by us — exactly
 *      the class of defect M12 was asked to close.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import * as api from '../src/index.js';

const CORE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(CORE, 'src', 'index.ts');

/** Type-only exports are invisible at runtime, so the pin needs the source. */
function declaredExportNames(): string[] {
  const source = readFileSync(ENTRY, 'utf8');
  const names = new Set<string>();
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const raw of (match[1] ?? '').split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name !== undefined && name.length > 0) names.add(name);
    }
  }
  for (const match of source.matchAll(/export\s+\*\s+as\s+(\w+)/g)) {
    if (match[1] !== undefined) names.add(match[1]);
  }
  return [...names].sort();
}

describe('the runtime surface is pinned', () => {
  // Values only: `export type` disappears at runtime, so this list is
  // deliberately shorter than the declared one.
  const RUNTIME_EXPORTS = [
    'CONFIDENCE', 'ChunkCache', 'DetectionTimeoutError', 'DetectorError',
    'EXPOSURE_LIMITATION', 'GLOBAL_REGION', 'LOCATION_POOL', 'MappedTextBuilder',
    'NEGATIVE_RULES', 'NER_ENTITY_TYPES', 'NerEngine', 'ORG_POOL', 'PERSON_POOLS',
    'PROFILES', 'Restorer', 'Vault', 'ALL_ENTITY_TYPES',
    'alignPieces', 'allDetectors', 'analyzeContext', 'asciiDigitFor',
    'buildReverseMap', 'buildStructureIndex', 'buildTriggerIndex', 'calibrate',
    'checksums', 'chooseSurrogate', 'chunkText', 'classifyCodePoint',
    'composeMaps', 'computeExposure', 'coverageHoles', 'customProfile',
    'decide', 'decodeEntities', 'detect', 'detectScripts',
    'detectableEntityTypes', 'detectorCount', 'detectorsForEntityType',
    'detectorsForRegion', 'explain', 'explainOmission', 'familyOf',
    'fitCalibration', 'foldDigits', 'foldForMatch', 'foldHomoglyphs',
    'exposureBand', 'gazetteerSizes', 'generate', 'getCharScript', 'getDetector',
    'guardEgress', 'identityMap', 'invalid', 'isGazetteerType', 'labelOf',
    'lookupGazetteer', 'mapNormalizedSpan', 'mask', 'maskOriginal',
    'nfkcByGrapheme', 'normalize', 'normalizeWhitespacePunct', 'normalizedKey',
    'profileDocument', 'protect', 'registerDetector', 'reliability',
    'resolveForMasking', 'resolveOverlaps', 'restore', 'ruleApplies',
    'runStage1', 'runStage2', 'scriptsCompatible', 'stripInvisibles',
    'toCalibrationModel', 'toDetectedEntity', 'valid',
  ].sort();

  it('exports exactly the pinned runtime names', () => {
    // If this fails, the surface changed. Decide whether that is a minor
    // version (added) or a major one (removed), record it in CHANGELOG.md,
    // and then update this list — in that order.
    expect(Object.keys(api).sort()).toEqual(RUNTIME_EXPORTS);
  });

  it('every pinned name is actually reachable, not just listed', () => {
    for (const name of RUNTIME_EXPORTS) {
      expect(api, `${name} is pinned but missing`).toHaveProperty(name);
      expect((api as Record<string, unknown>)[name]).toBeDefined();
    }
  });
});

describe('no internal leakage', () => {
  it('every type named in a public signature is itself exported', () => {
    const config = ts.readConfigFile(join(CORE, 'tsconfig.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, CORE);
    const program = ts.createProgram([ENTRY], { ...parsed.options, noEmit: true });
    const checker = program.getTypeChecker();

    const entry = program.getSourceFile(ENTRY);
    expect(entry, 'index.ts is not in the program').toBeDefined();
    const moduleSymbol = checker.getSymbolAtLocation(entry!);
    expect(moduleSymbol, 'index.ts has no module symbol').toBeDefined();

    const exportSymbols = checker.getExportsOfModule(moduleSymbol!);
    const exported = new Set(exportSymbols.map((s) => s.getName()));
    const ours = (file: ts.SourceFile): boolean =>
      file.fileName.includes('/packages/core/') || file.fileName.includes('/packages/data/');

    // Structural names TypeScript resolves to a declaration we do not own the
    // export of, and which no consumer needs to import.
    const BUILTIN = new Set(['Promise', 'Array', 'ReadonlyArray', 'Map', 'Set', 'Record',
      'Readonly', 'Partial', 'Omit', 'Pick', 'Exclude', 'Iterable', 'Int32Array']);

    const leaks: string[] = [];

    /** Only the parts a CONSUMER can see: no private members, no local types. */
    const publicTypeNodes = (decl: ts.Declaration): ts.Node[] => {
      const nodes: ts.Node[] = [];
      if (ts.isFunctionDeclaration(decl) || ts.isMethodDeclaration(decl)) {
        for (const p of decl.parameters) if (p.type) nodes.push(p.type);
        if (decl.type) nodes.push(decl.type);
        return nodes;
      }
      if (ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl)) {
        return [decl];
      }
      if (ts.isClassDeclaration(decl)) {
        for (const member of decl.members) {
          const mods = ts.canHaveModifiers(member) ? (ts.getModifiers(member) ?? []) : [];
          const hidden = mods.some(
            (m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword,
          );
          if (hidden || member.name?.getText().startsWith('#') === true) continue;
          // The SIGNATURE only. Pushing the whole member walks method bodies
          // too, which reported every type a local variable happened to be
          // annotated with - types no consumer can see and none needs to name.
          if (ts.isPropertyDeclaration(member) && member.type) nodes.push(member.type);
          if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)) {
            for (const p of member.parameters) if (p.type) nodes.push(p.type);
            if (!ts.isConstructorDeclaration(member) && member.type) nodes.push(member.type);
          }
          if (ts.isGetAccessorDeclaration(member) && member.type) nodes.push(member.type);
        }
        return nodes;
      }
      if (ts.isVariableDeclaration(decl) && decl.type) return [decl.type];
      return [];
    };

    for (const symbol of exportSymbols) {
      const target =
        symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      for (const decl of target.declarations ?? []) {
        if (!ours(decl.getSourceFile())) continue;

        // Type parameters are declared on the declaration itself, so they are
        // never "unexported types" even though they look like references.
        const typeParams = new Set(
          ((decl as { typeParameters?: ts.NodeArray<ts.TypeParameterDeclaration> }).typeParameters ?? [])
            .map((p) => p.name.text),
        );

        for (const root of publicTypeNodes(decl)) {
          const visit = (node: ts.Node): void => {
            if (ts.isTypeReferenceNode(node)) {
              const nameNode = ts.isQualifiedName(node.typeName) ? node.typeName.right : node.typeName;
              const name = nameNode.text;
              const sym = checker.getSymbolAtLocation(nameNode);
              const resolved =
                sym && sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
              const from = resolved?.declarations?.[0]?.getSourceFile();
              if (
                from !== undefined && ours(from) &&
                !exported.has(name) && !BUILTIN.has(name) && !typeParams.has(name)
              ) {
                leaks.push(`${name} (named by ${symbol.getName()})`);
              }
            }
            ts.forEachChild(node, visit);
          };
          visit(root);
        }
      }
    }

    expect([...new Set(leaks)].sort()).toEqual([]);
  });

  it('the declared surface is a superset of the runtime one', () => {
    // A type-only export appears in the source list and not at runtime; the
    // reverse would mean a value is exported without being declared here,
    // which the pin above could not see.
    const declared = new Set(declaredExportNames());
    const runtimeOnly = Object.keys(api).filter((name) => !declared.has(name));
    expect(runtimeOnly).toEqual([]);
  });
});
