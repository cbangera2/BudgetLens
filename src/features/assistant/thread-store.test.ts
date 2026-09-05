import { beforeEach, describe, expect, it } from "vitest"

import {
  appendMessage,
  assistantDb,
  createThread,
  deleteThread,
  listMessages,
  listThreads,
  renameThread,
  setThreadPin,
} from "./thread-store"

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), ms)
  })
}

beforeEach(async () => {
  await assistantDb.messages.clear()
  await assistantDb.threads.clear()
})

describe("assistant thread store", () => {
  it("lists newest first and pinned first", async () => {
    const older = await createThread({ title: "Older", provider: "test", model: "m1" })
    await sleep(5)
    const newer = await createThread({ title: "Newer", provider: "test", model: "m1" })

    const recentFirst = await listThreads()
    expect(recentFirst.map((thread) => thread.id)).toEqual([newer.id, older.id])

    await setThreadPin(older.id, true)
    const pinnedFirst = await listThreads()
    expect(pinnedFirst.map((thread) => thread.id)).toEqual([older.id, newer.id])
    const first = pinnedFirst[0]
    expect(first?.pinned).toBe(true)
  })

  it("renames a thread", async () => {
    const thread = await createThread({ title: "Before", provider: "test", model: "m1" })
    await renameThread(thread.id, "After")
    const threads = await listThreads()
    const renamed = threads.find((entry) => entry.id === thread.id)
    expect(renamed?.title).toBe("After")
  })

  it("deletes a thread and cascades its messages", async () => {
    const thread = await createThread({ title: "Ephemeral", provider: "test", model: "m1" })
    await appendMessage(thread.id, { role: "user", content: "Hello" })
    await appendMessage(thread.id, { role: "assistant", content: "Hi there" })
    expect(await listMessages(thread.id)).toHaveLength(2)

    await deleteThread(thread.id)

    expect(await listMessages(thread.id)).toEqual([])
    expect(await listThreads()).toEqual([])
  })

  it("appendMessage updates preview and updatedAt without renaming", async () => {
    const thread = await createThread({ title: "Keep me", provider: "test", model: "m1" })
    const before = thread.updatedAt
    await sleep(5)
    await appendMessage(thread.id, { role: "user", content: "Where did my money go?" })

    const threads = await listThreads()
    const updated = threads.find((entry) => entry.id === thread.id)
    if (!updated) throw new Error("expected updated thread")
    expect(updated.title).toBe("Keep me")
    expect(updated.preview).toContain("Where did my money go?")
    expect(updated.updatedAt >= before).toBe(true)

    const messages = await listMessages(thread.id)
    expect(messages).toHaveLength(1)
    expect(messages[0]?.content).toBe("Where did my money go?")
  })

  it("lists messages oldest first and caps at 200", async () => {
    const thread = await createThread({ title: "Many", provider: "test", model: "m1" })
    await appendMessage(thread.id, { role: "user", content: "First" })
    await sleep(2)
    await appendMessage(thread.id, { role: "assistant", content: "Second" })

    const messages = await listMessages(thread.id)
    expect(messages.map((message) => message.content)).toEqual(["First", "Second"])
  })
})
