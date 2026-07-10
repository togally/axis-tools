import Ajv2020Module from 'ajv/dist/2020.js';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../schemas/protocol-migration.schema.json');
const isRecord = (value) => (typeof value === 'object' && value !== null && !Array.isArray(value));
const unsafePathSegments = new Set(['__proto__', 'constructor', 'prototype']);
const Ajv2020 = Ajv2020Module;
function assertSafePath(dottedPath) {
    if (dottedPath.split('.').some((segment) => unsafePathSegments.has(segment))) {
        throw new Error('unsafe protocol path');
    }
}
function pathsOverlap(left, right) {
    assertSafePath(left);
    assertSafePath(right);
    return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}
function isCredentialLikePath(dottedPath) {
    return /credential|secret|token|password|access_?key/i.test(dottedPath);
}
function parseVersion(version) {
    if (!/^[0-9]+(?:\.[0-9]+)+$/.test(version)) {
        throw new Error(`invalid protocol version: ${version}`);
    }
    const parts = version.split('.').map(Number);
    if (parts.length < 2 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
        throw new Error(`invalid protocol version: ${version}`);
    }
    return parts;
}
function isAdjacentVersion(fromVersion, toVersion) {
    const from = parseVersion(fromVersion);
    const to = parseVersion(toVersion);
    if (from.length !== to.length)
        return false;
    return from.slice(0, -1).every((part, index) => part === to[index])
        && to.at(-1) === from.at(-1) + 1;
}
function getPath(draft, dottedPath) {
    assertSafePath(dottedPath);
    let current = draft;
    for (const segment of dottedPath.split('.')) {
        if (!isRecord(current) || !(segment in current))
            return { found: false };
        current = current[segment];
    }
    return { found: true, value: current };
}
function setPath(draft, dottedPath, value) {
    assertSafePath(dottedPath);
    const segments = dottedPath.split('.');
    let current = draft;
    for (const segment of segments.slice(0, -1)) {
        const next = current[segment];
        if (!isRecord(next))
            current[segment] = {};
        current = current[segment];
    }
    current[segments.at(-1)] = structuredClone(value);
}
function detectCycle(mappings) {
    const edges = new Map();
    for (const mapping of mappings) {
        const targets = edges.get(mapping.from_version) ?? [];
        targets.push(mapping.to_version);
        edges.set(mapping.from_version, targets);
    }
    const visiting = new Set();
    const visited = new Set();
    const visit = (version) => {
        if (visiting.has(version))
            throw new Error('cycle detected in protocol migrations');
        if (visited.has(version))
            return;
        visiting.add(version);
        for (const target of edges.get(version) ?? [])
            visit(target);
        visiting.delete(version);
        visited.add(version);
    };
    for (const version of edges.keys())
        visit(version);
}
async function loadMappings(mappingsDir) {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    const filenames = (await readdir(mappingsDir))
        .filter((filename) => filename.endsWith('.yml') || filename.endsWith('.yaml'))
        .sort();
    const mappings = [];
    for (const filename of filenames) {
        let parsed;
        try {
            parsed = parse(await readFile(path.join(mappingsDir, filename), 'utf8'));
        }
        catch {
            throw new Error(`invalid protocol migration mapping: ${filename}`);
        }
        if (!validate(parsed))
            throw new Error(`schema validation failed for protocol migration: ${filename}`);
        const mapping = parsed;
        validateMappingSafety(mapping);
        mappings.push(mapping);
    }
    return mappings;
}
function validateMappingSafety(mapping) {
    for (const operation of mapping.operations) {
        if (operation.op === 'drop') {
            assertSafePath(operation.from);
            continue;
        }
        if (operation.op === 'copy') {
            assertSafePath(operation.from);
            assertSafePath(operation.to);
            continue;
        }
        if (operation.op === 'set' || operation.op === 'prompt') {
            assertSafePath(operation.to);
        }
    }
    const structuralRenameTargets = new Map();
    for (const operation of mapping.operations) {
        if (operation.op !== 'copy' || operation.from === operation.to)
            continue;
        const targets = structuralRenameTargets.get(operation.from) ?? [];
        targets.push(operation.to);
        structuralRenameTargets.set(operation.from, targets);
    }
    for (const operation of mapping.operations) {
        if (operation.op !== 'drop' || operation.redact !== false)
            continue;
        const targets = structuralRenameTargets.get(operation.from);
        if (isCredentialLikePath(operation.from)
            || !targets
            || targets.some(isCredentialLikePath)) {
            throw new Error(operation.from);
        }
    }
}
function entryOrigins(entry) {
    return entry.origins ?? [{ sourceVersion: entry.sourceVersion, sourcePath: entry.sourcePath }];
}
function originForDescendant(targetPath, requestedPath, origin) {
    if (!requestedPath.startsWith(`${targetPath}.`) || origin.sourcePath.startsWith('$mapping.')) {
        return origin;
    }
    return {
        sourceVersion: origin.sourceVersion,
        sourcePath: `${origin.sourcePath}.${requestedPath.slice(targetPath.length + 1)}`,
    };
}
function resolveCanonicalOrigins(requestedPath, provenance, fallbackVersion) {
    assertSafePath(requestedPath);
    const origins = Object.entries(provenance)
        .filter(([targetPath]) => pathsOverlap(targetPath, requestedPath))
        .flatMap(([targetPath, entry]) => entryOrigins(entry).map((origin) => (originForDescendant(targetPath, requestedPath, origin))));
    if (origins.length === 0) {
        return [{ sourceVersion: fallbackVersion, sourcePath: requestedPath }];
    }
    const unique = new Map();
    for (const origin of origins) {
        unique.set(`${origin.sourceVersion}\u0000${origin.sourcePath}`, origin);
    }
    return [...unique.values()].sort((left, right) => (left.sourcePath.localeCompare(right.sourcePath) || left.sourceVersion.localeCompare(right.sourceVersion)));
}
function provenanceEntryFor(origins) {
    const [first] = origins;
    return origins.length === 1 ? first : { ...first, origins };
}
function rejectRedactedCopyOrigins(mapping, provenance) {
    const copyOrigins = mapping.operations
        .filter((operation) => operation.op === 'copy')
        .flatMap((operation) => resolveCanonicalOrigins(operation.from, provenance, mapping.from_version));
    const unsafeDropOrigins = new Set();
    for (const operation of mapping.operations) {
        if (operation.op !== 'drop' || operation.redact === false)
            continue;
        for (const dropOrigin of resolveCanonicalOrigins(operation.from, provenance, mapping.from_version)) {
            if (copyOrigins.some((copyOrigin) => pathsOverlap(dropOrigin.sourcePath, copyOrigin.sourcePath))) {
                unsafeDropOrigins.add(dropOrigin.sourcePath);
            }
        }
    }
    if (unsafeDropOrigins.size > 0) {
        throw new Error([...unsafeDropOrigins].sort().join(', '));
    }
}
function buildChain(mappings, sourceVersion, latestVersion) {
    const bySource = new Map();
    for (const mapping of mappings) {
        parseVersion(mapping.from_version);
        parseVersion(mapping.to_version);
        const existing = bySource.get(mapping.from_version);
        if (existing) {
            throw new Error(`duplicate migration edge: ${mapping.from_version} -> ${mapping.to_version}`);
        }
        bySource.set(mapping.from_version, mapping);
    }
    detectCycle(mappings);
    for (const mapping of mappings) {
        if (!isAdjacentVersion(mapping.from_version, mapping.to_version)) {
            throw new Error(`non-adjacent protocol migration: ${mapping.from_version} -> ${mapping.to_version}`);
        }
    }
    const chain = [];
    const chainMappings = [];
    let currentVersion = sourceVersion;
    while (currentVersion !== latestVersion) {
        const mapping = bySource.get(currentVersion);
        if (!mapping)
            throw new Error(`missing migration link: ${currentVersion} -> ${latestVersion}`);
        chain.push({ fromVersion: mapping.from_version, toVersion: mapping.to_version });
        chainMappings.push(mapping);
        currentVersion = mapping.to_version;
    }
    return { mappings: chainMappings, chain };
}
function applyMapping(input, mapping, unresolved, dropped, provenance) {
    const output = {};
    const outputProvenance = {};
    const writtenTargets = new Set();
    rejectRedactedCopyOrigins(mapping, provenance);
    mapping.operations.forEach((operation, operationIndex) => {
        if (operation.op === 'drop') {
            if (getPath(input, operation.from).found) {
                dropped.push({
                    sourcePath: operation.from,
                    sourceVersion: mapping.from_version,
                    reason: operation.reason,
                    redacted: operation.redact !== false,
                });
            }
            return;
        }
        const conflictingTarget = [...writtenTargets]
            .filter((target) => pathsOverlap(target, operation.to))
            .sort()[0];
        if (conflictingTarget) {
            const targets = [...new Set([conflictingTarget, operation.to])].sort();
            throw new Error(`conflicting writes to targets: ${targets.join(', ')}`);
        }
        writtenTargets.add(operation.to);
        if (operation.op === 'prompt') {
            unresolved.push({
                target: operation.to,
                prompt: operation.prompt,
                sourceVersion: mapping.from_version,
            });
            return;
        }
        if (operation.op === 'copy') {
            const source = getPath(input, operation.from);
            if (!source.found)
                return;
            setPath(output, operation.to, source.value);
            outputProvenance[operation.to] = provenanceEntryFor(resolveCanonicalOrigins(operation.from, provenance, mapping.from_version));
            return;
        }
        setPath(output, operation.to, operation.value);
        outputProvenance[operation.to] = {
            sourceVersion: mapping.from_version,
            sourcePath: `$mapping.operations[${operationIndex}].value`,
        };
    });
    for (const target of Object.keys(provenance))
        delete provenance[target];
    Object.assign(provenance, outputProvenance);
    return output;
}
export async function migrateDraft(options) {
    parseVersion(options.sourceVersion);
    parseVersion(options.latestVersion);
    const mappings = await loadMappings(options.mappingsDir);
    const { mappings: chainMappings, chain } = buildChain(mappings, options.sourceVersion, options.latestVersion);
    const unresolved = [];
    const dropped = [];
    const provenance = {};
    let draft = structuredClone(options.draft);
    for (const mapping of chainMappings) {
        draft = applyMapping(draft, mapping, unresolved, dropped, provenance);
    }
    return { draft, chain, unresolved, dropped, provenance };
}
