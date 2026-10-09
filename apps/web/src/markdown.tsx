import { Fragment, type ReactNode } from "react";

type Align = "left" | "center" | "right";

type Block =
  | { kind: "code"; text: string }
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; headers: string[]; aligns: Align[]; rows: string[][] }
  | { kind: "paragraph"; text: string };

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  if (blocks.length === 0) return null;
  return (
    <div className="md">
      {blocks.map((block, index) => {
        if (block.kind === "code") {
          return (
            <pre key={index}>
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.kind === "heading") {
          const Tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
          return <Tag key={index}>{inline(block.text)}</Tag>;
        }
        if (block.kind === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{inline(item)}</li>
              ))}
            </Tag>
          );
        }
        if (block.kind === "table") {
          return (
            <div className="md-table" key={index}>
              <table>
                <thead>
                  <tr>
                    {block.headers.map((cell, cellIndex) => (
                      <th key={cellIndex} data-align={block.aligns[cellIndex] ?? "left"}>{inline(cell)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} data-align={block.aligns[cellIndex] ?? "left"}>{inline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={index}>{inline(block.text)}</p>;
      })}
    </div>
  );
}

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.startsWith("```")) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading?.[1] && heading[2]) {
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ kind: "heading", level, text: heading[2] });
      index += 1;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (index < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*([-*]|\d+\.)\s+/, ""));
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    if (isTableStart(lines, index)) {
      const headers = splitRow(line);
      const aligns = splitRow(lines[index + 1] ?? "").map(alignment);
      const width = aligns.length;
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && isTableRow(lines[index] ?? "")) {
        rows.push(fitRow(splitRow(lines[index] ?? ""), width));
        index += 1;
      }
      blocks.push({ kind: "table", headers: fitRow(headers, width), aligns, rows });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && (lines[index] ?? "").trim() !== "" && !(lines[index] ?? "").startsWith("```") && !/^(#{1,3})\s+/.test(lines[index] ?? "") && !/^\s*([-*]|\d+\.)\s+/.test(lines[index] ?? "") && !isTableStart(lines, index)) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }
  return blocks;
}

function isTableRow(line: string): boolean {
  return /^\s*\|/.test(line);
}

function isTableSeparator(line: string): boolean {
  if (!isTableRow(line)) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableStart(lines: string[], index: number): boolean {
  return isTableRow(lines[index] ?? "") && isTableSeparator(lines[index + 1] ?? "");
}

function splitRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (char === "\\" && text[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function fitRow(cells: string[], width: number): string[] {
  return Array.from({ length: width }, (_, index) => cells[index] ?? "");
}

function alignment(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return "left";
}

function inline(source: string): ReactNode[] {
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(source.slice(cursor, start));
    const token = match[0];
    if (token.startsWith("`")) nodes.push(<code key={start}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) nodes.push(<strong key={start}>{token.slice(2, -2)}</strong>);
    else {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      if (link?.[1] && link[2]) {
        nodes.push(
          <a key={start} href={link[2]} target="_blank" rel="noreferrer">
            {link[1]}
          </a>,
        );
      }
    }
    cursor = start + token.length;
  }
  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>);
}
