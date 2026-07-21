import type { ContextMessage } from '../context/types';
import { isCompactionSummaryMessage } from './handoff';

/**
 * Cumulative file tracking for compaction (ported from pi's structured
 * compaction `details`, stored in the summary text itself so no record-schema
 * change is needed).
 *
 * After each compaction the tool calls in the compacted history are scanned
 * for file paths (Read/ReadMediaFile/Grep/Glob → read, Write/Edit →
 * modified). The union with the lists parsed from the previous compaction
 * summary is appended to the new summary as `<read-files>` / `<modified-files>`
 * blocks. Because each summary carries the full union, the chain survives any
 * number of successive compactions and session restore — the lists travel with
 * the summary wherever it goes.
 */

export interface TrackedFiles {
  readonly readFiles: readonly string[];
  readonly modifiedFiles: readonly string[];
}

const EMPTY_TRACKED: TrackedFiles = { readFiles: [], modifiedFiles: [] };

const READ_PATH_TOOLS = new Set(['Read', 'ReadMediaFile', 'Grep', 'Glob']);
const MODIFIED_PATH_TOOLS = new Set(['Write', 'Edit']);

/**
 * Hard cap per list. A pathological session could read thousands of files;
 * the block is metadata, not an exhaustive audit log, so when it overflows we
 * drop the oldest entries (most recent context matters most).
 */
export const MAX_TRACKED_FILES_PER_LIST = 300;

function pathFromArguments(argumentsJson: string | null): string | undefined {
  if (argumentsJson === null) return undefined;
  let args: unknown;
  try {
    args = JSON.parse(argumentsJson);
  } catch {
    return undefined;
  }
  if (typeof args !== 'object' || args === null) return undefined;
  const path = (args as Record<string, unknown>)['path'];
  return typeof path === 'string' && path.trim().length > 0 ? path : undefined;
}

/** Extract file paths touched by tool calls in the given history. */
export function extractToolCallFileOps(messages: readonly ContextMessage[]): TrackedFiles {
  const readFiles: string[] = [];
  const modifiedFiles: string[] = [];
  for (const message of messages) {
    for (const call of message.toolCalls ?? []) {
      const path = pathFromArguments(call.arguments);
      if (path === undefined) continue;
      if (MODIFIED_PATH_TOOLS.has(call.name)) {
        modifiedFiles.push(path);
      } else if (READ_PATH_TOOLS.has(call.name)) {
        readFiles.push(path);
      }
    }
  }
  return { readFiles, modifiedFiles };
}

function parseBlock(text: string, tag: string): string[] {
  const match = new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(text);
  const body = match?.[1];
  if (body === undefined) return [];
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function textOf(message: ContextMessage): string {
  let text = '';
  for (const part of message.content) {
    if (part.type === 'text') text += part.text;
  }
  return text;
}

/**
 * Recover the tracked-file lists carried by compaction summaries already in
 * the history. Multiple summaries are unioned in order (normally there is
 * exactly one — older summaries are themselves compacted away).
 */
export function collectTrackedFilesFromHistory(messages: readonly ContextMessage[]): TrackedFiles {
  let result = EMPTY_TRACKED;
  for (const message of messages) {
    if (!isCompactionSummaryMessage(message)) continue;
    const text = textOf(message);
    const readFiles = parseBlock(text, 'read-files');
    const modifiedFiles = parseBlock(text, 'modified-files');
    if (readFiles.length === 0 && modifiedFiles.length === 0) continue;
    result = mergeTrackedFiles(result, { readFiles, modifiedFiles });
  }
  return result;
}

function mergeLists(a: readonly string[], b: readonly string[]): string[] {
  const seen = new Set(a);
  const merged = [...a];
  for (const path of b) {
    if (seen.has(path)) continue;
    seen.add(path);
    merged.push(path);
  }
  // On overflow drop the oldest entries.
  return merged.length > MAX_TRACKED_FILES_PER_LIST
    ? merged.slice(merged.length - MAX_TRACKED_FILES_PER_LIST)
    : merged;
}

/** Union two tracked-file sets, preserving first-seen order. */
export function mergeTrackedFiles(a: TrackedFiles, b: TrackedFiles): TrackedFiles {
  return {
    readFiles: mergeLists(a.readFiles, b.readFiles),
    modifiedFiles: mergeLists(a.modifiedFiles, b.modifiedFiles),
  };
}

/** Render the `<read-files>` / `<modified-files>` blocks. */
export function buildTrackedFilesBlock(files: TrackedFiles): string {
  const parts: string[] = [];
  if (files.readFiles.length > 0) {
    parts.push(`<read-files>\n${files.readFiles.join('\n')}\n</read-files>`);
  }
  if (files.modifiedFiles.length > 0) {
    parts.push(`<modified-files>\n${files.modifiedFiles.join('\n')}\n</modified-files>`);
  }
  return parts.join('\n\n');
}

/** Append the tracked-file blocks to a compaction summary. */
export function appendTrackedFilesBlock(summary: string, files: TrackedFiles): string {
  const block = buildTrackedFilesBlock(files);
  if (block.length === 0) return summary;
  return `${summary.trimEnd()}\n\n${block}`;
}
