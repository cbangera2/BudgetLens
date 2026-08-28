import { useMemo } from "react"
import { formatMoney } from "@/features/dashboard/format"
import { cn } from "@/lib/cn"

interface SankeyChartProps {
  data: readonly {
    from: string
    to: string
    value: number
  }[]
  height?: number
  nodePadding?: number
  nodeWidth?: number
  nodeSpacing?: number
}

interface SankeyNode {
  name: string
  value: number
  depth: number
  layer: number
  x0: number
  x1: number
  y0: number
  y1: number
}

interface SankeyLink {
  source: SankeyNode
  target: SankeyNode
  value: number
}

function computeSankeyLayout(
  data: SankeyChartProps["data"],
  options: {
    width: number
    height: number
    nodeWidth: number
    nodePadding: number
    nodeSpacing: number
  },
): { nodes: SankeyNode[]; links: SankeyLink[] } {
  const nodeMap = new Map<string, SankeyNode>()
  const linkMap = new Map<string, SankeyLink>()

  data.forEach((link) => {
    if (!nodeMap.has(link.from)) {
      nodeMap.set(link.from, {
        name: link.from,
        value: 0,
        depth: 0,
        layer: 0,
        x0: 0,
        x1: 0,
        y0: 0,
        y1: 0,
      })
    }
    if (!nodeMap.has(link.to)) {
      nodeMap.set(link.to, {
        name: link.to,
        value: 0,
        depth: 0,
        layer: 0,
        x0: 0,
        x1: 0,
        y0: 0,
        y1: 0,
      })
    }
    const source = nodeMap.get(link.from)!
    const target = nodeMap.get(link.to)!
    source.value += link.value
    target.value += link.value
  )

  const nodes = Array.from(nodeMap.values())
  const links = data.map((d) => ({
    source: nodeMap.get(d.from)!,
    target: nodeMap.get(d.to)!,
    value: d.value,
  }))

  const nodeWidth = 24
  const nodePadding = 16
  const nodeSpacing = 8
  const nodeDepth = 4

  const maxDepth = Math.max(...nodes.map((n) => n.depth))
  const nodeDepthStep = 200

  nodes.forEach((node) => {
    node.x0 = node.layer * nodeDepthStep
    node.x1 = node.x0 + 24
  })

  const layers = new Map<number, SankeyNode[]>()
  nodes.forEach((node) => {
    const layer = Math.floor(node.x0 / 200)
    node.layer = layer
    if (!layers.has(layer)) layers.set(layer, [])
    layers.get(layer)!.push(node)
  })

  layers.forEach((nodesInLayer, layer) => {
    const totalHeight = nodesInLayer.reduce((sum, n) => sum + 30, 0)
    const availableHeight = 500 - (nodesInLayer.length - 1) * 8
    const scale = availableHeight / totalHeight
    let y = 0
    nodesInLayer.forEach((node, i) => {
      node.y0 = y + i * 8
      node.y1 = y + 30 * scale
      y = node.y1
    })
  })

  return { nodes, links }
}

interface SankeyChartProps {
  data: readonly {
    from: string
    to: string
    value: number
  }[]
  height?: number
  nodePadding?: number
  nodeWidth?: number
  nodeSpacing?: number
}

export function SankeyChart({
  data,
  height = 400,
}: SankeyChartProps) {
  const layout = useMemo(
    () => computeSankeyLayout(data, { width: 800, height, nodeWidth: 24, nodePadding: 16, nodeSpacing: 8 }),
    [data],
  )

  return (
    <div style={{ width: "100%", height }}>
      <svg width="100%" height={height} viewBox={`0 0 800 ${height}`}>
        <defs>
          <linearGradient id="link-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--chart-secondary)" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        {layout.links.map((link, i) => {
          const path = `M ${link.source.x1} ${link.source.y0} C ${link.source.x1 + 100} ${link.source.y0}, ${link.target.x0 - 100} ${link.target.y0}, ${link.target.x0} ${link.target.y0}`
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke="url(#link-gradient)"
              strokeWidth={Math.max(2, link.value / Math.max(...layout.links.map((l) => l.value)) * 20)}
              style={{ opacity: 0.6 }}
            />
          )
        })}
        {layout.nodes.map((node) => (
          <g key={node.name}>
            <rect
              x={node.x0}
              y={node.y0}
              width={24}
              height={node.y1 - node.y0}
              fill="var(--primary)"
              rx={2}
            />
            <text
              x={node.x0 + 30}
              y={node.y0 + (node.y1 - node.y0) / 2}
              dominantBaseline="middle"
              fontSize="12"
              fill="var(--foreground)"
            >
              {node.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}