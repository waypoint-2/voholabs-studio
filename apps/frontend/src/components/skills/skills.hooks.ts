'use client';

import useSWR from 'swr';
import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export interface SkillTag {
  key: string;
  label: string;
}

export interface SkillSummary {
  slug: string;
  name: string;
  summary: string;
  tags: string[];
  tools: string[];
  whenToUse: string | null;
  // True when the skill reads the user's brief; false when it stands alone.
  usesBrief?: boolean;
}

export interface SkillFull extends SkillSummary {
  whatItDoes: string | null;
  body: string;
}

export interface SkillsList {
  tags: SkillTag[];
  skills: SkillSummary[];
}

// The library, filtered on the server by tag and search. Tags are always the
// full set that active skills use, so the chips stay put while filtering.
export const useSkills = (tag: string, search: string, enabled = true) => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (tag) {
      params.set('tag', tag);
    }
    if (search) {
      params.set('search', search);
    }
    const query = params.toString();
    const response = await fetch(`/skills${query ? `?${query}` : ''}`);
    if (!response.ok) {
      throw new Error('skills');
    }
    return (await response.json()) as SkillsList;
  }, [fetch, tag, search]);
  return useSWR<SkillsList>(enabled ? `skills:${tag}:${search}` : null, load, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
};

export const useSkill = (slug: string | null) => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const response = await fetch(`/skills/${encodeURIComponent(slug || '')}`);
    if (!response.ok) {
      throw new Error('skill');
    }
    return (await response.json()) as SkillFull;
  }, [fetch, slug]);
  return useSWR<SkillFull>(slug ? `skill:${slug}` : null, load, {
    revalidateOnFocus: false,
  });
};
