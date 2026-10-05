import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// Tool descriptions (and the agent instructions) name other tools. Every
// name they use must be one the MCP actually registers, which is each listed
// tool class's `name`. Read from the sources so no service has to be built.

const dir = __dirname;
const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const sources = readdirSync(dir).filter(
  (file) => file.endsWith('.ts') && !file.endsWith('.spec.ts')
);

const toolListSource = read('tool.list.ts');
const listed = (
  toolListSource
    .match(/export const toolList = \[([\s\S]*?)\n\];/)?.[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[A-Z]\w+,?$/.test(line))
    .map((line) => line.replace(',', '')) || []
);

const registered = new Set(
  listed.map((className) => {
    const file = sources.find((one) =>
      new RegExp(`export class ${className}\\b`).test(read(one))
    );
    const name = file && read(file).match(/^\s+name = '(\w+)'/m)?.[1];
    if (!name) {
      throw new Error(`No name found for ${className}`);
    }
    return name;
  })
);

// Code identifiers that end in "Tool" but are not tool names.
const notToolNames = new Set(['createTool', 'callMediaTool']);

// Tools that exist but are not registered (media generation is off), only
// mentioned in their own files.
const unregisteredFiles = [
  'generate.image.tool.ts',
  'generate.video.tool.ts',
  'generate.video.options.tool.ts',
  'video.function.tool.ts',
];

describe('tool names in descriptions', () => {
  it('finds the registered tools', () => {
    expect(registered.size).toBe(listed.length);
    expect(registered.has('markLearned')).toBe(true);
    expect(registered.has('integrationSchedulePostTool')).toBe(true);
  });

  const files = [
    ...sources
      .filter((file) => !unregisteredFiles.includes(file))
      .map((file) => join(dir, file)),
    join(dir, '..', 'load.tools.service.ts'),
  ];

  it.each(files)('%s only names registered tools', (file) => {
    // The internal createTool id is not what the MCP lists, so it is skipped.
    const text = readFileSync(file, 'utf8').replace(/^\s+id: '\w+',$/gm, '');
    const named = Array.from(
      new Set(text.match(/\b[a-z][a-zA-Z]*Tool\b/g) || [])
    ).filter((word) => !notToolNames.has(word));

    expect(named.filter((word) => !registered.has(word))).toEqual([]);
  });
});
