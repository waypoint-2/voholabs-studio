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
export class SkillGetTool implements AgentToolInterface {
  constructor(private _skills: SkillsService) {}
  name = 'skillGet';

  run() {
    return createTool({
      id: 'skillGet',
      description: `Read one skill from the Studio skills library by its slug (from skillsList). Returns what it does, when to use it, the Studio tools it relies on, "usesBrief", and "body": the full step-by-step instructions.
Read only the skills you picked from skillsList for the task in hand, not the whole library. Follow the body as written and use the Studio tools it names rather than outside tools.`,
      mcp: {
        annotations: {
          title: 'Read Skill',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        slug: z.string().describe('The skill slug, from skillsList'),
      }),
      outputSchema: z.object({
        skill: z
          .object({
            slug: z.string(),
            name: z.string(),
            summary: z.string(),
            whatItDoes: z.string().nullable(),
            whenToUse: z.string().nullable(),
            tags: z.array(z.string()),
            tools: z.array(z.string()),
            usesBrief: z.boolean(),
            version: z.string().nullable(),
            body: z.string(),
          })
          .optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const blocked = paidOnly(context, 'The skills library', 'skills');
        if (blocked) {
          return { error: blocked };
        }
        try {
          const skill = await this._skills.get(inputData.slug);
          if (!skill) {
            return {
              error: `No skill with the slug "${inputData.slug}". Use skillsList to see the available skills.`,
            };
          }
          return {
            skill: {
              slug: skill.slug,
              name: skill.name,
              summary: skill.summary,
              whatItDoes: skill.whatItDoes,
              whenToUse: skill.whenToUse,
              tags: skill.tags,
              tools: skill.tools,
              usesBrief: skill.usesBrief,
              version: skill.version,
              body: skill.body,
            },
          };
        } catch (err) {
          return {
            error: 'Could not read the skill right now. Try again shortly.',
          };
        }
      },
    });
  }
}
