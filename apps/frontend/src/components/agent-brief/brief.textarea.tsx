'use client';

import { FC, useEffect, useRef } from 'react';

// Plain text, growing with its content. The brief is read by the agent, so the
// body of a block is text rather than markup and there is nothing to format.
export const BriefTextarea: FC<{
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  className?: string;
}> = ({ value, placeholder, onChange, className }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      // User text: English rules in an Arabic UI keep their own direction
      // and punctuation.
      dir="auto"
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={
        className ||
        'w-full bg-transparent outline-none resize-none overflow-hidden text-[14px] leading-[1.65] placeholder:text-textItemBlur'
      }
    />
  );
};
