#!/usr/bin/env node
/**
 * Keeps .claude/skills an exact mirror of .agents/skills.
 *
 * .agents/skills is the source of truth (read by Codex and Antigravity). .claude/skills is
 * generated from it as regular committed files (read by Claude Code). Edit skills only under
 * .agents/skills, then run --write.
 *
 *   node scripts/syncSkills.mjs --check   exit 1 if the trees diverge or skills-lock.json is off
 *   node scripts/syncSkills.mjs --write   regenerate .claude/skills from .agents/skills
 *
 * --root <dir> runs against another checkout or a test fixture (default: this repo).
 *
 * Contract:
 * - Never modifies .agents/skills. --write hashes it before and after, and fails if it changed.
 * - Copies bytes verbatim and never rewrites line endings. Text files are compared with CRLF
 *   folded to LF, matching .gitattributes (`* text=auto eol=lf`): a line-ending-only difference
 *   that git would store as the same blob is neither reported nor rewritten. A file is binary if
 *   its first 8000 bytes contain a NUL (git's own heuristic); binaries are compared byte for byte.
 * - Refuses to run if either tree contains a symlink or junction.
 * - Deletes only regular files, then removes directories left empty, bottom-up, with
 *   non-recursive rmdir.
 *
 * Exit codes: 0 in sync, 1 problems found, 2 fatal (bad arguments, links, source changed).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = '.agents/skills';
const TARGET = '.claude/skills';
const LOCK_FILE = 'skills-lock.json';

// Skills authored in this repo rather than vendored, so they have no skills-lock.json entry.
const LOCAL_SKILLS = new Set([
  'cookout-competitive-intelligence',
  'frontend-design',
  'impeccable',
  'web-interface-guidelines',
]);

class FatalError extends Error {}

function parseArgs(argv) {
  let mode = null;
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check' || arg === '--write') {
      if (mode) throw new FatalError('pass exactly one of --check or --write');
      mode = arg.slice(2);
    } else if (arg === '--root') {
      if (!argv[i + 1]) throw new FatalError('--root needs a directory');
      root = path.resolve(argv[++i]);
    } else {
      throw new FatalError(`unknown argument: ${arg}`);
    }
  }
  if (!mode) throw new FatalError('pass exactly one of --check or --write');
  return { mode, root };
}

function assertRealDirectory(dir) {
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink()) {
    throw new FatalError(`${dir} is a symlink or junction; replace it with real files first`);
  }
  if (!stat.isDirectory()) throw new FatalError(`${dir} is not a directory`);
}

/** Map of posix-relative path -> absolute path for every regular file under `dir`, sorted. */
function listFiles(dir) {
  const files = new Map();
  if (!fs.existsSync(dir)) return files;
  assertRealDirectory(dir);
  const visit = (abs, rel) => {
    for (const name of fs.readdirSync(abs).sort()) {
      const childAbs = path.join(abs, name);
      const childRel = rel ? `${rel}/${name}` : name;
      const stat = fs.lstatSync(childAbs);
      if (stat.isSymbolicLink()) {
        throw new FatalError(
          `${childAbs} is a symlink or junction; refusing to run (replace it with real files first)`
        );
      }
      if (stat.isDirectory()) visit(childAbs, childRel);
      else if (stat.isFile()) files.set(childRel, childAbs);
      else throw new FatalError(`${childAbs} is not a regular file or directory`);
    }
  };
  visit(dir, '');
  return files;
}

const isBinary = (buf) => buf.subarray(0, 8000).includes(0);
const foldCrlf = (buf) => Buffer.from(buf.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');

function sameContent(a, b) {
  if (a.equals(b)) return true;
  if (isBinary(a) || isBinary(b)) return false;
  return foldCrlf(a).equals(foldCrlf(b));
}

function compareTrees(root) {
  const src = listFiles(path.join(root, SOURCE));
  const dst = listFiles(path.join(root, TARGET));
  const problems = [];
  for (const [rel, abs] of src) {
    if (!dst.has(rel)) {
      problems.push({ kind: 'only in .agents', rel });
      continue;
    }
    const a = fs.readFileSync(abs);
    const b = fs.readFileSync(dst.get(rel));
    if (!sameContent(a, b)) {
      const binary = isBinary(a) || isBinary(b);
      problems.push({ kind: binary ? 'content differs (binary)' : 'content differs', rel });
    }
  }
  for (const rel of dst.keys()) {
    if (!src.has(rel)) problems.push({ kind: 'only in .claude', rel });
  }
  problems.sort((x, y) => (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0));
  return { src, dst, problems };
}

function skillNames(root) {
  const dir = path.join(root, SOURCE);
  return fs
    .readdirSync(dir)
    .filter((name) => fs.lstatSync(path.join(dir, name)).isDirectory())
    .sort();
}

function checkSkills(root) {
  const problems = [];
  const skills = skillNames(root);

  for (const name of skills) {
    const skillMd = path.join(root, SOURCE, name, 'SKILL.md');
    if (!fs.existsSync(skillMd)) {
      problems.push({ kind: 'missing SKILL.md', rel: name });
      continue;
    }
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(skillMd, 'utf8'));
    const declared = frontmatter && /^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(frontmatter[1]);
    if (!declared) problems.push({ kind: 'SKILL.md frontmatter has no name', rel: name });
    else if (declared[1] !== name) {
      problems.push({ kind: `frontmatter name is "${declared[1]}"`, rel: name });
    }
  }

  const lockPath = path.join(root, LOCK_FILE);
  if (!fs.existsSync(lockPath)) throw new FatalError(`${LOCK_FILE} not found under ${root}`);
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')).skills ?? {};
  for (const name of Object.keys(lock).sort()) {
    if (!skills.includes(name)) problems.push({ kind: 'lock entry without directory', rel: name });
  }
  for (const name of skills) {
    if (!Object.hasOwn(lock, name) && !LOCAL_SKILLS.has(name)) {
      problems.push({ kind: 'not in skills-lock.json and not declared local', rel: name });
    }
  }
  return { skills, problems };
}

/** Content hash of a whole tree: every relative path and every byte, in sorted order. */
function hashTree(dir) {
  const hash = crypto.createHash('sha256');
  for (const [rel, abs] of listFiles(dir)) {
    const buf = fs.readFileSync(abs);
    hash.update(`${rel}\0${buf.length}\0`);
    hash.update(buf);
  }
  return hash.digest('hex');
}

/** Remove directories under `rootDir` (never `rootDir` itself) that are empty, deepest first. */
function pruneEmptyDirs(rootDir) {
  if (!fs.existsSync(rootDir)) return 0;
  let pruned = 0;
  const visit = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const child = path.join(dir, name);
      if (fs.lstatSync(child).isDirectory()) visit(child);
    }
    if (dir !== rootDir && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir); // non-recursive: throws rather than deleting anything if not empty
      pruned++;
    }
  };
  visit(rootDir);
  return pruned;
}

function report(title, problems) {
  if (problems.length === 0) return;
  const width = Math.max(...problems.map((p) => p.kind.length));
  console.error(`  ${title}`);
  for (const p of problems) console.error(`    ${p.kind.padEnd(width)}  ${p.rel}`);
}

function runCheck(root) {
  const { src, problems: mirror } = compareTrees(root);
  const { skills, problems: skillProblems } = checkSkills(root);
  if (mirror.length === 0 && skillProblems.length === 0) {
    console.log(
      `skills:check OK: ${src.size} files mirrored across ${skills.length} skills, ${LOCK_FILE} consistent`
    );
    return 0;
  }
  console.error('skills:check FAILED');
  report(`Mirror (${TARGET} vs ${SOURCE}, the source of truth):`, mirror);
  report(`Skills and ${LOCK_FILE}:`, skillProblems);
  if (mirror.length > 0) {
    console.error(
      `Fix mirror problems: edit only ${SOURCE}, then run node scripts/syncSkills.mjs --write`
    );
  }
  if (skillProblems.length > 0) {
    console.error(
      `Fix skill problems in the skill directory, ${LOCK_FILE}, or LOCAL_SKILLS in scripts/syncSkills.mjs`
    );
  }
  return 1;
}

function runWrite(root) {
  const sourceDir = path.join(root, SOURCE);
  const targetDir = path.join(root, TARGET);
  const before = hashTree(sourceDir);

  const { src, dst, problems } = compareTrees(root);
  const stale = problems.filter((p) => p.kind === 'only in .claude');
  const toCopy = problems.filter((p) => p.kind !== 'only in .claude');

  for (const p of stale) fs.unlinkSync(dst.get(p.rel)); // listFiles guarantees a regular file
  const pruned = pruneEmptyDirs(targetDir);
  for (const p of toCopy) {
    const to = path.join(targetDir, ...p.rel.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(src.get(p.rel), to);
  }

  if (hashTree(sourceDir) !== before) {
    throw new FatalError(`${SOURCE} changed during --write; stop and investigate`);
  }
  if (compareTrees(root).problems.length > 0) {
    throw new FatalError(`${TARGET} still differs from ${SOURCE} after --write`);
  }
  console.log(
    `skills:sync wrote ${toCopy.length} file(s), removed ${stale.length}, pruned ${pruned} empty dir(s); ${SOURCE} unchanged`
  );

  const { problems: skillProblems } = checkSkills(root);
  if (skillProblems.length > 0) {
    console.error('Mirror is in sync, but:');
    report(`Skills and ${LOCK_FILE}:`, skillProblems);
    return 1;
  }
  return 0;
}

try {
  const { mode, root } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(path.join(root, SOURCE))) {
    throw new FatalError(`${SOURCE} not found under ${root}`);
  }
  process.exitCode = mode === 'check' ? runCheck(root) : runWrite(root);
} catch (error) {
  if (!(error instanceof FatalError)) throw error;
  console.error(`syncSkills: ${error.message}`);
  process.exitCode = 2;
}
