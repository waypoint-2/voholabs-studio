import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { BriefRevision, RevisionLearnedOutcome } from '@prisma/client';
import { BriefRevisionRepository } from '@gitroom/nestjs-libraries/database/prisma/brief/brief-revision.repository';
import { BriefDocumentContent } from '@gitroom/nestjs-libraries/agent-brief/brief.types';
import { stableStringify } from '@gitroom/helpers/utils/stable.stringify';
import { renderWordDiff, wordDiff } from '@gitroom/helpers/utils/word.diff';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';

// A document keeps a short tail of history — enough to see what a person
// changed since the agent last looked, not an audit log.
const REVISIONS_PER_DOCUMENT = 20;

export type BriefRevisionDiff = {
  blocksAdded: string[];
  blocksRemoved: string[];
  blocksEdited: { heading: string; diff: string }[];
  changed: string[];
};

// created: written for the first time (or again after a delete). deleted:
// the document was removed. edited: anything else.
export type BriefRevisionChange = 'created' | 'edited' | 'deleted';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class BriefRevisionService {
  constructor(private _briefRevisionRepository: BriefRevisionRepository) {}

  /**
   * Appends the state a document was just saved in. Identical consecutive
   * saves are dropped, so the log only ever holds real changes.
   */
  async capture(
    orgId: string,
    category: string,
    key: string,
    content: BriefDocumentContent,
    // Records that the document was removed, rather than emptied. Stored in
    // the revision only; the document itself is gone.
    options?: { deleted?: boolean }
  ) {
    const stored = options?.deleted ? { ...content, deleted: true } : content;
    const serialized = JSON.stringify(stored);
    const contentHash = sha256(stableStringify(stored));

    const existing = await this._briefRevisionRepository.getRevisions(
      orgId,
      category,
      key,
      REVISIONS_PER_DOCUMENT + 1
    );

    if (existing[0]?.contentHash === contentHash) {
      return;
    }

    await this._briefRevisionRepository.create({
      organizationId: orgId,
      category,
      key,
      content: serialized,
      contentHash,
    });

    const overflow = existing.slice(REVISIONS_PER_DOCUMENT - 1);
    if (overflow.length) {
      await this._briefRevisionRepository.deleteByIds(
        overflow.map((revision) => revision.id)
      );
    }
  }

  deleteDocument(orgId: string, category: string, key: string) {
    return this._briefRevisionRepository.deleteDocument(orgId, category, key);
  }

  /**
   * Documents that have changed since they were last marked as learned from,
   * each with what changed. Who made the change is not recorded, so a note the
   * agent wrote itself shows up here the same as an edit somebody else made.
   */
  async getLearningQueue(
    orgId: string,
    options: {
      category?: string;
      key?: string;
      includeLearned?: boolean;
    } = {}
  ) {
    const all = await this._briefRevisionRepository.getLatestPerDocument(orgId);

    const documents = all.reduce((grouped, revision) => {
      if (options.category && revision.category !== options.category) {
        return grouped;
      }

      if (options.key && revision.key !== options.key) {
        return grouped;
      }

      const id = `${revision.category}/${revision.key}`;
      grouped.set(id, [...(grouped.get(id) || []), revision]);
      return grouped;
    }, new Map<string, BriefRevision[]>());

    return Array.from(documents.entries()).reduce((queue, [id, revisions]) => {
      const latest = revisions[0];

      if (!latest || (latest.learnedAt && !options.includeLearned)) {
        return queue;
      }

      // Compare against the last state that was signed off. Falling back to the
      // oldest revision kept means a document nobody has reviewed yet still
      // shows its whole history of change rather than nothing at all.
      const older = revisions.slice(1);
      const baseline =
        older.find((revision) => !!revision.learnedAt) ||
        older[older.length - 1];

      const deleted = this.isDeleted(latest.content);

      // A document written for the first time has nothing to compare against.
      // Only its removal is reported without an earlier revision.
      if (!baseline && !deleted) {
        return queue;
      }

      const change: BriefRevisionChange = deleted
        ? 'deleted'
        : this.isDeleted(baseline.content)
        ? 'created'
        : 'edited';

      queue.push({
        id,
        category: latest.category,
        key: latest.key,
        editedAt: latest.createdAt,
        learned: !!latest.learnedAt,
        revisionId: latest.id,
        change,
        diff: this.computeDiff(
          // A removal with no earlier revision: nothing left to compare.
          this.parseContent((baseline || latest).content),
          this.parseContent(latest.content)
        ),
      });

      return queue;
    }, [] as {
      id: string;
      category: string;
      key: string;
      editedAt: Date;
      learned: boolean;
      revisionId: string;
      change: BriefRevisionChange;
      diff: BriefRevisionDiff;
    }[]);
  }

  async markLearned(
    orgId: string,
    ids: string[],
    outcome: RevisionLearnedOutcome
  ) {
    const marked: string[] = [];

    for (const id of ids) {
      const [category, ...rest] = id.split('/');
      const key = rest.join('/');

      if (!category || !key) {
        continue;
      }

      const [latest] = await this._briefRevisionRepository.getRevisions(
        orgId,
        category,
        key,
        1
      );

      if (!latest) {
        continue;
      }

      await this._briefRevisionRepository.markLearned(latest.id, outcome);
      marked.push(id);
    }

    return marked;
  }

  /**
   * Blocks are matched by heading rather than by id: the agent mints fresh ids
   * every time it rewrites a document, and the heading is what identifies a
   * rule to everyone involved anyway.
   */
  computeDiff(
    before: BriefDocumentContent,
    after: BriefDocumentContent
  ): BriefRevisionDiff {
    const beforeBlocks = this.blocksByHeading(before);
    const afterBlocks = this.blocksByHeading(after);

    const blocksAdded: string[] = [];
    const blocksEdited: { heading: string; diff: string }[] = [];

    afterBlocks.forEach((block, heading) => {
      const previous = beforeBlocks.get(heading);

      if (!previous) {
        blocksAdded.push(block.heading);
        return;
      }

      const from = this.toPlainText(previous.body);
      const to = this.toPlainText(block.body);

      if (from !== to) {
        blocksEdited.push({
          heading: block.heading,
          diff: renderWordDiff(wordDiff(from, to)),
        });
      }
    });

    const blocksRemoved = Array.from(beforeBlocks.entries())
      .filter(([heading]) => !afterBlocks.has(heading))
      .map(([, block]) => block.heading);

    const changed = ['title', 'links', 'assets'].filter(
      (field) =>
        stableStringify((before as any)[field]) !==
        stableStringify((after as any)[field])
    );

    return { blocksAdded, blocksRemoved, blocksEdited, changed };
  }

  parseContent(raw: string): BriefDocumentContent {
    try {
      const parsed = JSON.parse(raw || '{}');
      return {
        v: 1,
        blocks: Array.isArray(parsed?.blocks) ? parsed.blocks : [],
        ...(parsed?.links ? { links: parsed.links } : {}),
        ...(parsed?.assets ? { assets: parsed.assets } : {}),
        ...(parsed?.title ? { title: parsed.title } : {}),
      };
    } catch (err) {
      return { v: 1, blocks: [] };
    }
  }

  private isDeleted(raw: string) {
    try {
      return !!JSON.parse(raw || '{}')?.deleted;
    } catch (err) {
      return false;
    }
  }

  private blocksByHeading(content: BriefDocumentContent) {
    return (content.blocks || []).reduce((all, block) => {
      all.set((block?.heading || '').trim().toLowerCase(), block);
      return all;
    }, new Map<string, { heading: string; body: string }>());
  }

  private toPlainText(body?: string) {
    return stripHtmlValidation('none', body || '').trim();
  }
}
