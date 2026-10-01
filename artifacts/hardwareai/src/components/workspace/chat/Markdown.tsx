import { memo, useMemo, type ReactNode } from "react";

// A deliberately small markdown subset for assistant replies: paragraphs,
// line breaks, **bold**, `inline code`, bullet lists and numbered lists.
// Everything is rendered as React elements — never as raw HTML.

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  | { type: "code"; text: string };

export interface ListItem {
  /** The number as written, for ordered lists ("3." → 3). */
  number?: number;
  /** One entry per visual line; continuation lines are appended here. */
  lines: Inline[][];
}

export type Block =
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "heading"; content: Inline[] }
  | { type: "list"; ordered: boolean; items: ListItem[] };

const INLINE_RE = /`([^`\n]+)`|\*\*(\S(?:[^\n]*?\S)?)\*\*/g;
const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const NUMBERED_RE = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const HEADING_RE = /^\s{0,3}#{1,6}\s+(.*)$/;
const CONTINUATION_RE = /^\s{2,}\S/;

/** Split one line into text, bold and inline-code runs. */
export function parseInline(text: string, allowBold = true): Inline[] {
  const out: Inline[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = out[out.length - 1];
    if (last && last.type === "text") last.text += value;
    else out.push({ type: "text", text: value });
  };

  const re = new RegExp(INLINE_RE.source, "g");
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    pushText(text.slice(cursor, m.index));
    if (m[1] !== undefined) {
      out.push({ type: "code", text: m[1] });
    } else if (allowBold) {
      out.push({ type: "bold", children: parseInline(m[2], false) });
    } else {
      pushText(m[0]);
    }
    cursor = m.index + m[0].length;
  }
  pushText(text.slice(cursor));
  return out;
}

type ListBlock = Extract<Block, { type: "list" }>;

/** Turn a reply into blocks. Pure: same text in, same blocks out. */
export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const open = {
    paragraph: null as Inline[][] | null,
    list: null as ListBlock | null,
    // A blank line inside a list only ends it if the next line isn't another
    // item of the same kind ("loose" lists keep their numbering).
    listGap: false,
  };

  const closeParagraph = () => {
    if (open.paragraph) blocks.push({ type: "paragraph", lines: open.paragraph });
    open.paragraph = null;
  };
  const closeList = () => {
    open.list = null;
    open.listGap = false;
  };
  const addItem = (ordered: boolean, item: ListItem) => {
    closeParagraph();
    if (!open.list || open.list.ordered !== ordered) {
      open.list = { type: "list", ordered, items: [] };
      blocks.push(open.list);
    }
    open.list.items.push(item);
    open.listGap = false;
  };

  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.trim() === "") {
      closeParagraph();
      if (open.list) open.listGap = true;
      continue;
    }

    const numbered = NUMBERED_RE.exec(line);
    if (numbered) {
      addItem(true, { number: parseInt(numbered[1], 10), lines: [parseInline(numbered[2])] });
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      addItem(false, { lines: [parseInline(bullet[1])] });
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      closeParagraph();
      closeList();
      blocks.push({ type: "heading", content: parseInline(heading[1]) });
      continue;
    }

    // An indented line directly under a list item belongs to that item.
    if (open.list && !open.listGap && CONTINUATION_RE.test(line)) {
      open.list.items[open.list.items.length - 1].lines.push(parseInline(line.trim()));
      continue;
    }

    closeList();
    const parsed = parseInline(line.trim());
    if (open.paragraph) open.paragraph.push(parsed);
    else open.paragraph = [parsed];
  }
  closeParagraph();
  return blocks;
}

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, i) => {
    if (node.type === "bold") {
      return (
        <strong key={i} className="font-bold text-foreground">
          {renderInline(node.children)}
        </strong>
      );
    }
    if (node.type === "code") {
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 text-[0.92em] text-primary">
          {node.text}
        </code>
      );
    }
    return <span key={i}>{node.text}</span>;
  });
}

function renderLines(lines: Inline[][]): ReactNode[] {
  return lines.map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {renderInline(line)}
    </span>
  ));
}

function MarkdownImpl({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className="space-y-2 break-words">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <p key={i} className="font-bold text-foreground">
              {renderInline(block.content)}
            </p>
          );
        }
        if (block.type === "list") {
          const items = block.items.map((item, j) => (
            <li key={j} value={block.ordered ? item.number : undefined} className="pl-0.5">
              {renderLines(item.lines)}
            </li>
          ));
          return block.ordered ? (
            <ol key={i} className="list-decimal space-y-1 pl-6 marker:text-muted-foreground">
              {items}
            </ol>
          ) : (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
              {items}
            </ul>
          );
        }
        return <p key={i}>{renderLines(block.lines)}</p>;
      })}
    </div>
  );
}

const Markdown = memo(MarkdownImpl);
export default Markdown;
