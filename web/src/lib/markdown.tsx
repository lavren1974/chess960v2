import React from "react";

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\[[^\]]+\]\([^\)]+\))|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];

    // Links: [text](url)
    if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        nodes.push(
          <a key={`${href}-${match.index}`} href={href} className="link link-primary" target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        );
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={`b-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("__") && token.endsWith("__")) {
      nodes.push(<strong key={`b2-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={`i-${match.index}`}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("_") && token.endsWith("_")) {
      nodes.push(<em key={`i2-${match.index}`}>{token.slice(1, -1)}</em>);
    } else {
      nodes.push(token);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function renderMarkdown(md: string): React.ReactNode {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const output: React.ReactNode[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (buf.length === 0) return;
    const text = buf.join(" ").trim();
    if (!text) return;
    output.push(
      <p key={`p-${i}-${output.length}`} className="text-base leading-7 text-base-content/80">
        {renderInline(text)}
      </p>
    );
  };

  let listBuffer: string[] = [];
  const flushList = () => {
    if (listBuffer.length === 0) return;
    output.push(
      <ul key={`ul-${i}-${output.length}`} className="list-disc pl-6 space-y-1">
        {listBuffer.map((item, idx) => (
          <li key={`li-${i}-${idx}`}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  let paraBuffer: string[] = [];

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushParagraph(paraBuffer);
      paraBuffer = [];
      flushList();
      output.push(<hr key={`hr-${i}-${output.length}`} className="my-8 border-base-300" />);
      i++;
      continue;
    }

    // Blank line breaks paragraphs/lists
    if (line.trim() === "") {
      flushParagraph(paraBuffer);
      paraBuffer = [];
      flushList();
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph(paraBuffer);
      paraBuffer = [];
      flushList();
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const content = renderInline(text);
      const base = "mt-8 mb-3 font-bold tracking-tight";
      const sizes: Record<number, string> = {
        1: "text-4xl",
        2: "text-3xl",
        3: "text-2xl",
        4: "text-xl",
        5: "text-lg",
        6: "text-base",
      };
      const className = `${sizes[level] || "text-xl"} ${base}`;
      const key = `h${level}-${i}-${output.length}`;
      switch (level) {
        case 1:
          output.push(<h1 key={key} className={className}>{content}</h1>);
          break;
        case 2:
          output.push(<h2 key={key} className={className}>{content}</h2>);
          break;
        case 3:
          output.push(<h3 key={key} className={className}>{content}</h3>);
          break;
        case 4:
          output.push(<h4 key={key} className={className}>{content}</h4>);
          break;
        case 5:
          output.push(<h5 key={key} className={className}>{content}</h5>);
          break;
        default:
          output.push(<h6 key={key} className={className}>{content}</h6>);
      }
      i++;
      continue;
    }

    // Unordered list items
    const listMatch = line.match(/^[-\u2022]\s+(.*)$/); // dash or bullet
    if (listMatch) {
      const item = listMatch[1];
      listBuffer.push(item);
      i++;
      continue;
    }

    // Otherwise, accumulate paragraph text
    paraBuffer.push(line.trim());
    i++;
  }

  // Flush remaining buffers
  flushParagraph(paraBuffer);
  flushList();

  return <div className="space-y-4">{output}</div>;
}

