import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import z from 'zod';
import {
  checkAuth,
  paidOnly,
} from '@gitroom/nestjs-libraries/chat/auth.context';
import { SkillsService } from '@gitroom/nestjs-libraries/database/prisma/skills/skills.service';

@Injectable()
export class SkillsListTool implements AgentToolInterface {
  constructor(private _skills: SkillsService) {}
  name = 'skillsList';

  run() {
    return createTool({
      id: 'skillsList',
      description: `The Studio skills library: proven, step-by-step methods for content jobs (editing out AI-sounding writing, hooks, writing in the user's voice, shaping a post for each channel, repurposing, learning from results).
This returns a short catalog only: slug, name, one-line summary, when to use it, tags, and "usesBrief" (true when the skill reads the user's brief and works best once the brief is filled in). It never returns the instructions themselves.
How to use it: call this once at the start of a content task, pick at most one or two skills whose "whenToUse" matches the task, then read only those with skillGet and follow them. Do not read every skill. Narrow the list with a tag key (from "tags") or a search word when it is long. Using skills is free.`,
      mcp: {
        annotations: {
          title: 'List Skills',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        tag: z
          .string()
          .optional()
          .describe('Only skills with this tag key, e.g. "writing"'),
        search: z
          .string()
          .optional()
          .describe('Words to look for in the skill name, summary or tags'),
      }),
      outputSchema: z.object({
        tags: z
          .array(z.object({ key: z.string(), label: z.string() }))
          .optional(),
        skills: z
          .array(
            z.object({
              slug: z.string(),
              name: z.string(),
              summary: z.string(),
              whenToUse: z.string().nullable(),
              tags: z.array(z.string()),
              usesBrief: z.boolean(),
            })
          )
          .optional(),
        hint: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const blocked = paidOnly(context, 'The skills library', 'skills');
        if (blocked) {
          return { error: blocked };
        }
        try {
          const { tags, skills } = await this._skills.list({
            tag: inputData.tag,
            search: inputData.search,
          });
          return {
            tags,
            // A catalog, not the skills: the bodies and tool lists stay
            // behind skillGet so listing never floods the agent's context.
            skills: skills.map((skill) => ({
              slug: skill.slug,
              name: skill.name,
              summary: skill.summary,
              whenToUse: skill.whenToUse,
              tags: skill.tags,
              usesBrief: skill.usesBrief,
            })),
            hint: skills.length
              ? 'Pick the one or two skills that fit this task and read only those with skillGet.'
              : 'No skills match. Try another tag or search, or omit both to see every skill.',
          };
        } catch (err) {
          return {
            error:
              'Could not read the skills library right now. Try again shortly.',
          };
        }
      },
    });
  }
}
