import type { ReactNode } from "react"
import { useMemo } from "react"

import { ChartBlock } from "@/features/assistant/chart-block"
import type { Cite } from "@/features/assistant/citations"

function hashKey(seed: string): string {
  let hash = 5381
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

function isSafeUrl(url: string): boolean {
  return /^https?:\/\/[^\s<>"']+$/.test(url)
}

function CiteLink({ cite, navigate }: { cite: Cite; navigate?: (href: string) => void }) {
  return (
    <a
      href={cite.href}
      title={cite.label}
      aria-label={`Open supporting transactions: ${cite.label}`}
      onClick={
        navigate
          ? (event) => {
              event.preventDefault()
              navigate(cite.href)
            }
          : undefined
      }
      className="ml-0.5 rounded-md bg-accent px-1 py-px align-super text-[10px] font-semibold text-accent-foreground no-underline"
    >
      [{cite.index}]
    </a>
  )
}

function renderInline(
  text: string,
  keyPrefix: string,
  cites?: Cite[],
  navigate?: (href: string) => void,
): ReactNode[] {
  const pattern =
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\[\[cite:\d+\]\]|\[[^\]]+\]\(https?:[^)\s]+\))/g
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let ordinal = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const token = match[0]
    const before = text.slice(lastIndex, match.index)
    if (before) nodes.push(before)
    lastIndex = match.index + token.length
    ordinal += 1
    const key = `${keyPrefix}-${hashKey(token)}-${ordinal}`
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={key}>{renderInline(token.slice(2, -2), `${key}-b`, cites, navigate)}</strong>,
      )
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), `${key}-i`, cites, navigate)}</em>)
    } else if (token.startsWith("[[cite:")) {
      const number = Number.parseInt(token.slice("[[cite:".length, -2), 10)
      const cite = Number.isFinite(number)
        ? cites?.find((entry) => entry.index === number)
        : undefined
      nodes.push(
        cite ? (
          <CiteLink key={key} cite={cite} {...(navigate ? { navigate } : {})} />
        ) : (
          <span key={key}>{token}</span>
        ),
      )
    } else {
      const separator = token.lastIndexOf("](")
      const label = token.slice(1, separator)
      const url = token.slice(separator + 2, -1)
      nodes.push(
        isSafeUrl(url) ? (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {label || url}
          </a>
        ) : (
          <span key={key}>{label || token}</span>
        ),
      )
    }
  }
  const tail = text.slice(lastIndex)
  if (tail) nodes.push(tail)
  return nodes
}

function renderBlocks(
  source: string,
  keyPrefix: string,
  cites?: Cite[],
  navigate?: (href: string) => void,
): ReactNode[] {
  const blocks = source.split(/\n{2,}/)
  const nodes: ReactNode[] = []
  let chain = keyPrefix
  let index = 0

  const push = (node: ReactNode, block: string) => {
    index += 1
    chain = hashKey(`${chain}|${block.slice(0, 48)}`)
    nodes.push(
      <div key={`${chain}-${index}`} className="contents">
        {node}
      </div>,
    )
  }

  for (const raw of blocks) {
    const block = raw.replace(/^\n+|\n+$/g, "")
    if (!block) continue

    const fenced = block.match(/^```([\w-]*)\n([\s\S]*?)```$/)
    if (fenced) {
      const info = fenced[1] ?? ""
      const code = fenced[2]?.replace(/\n$/, "") ?? ""
      if (info === "budgetlens-chart") {
        try {
          const parsed: unknown = JSON.parse(code)
          push(<ChartBlock spec={parsed} />, block)
        } catch {
          push(
            <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-xs">
              <code>{code}</code>
            </pre>,
            block,
          )
        }
        continue
      }
      push(
        <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-xs">
          <code>{code}</code>
        </pre>,
        block,
      )
      continue
    }

    const heading = block.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = heading[1]?.length ?? 1
      const content = renderInline(heading[2] ?? "", `${keyPrefix}-h`, cites, navigate)
      const className = level <= 2 ? "text-sm font-semibold" : "text-sm font-medium"
      if (level === 1) push(<h4 className={className}>{content}</h4>, block)
      else if (level === 2) push(<h5 className={className}>{content}</h5>, block)
      else push(<h6 className={className}>{content}</h6>, block)
      continue
    }

    const lines = block.split("\n")
    if (lines.length > 1 && lines.every((line) => /^\s*\|.*\|\s*$/.test(line))) {
      const rows = lines
        .filter((line) => !/^\s*\|[\s:|-]+\|\s*$/.test(line))
        .map((line) =>
          line
            .trim()
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((cell) => cell.trim()),
        )
      const [header, ...body] = rows
      if (header && body.length > 0) {
        push(
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  {header.map((cell) => (
                    <th
                      key={hashKey(`h${cell}`)}
                      className="border-b px-2 py-1 text-left font-semibold"
                    >
                      {renderInline(cell, `${keyPrefix}-th`, cites, navigate)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row) => (
                  <tr key={hashKey(`r${row.join("~")}`)} className="border-b last:border-0">
                    {row.map((cell) => (
                      <td key={hashKey(`c${cell}`)} className="px-2 py-1 align-top">
                        {renderInline(cell, `${keyPrefix}-td`, cites, navigate)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
          block,
        )
        continue
      }
    }

    if (lines.every((line) => /^\s*([-*•]|\d+[.)])\s+\S/.test(line))) {
      const ordered = /^\s*\d+[.)]/.test(lines[0] ?? "")
      const items = lines.map((line) => line.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))
      const list = items.map((item) => (
        <li key={hashKey(`li${item}`)}>{renderInline(item, `${keyPrefix}-li`, cites, navigate)}</li>
      ))
      push(
        ordered ? (
          <ol className="list-decimal space-y-1 pl-5">{list}</ol>
        ) : (
          <ul className="list-disc space-y-1 pl-5">{list}</ul>
        ),
        block,
      )
      continue
    }

    if (lines.every((line) => /^\s*>\s?/.test(line))) {
      push(
        <blockquote className="border-l-2 pl-3 text-muted-foreground">
          {renderInline(
            lines.map((line) => line.replace(/^\s*>\s?/, "")).join("\n"),
            `${keyPrefix}-q`,
            cites,
            navigate,
          )}
        </blockquote>,
        block,
      )
      continue
    }

    push(
      <p className="whitespace-pre-wrap">
        {renderInline(block, `${keyPrefix}-p`, cites, navigate)}
      </p>,
      block,
    )
  }

  return nodes
}

export function Markdown({
  text,
  id,
  cites,
  navigate,
}: {
  text: string
  id: string
  cites?: Cite[]
  navigate?: (href: string) => void
}) {
  const nodes = useMemo(() => renderBlocks(text, id, cites, navigate), [text, id, cites, navigate])
  return <div className="space-y-2 leading-relaxed">{nodes}</div>
}
