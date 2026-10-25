import type { ReactNode } from 'react';

// Renders text with markdown-style [label](https://...) links as anchors; everything else stays plain text.
const LINK_PATTERN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

export const LinkifiedText = ({ text }: { text: string }) => {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    parts.push(
      <a key={index} href={match[2]} target="_blank" rel="noopener noreferrer">{match[1]}</a>
    );
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
};
