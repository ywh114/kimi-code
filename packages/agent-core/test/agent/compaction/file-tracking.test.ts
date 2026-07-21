import { describe, expect, it } from 'vitest';

import {
  appendTrackedFilesBlock,
  buildTrackedFilesBlock,
  collectTrackedFilesFromHistory,
  extractToolCallFileOps,
  MAX_TRACKED_FILES_PER_LIST,
  mergeTrackedFiles,
} from '../../../src/agent/compaction/file-tracking';
import type { ContextMessage } from '../../../src/agent/context/types';

function assistantWithCalls(
  calls: Array<{ name: string; arguments: string | null }>,
): ContextMessage {
  return {
    role: 'assistant',
    content: [],
    toolCalls: calls.map((call, i) => ({
      type: 'function' as const,
      id: `call-${String(i)}`,
      name: call.name,
      arguments: call.arguments,
    })),
  };
}

function compactionSummaryMessage(text: string): ContextMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    toolCalls: [],
    origin: { kind: 'compaction_summary' },
  };
}

describe('extractToolCallFileOps', () => {
  it('collects read and modified paths from tool calls', () => {
    const history = [
      assistantWithCalls([
        { name: 'Read', arguments: '{"path":"/a.ts"}' },
        { name: 'Edit', arguments: '{"path":"/b.ts","old_string":"x","new_string":"y"}' },
        { name: 'Write', arguments: '{"path":"/c.ts","content":"..."}' },
        { name: 'Grep', arguments: '{"pattern":"foo","path":"/src"}' },
        { name: 'ReadMediaFile', arguments: '{"path":"/img.png"}' },
        { name: 'Bash', arguments: '{"command":"echo hi > /nope.txt"}' },
      ]),
    ];

    const ops = extractToolCallFileOps(history);

    expect(ops.readFiles).toEqual(['/a.ts', '/src', '/img.png']);
    expect(ops.modifiedFiles).toEqual(['/b.ts', '/c.ts']);
  });

  it('ignores calls without a usable path', () => {
    const history = [
      assistantWithCalls([
        { name: 'Read', arguments: null },
        { name: 'Read', arguments: 'not json' },
        { name: 'Read', arguments: '{"path":""}' },
        { name: 'Read', arguments: '{"other":1}' },
        { name: 'Grep', arguments: '{"pattern":"foo"}' },
        { name: 'Edit', arguments: '{"path":"/b.ts"}' },
      ]),
    ];

    const ops = extractToolCallFileOps(history);

    expect(ops.readFiles).toEqual([]);
    expect(ops.modifiedFiles).toEqual(['/b.ts']);
  });
});

describe('mergeTrackedFiles', () => {
  it('unions in first-seen order without duplicates', () => {
    const merged = mergeTrackedFiles(
      { readFiles: ['/a', '/b'], modifiedFiles: ['/x'] },
      { readFiles: ['/b', '/c'], modifiedFiles: ['/y', '/x'] },
    );

    expect(merged.readFiles).toEqual(['/a', '/b', '/c']);
    expect(merged.modifiedFiles).toEqual(['/x', '/y']);
  });

  it('caps lists by dropping the oldest entries', () => {
    const many = Array.from({ length: MAX_TRACKED_FILES_PER_LIST + 10 }, (_, i) => `/f${String(i)}`);
    const merged = mergeTrackedFiles({ readFiles: many, modifiedFiles: [] }, { readFiles: [], modifiedFiles: [] });

    expect(merged.readFiles).toHaveLength(MAX_TRACKED_FILES_PER_LIST);
    expect(merged.readFiles[0]).toBe('/f10');
    expect(merged.readFiles.at(-1)).toBe(`/f${String(MAX_TRACKED_FILES_PER_LIST + 9)}`);
  });
});

describe('tracked-files blocks', () => {
  it('round-trips through build and history collection', () => {
    const files = { readFiles: ['/a.ts', '/b.ts'], modifiedFiles: ['/c.ts'] };
    const summary = appendTrackedFilesBlock('My handoff note.', files);

    expect(summary).toBe(
      'My handoff note.\n\n<read-files>\n/a.ts\n/b.ts\n</read-files>\n\n<modified-files>\n/c.ts\n</modified-files>',
    );

    const recovered = collectTrackedFilesFromHistory([compactionSummaryMessage(summary)]);
    expect(recovered).toEqual(files);
  });

  it('unions multiple compaction summaries in order', () => {
    const first = appendTrackedFilesBlock('note 1', { readFiles: ['/a'], modifiedFiles: [] });
    const second = appendTrackedFilesBlock('note 2', { readFiles: ['/b'], modifiedFiles: ['/x'] });

    const recovered = collectTrackedFilesFromHistory([
      compactionSummaryMessage(first),
      { role: 'user', content: [{ type: 'text', text: 'plain user message with <read-files>\n/fake\n</read-files>' }], toolCalls: [] },
      compactionSummaryMessage(second),
    ]);

    expect(recovered.readFiles).toEqual(['/a', '/b']);
    expect(recovered.modifiedFiles).toEqual(['/x']);
  });

  it('ignores histories without compaction summaries', () => {
    const recovered = collectTrackedFilesFromHistory([
      { role: 'user', content: [{ type: 'text', text: '<read-files>\n/fake\n</read-files>' }], toolCalls: [] },
      assistantWithCalls([{ name: 'Read', arguments: '{"path":"/a"}' }]),
    ]);

    expect(recovered.readFiles).toEqual([]);
    expect(recovered.modifiedFiles).toEqual([]);
  });

  it('returns an empty block for empty tracking', () => {
    expect(buildTrackedFilesBlock({ readFiles: [], modifiedFiles: [] })).toBe('');
    expect(appendTrackedFilesBlock('note', { readFiles: [], modifiedFiles: [] })).toBe('note');
  });
});
