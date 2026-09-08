import { render, screen, waitFor } from "@testing-library/react"
import { useEffect, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { getPartialContent, requestChatTurn, sendToolResults } from "@/features/assistant/provider"

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function sseDone(): string {
  return "data: [DONE]\n\n"
}

function contentEvent(content: string): string {
  return sseData({ choices: [{ delta: { content } }] })
}

function toolEvent(
  parts: Array<{
    index?: number
    id?: string
    name?: string
    argsFragment?: string
  }>,
): string {
  return sseData({
    choices: [
      {
        delta: {
          tool_calls: parts.map((part) => ({
            ...(part.index !== undefined ? { index: part.index } : {}),
            ...(part.id ? { id: part.id } : {}),
            type: "function",
            function: {
              ...(part.name ? { name: part.name } : {}),
              ...(part.argsFragment !== undefined ? { arguments: part.argsFragment } : {}),
            },
          })),
        },
      },
    ],
  })
}

function sseResponse(pieces: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece))
      controller.close()
    },
  })
  return new Response(stream, { headers: { "content-type": "text/event-stream" } })
}

function errorAfterFirstChunk(firstPiece: string, error: Error): Response {
  const encoder = new TextEncoder()
  let pulled = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled === 0) {
        pulled += 1
        controller.enqueue(encoder.encode(firstPiece))
      } else {
        controller.error(error)
      }
    },
  })
  return new Response(stream, { headers: { "content-type": "text/event-stream" } })
}

function delayedResponse(first: string, second: string, delayMs: number): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(first))
      setTimeout(() => {
        try {
          controller.enqueue(encoder.encode(second))
          controller.close()
        } catch {
          // Test teardown closed the reader first.
        }
      }, delayMs)
    },
  })
  return new Response(stream, { headers: { "content-type": "text/event-stream" } })
}

function stubFetchWith(
  responses: Response[] | ((url: string, init?: unknown) => Response | Promise<Response>),
) {
  if (typeof responses === "function") {
    vi.stubGlobal("fetch", vi.fn(responses))
    return
  }
  const queue = [...responses]
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      const next = queue.shift()
      if (!next) throw new Error("fetch queue exhausted")
      return Promise.resolve(next)
    }),
  )
}

function errorStub(status: number, detail: string): Response {
  return new Response(detail, { status, headers: { "content-type": "text/plain" } })
}

function jsonStub(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

const turnOptions = {
  baseURL: "https://x.test/v1",
  apiKey: "",
  model: "m",
  system: "s",
  history: [{ role: "user" as const, content: "hi" }],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("streaming chat completions (SSE)", () => {
  it("accumulates content deltas across chunks with progressive callbacks", async () => {
    stubFetchWith([sseResponse([contentEvent("Hello "), contentEvent("world"), sseDone()])])
    const seen: string[] = []
    const turn = await requestChatTurn({
      ...turnOptions,
      tools: [],
      onContent: (content) => {
        seen.push(content)
      },
    })
    expect(turn.content).toBe("Hello world")
    expect(turn.toolCalls).toEqual([])
    expect(seen).toEqual(["Hello ", "Hello world"])
  })

  it("reassembles a data line split across network chunks", async () => {
    const event = contentEvent("split-line")
    const cut = Math.floor(event.length / 2)
    stubFetchWith([sseResponse([event.slice(0, cut), event.slice(cut), sseDone()])])
    const turn = await requestChatTurn({ ...turnOptions, tools: [] })
    expect(turn.content).toBe("split-line")
  })

  it("accumulates split tool-call argument fragments before returning complete calls", async () => {
    const executed: string[] = []
    stubFetchWith([
      sseResponse([
        toolEvent([
          { index: 0, id: "call_1", name: "spending_by_category", argsFragment: '{"categ' },
        ]),
        toolEvent([{ index: 0, argsFragment: 'ory":"Groceries"}' }]),
        sseDone(),
      ]),
    ])
    const turn = await requestChatTurn({
      ...turnOptions,
      tools: [
        {
          type: "function" as const,
          function: { name: "spending_by_category", description: "spending", parameters: {} },
        },
      ],
      onContent: (content) => {
        executed.push(content)
      },
    })
    // Tools run only after arguments are complete: the provider returns one
    // whole call here; execution happens later in the panel, never mid-stream.
    expect(turn.toolCalls).toHaveLength(1)
    expect(turn.toolCalls[0]).toMatchObject({
      id: "call_1",
      name: "spending_by_category",
      args: { category: "Groceries" },
    })
    expect(executed).toEqual([])
    expect(turn.content).toBe("")
  })

  it("handles [DONE] and ignores trailing noise", async () => {
    stubFetchWith([sseResponse([contentEvent("done"), sseDone(), "data: [DONE]\n\n"])])
    const turn = await requestChatTurn({ ...turnOptions, tools: [] })
    expect(turn.content).toBe("done")
  })

  it("surfaces what arrived plus the error on mid-stream failure", async () => {
    stubFetchWith([errorAfterFirstChunk(contentEvent("partial"), new TypeError("fetch failed"))])
    const seen: string[] = []
    const failure = await requestChatTurn({
      ...turnOptions,
      tools: [],
      onContent: (content) => {
        seen.push(content)
      },
    }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).not.toBeNull()
    expect(seen).toEqual(["partial"])
    expect(getPartialContent(failure)).toBe("partial")
  })

  it("halts mid-stream cleanly on abort without executing partial calls", async () => {
    const controller = new AbortController()
    stubFetchWith([sseResponse([contentEvent("first"), contentEvent("second"), sseDone()])])
    const seen: string[] = []
    const failure = await requestChatTurn({
      ...turnOptions,
      tools: [
        {
          type: "function" as const,
          function: { name: "spending_by_category", description: "spending", parameters: {} },
        },
      ],
      signal: controller.signal,
      onContent: (content) => {
        seen.push(content)
        if (content) controller.abort()
      },
    }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure instanceof DOMException && failure.name === "AbortError").toBe(true)
    expect(seen).toEqual(["first"])
  })

  it("retries once without stream when the provider rejects streaming", async () => {
    const bodies: unknown[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: { body?: unknown }) => {
        const raw = typeof init?.body === "string" ? init.body : "{}"
        bodies.push(JSON.parse(raw) as unknown)
        if (bodies.length === 1) return Promise.resolve(errorStub(400, "streaming not supported"))
        return Promise.resolve(jsonStub({ choices: [{ message: { content: "plain answer" } }] }))
      }),
    )
    const turn = await requestChatTurn({ ...turnOptions, tools: [] })
    expect(turn.content).toBe("plain answer")
    expect(bodies).toHaveLength(2)
    expect(bodies[0]).toMatchObject({ stream: true, temperature: 0.2, model: "m" })
    expect(bodies[1]).not.toHaveProperty("stream")
    expect(bodies[1]).toMatchObject({ temperature: 0.2, model: "m" })
  })

  it("keeps temperature and model identical across streaming and fallback bodies", async () => {
    const bodies: unknown[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: { body?: unknown }) => {
        const raw = typeof init?.body === "string" ? init.body : "{}"
        bodies.push(JSON.parse(raw) as unknown)
        return Promise.resolve(sseResponse([contentEvent("ok"), sseDone()]))
      }),
    )
    const turn = await requestChatTurn({ ...turnOptions, tools: [] })
    expect(turn.content).toBe("ok")
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ stream: true, temperature: 0.2, model: "m" })
  })

  it("streams follow-up answers after tool results", async () => {
    stubFetchWith([sseResponse([contentEvent("final "), contentEvent("answer"), sseDone()])])
    const seen: string[] = []
    const answer = await sendToolResults({
      baseURL: "https://x.test/v1",
      apiKey: "",
      model: "m",
      system: "s",
      history: [{ role: "user", content: "hi" }],
      pendingAssistantContent: "",
      pendingToolCalls: [{ id: "call_1", name: "spending_by_category", args: {} }],
      toolOutputs: [{ id: "call_1", name: "spending_by_category", output: { ok: true } }],
      onContent: (content) => {
        seen.push(content)
      },
    })
    expect(answer).toBe("final answer")
    expect(seen).toEqual(["final ", "final answer"])
  })
})

describe("streaming progressive rendering", () => {
  it("renders progressive updates as deltas arrive", async () => {
    stubFetchWith([
      delayedResponse(contentEvent("Hello "), `${contentEvent("world")}${sseDone()}`, 200),
    ])
    function Probe() {
      const [content, setContent] = useState("")
      useEffect(() => {
        let cancelled = false
        void requestChatTurn({ ...turnOptions, tools: [], onContent: setContent }).then((turn) => {
          if (!cancelled) setContent(turn.content)
        })
        return () => {
          cancelled = true
        }
      }, [])
      return <p data-testid="streaming-content">{content}</p>
    }
    render(<Probe />)
    // Progressive: the first delta paints (exact textContent, no whitespace
    // normalization) before the stream completes with the full answer.
    await waitFor(() => expect(screen.getByTestId("streaming-content").textContent).toBe("Hello "))
    await waitFor(() =>
      expect(screen.getByTestId("streaming-content").textContent).toBe("Hello world"),
    )
  })
})
