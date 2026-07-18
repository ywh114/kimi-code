import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'pathe';

export interface SessionIndexEntry {
  readonly sessionId: string;
  readonly sessionDir: string;
  readonly workDir: string;
}

// Per-homeDir append chain. Within one process, concurrent index appends are
// serialized so two lines can never be interleaved at the filesystem layer.
// Cross-process, a single short line written with O_APPEND is atomic on POSIX
// (well under PIPE_BUF), so this closes the realistic same-process tearing gap
// without taking a file lock. A failed append is reported to its caller but does
// not poison the chain for later appends.
const appendQueues = new Map<string, Promise<void>>();

export function sessionIndexPath(homeDir: string): string {
  return join(homeDir, 'session_index.jsonl');
}

export async function appendSessionIndexEntry(
  homeDir: string,
  entry: SessionIndexEntry,
): Promise<void> {
  const indexPath = sessionIndexPath(homeDir);
  const line = `${JSON.stringify(entry)}\n`;
  const previous = appendQueues.get(homeDir) ?? Promise.resolve();
  const next = previous.then(async () => {
    await mkdir(dirname(indexPath), { recursive: true, mode: 0o700 });
    await appendFile(indexPath, line, 'utf-8');
  });
  appendQueues.set(homeDir, next.then(() => undefined, () => undefined));
  return next;
}

/**
 * Remove every index line for `sessionId`. The index is append-only, so
 * deletion rewrites the file (filtered) rather than appending a tombstone.
 * The rewrite is serialized on the same per-homeDir queue as appends so it
 * can never interleave with a concurrent append and lose it, and is staged
 * through a temp file + rename to keep the replace atomic. Unparseable
 * lines are preserved; only exact `sessionId` matches are dropped.
 */
export async function removeSessionIndexEntry(
  homeDir: string,
  sessionId: string,
): Promise<void> {
  const indexPath = sessionIndexPath(homeDir);
  const previous = appendQueues.get(homeDir) ?? Promise.resolve();
  const next = previous.then(async () => {
    let raw: string;
    try {
      raw = await readFile(indexPath, 'utf-8');
    } catch {
      return;
    }
    const kept: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      if (parseIndexLine(trimmed)?.sessionId === sessionId) continue;
      kept.push(trimmed);
    }
    const tmpPath = `${indexPath}.tmp`;
    await writeFile(tmpPath, kept.length === 0 ? '' : `${kept.join('\n')}\n`, 'utf-8');
    await rename(tmpPath, indexPath);
  });
  appendQueues.set(homeDir, next.then(() => undefined, () => undefined));
  return next;
}

export async function readSessionIndex(
  homeDir: string,
  sessionsDir: string,
): Promise<Map<string, SessionIndexEntry>> {
  let raw: string;
  try {
    raw = await readFile(sessionIndexPath(homeDir), 'utf-8');
  } catch {
    return new Map();
  }

  const result = new Map<string, SessionIndexEntry>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const entry = parseIndexLine(trimmed);
    if (entry === undefined) continue;
    const sessionDir = resolve(entry.sessionDir);
    if (!isAbsolute(entry.sessionDir)) continue;
    if (!isPathInside(sessionsDir, sessionDir)) continue;
    if (basename(sessionDir) !== entry.sessionId) continue;
    // `workDir` is no longer authoritative: summaries prefer the workDir stored
    // in each session's self-describing state.json, so a stale or relocated
    // index workDir must not drop an otherwise valid entry.
    result.set(entry.sessionId, {
      sessionId: entry.sessionId,
      sessionDir,
      workDir: entry.workDir,
    });
  }
  return result;
}

function parseIndexLine(line: string): SessionIndexEntry | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const entry = parsed as Partial<SessionIndexEntry>;
    if (
      typeof entry.sessionId !== 'string' ||
      typeof entry.sessionDir !== 'string' ||
      typeof entry.workDir !== 'string'
    ) {
      return undefined;
    }
    return {
      sessionId: entry.sessionId,
      sessionDir: entry.sessionDir,
      workDir: entry.workDir,
    };
  } catch {
    return undefined;
  }
}

function isPathInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}
