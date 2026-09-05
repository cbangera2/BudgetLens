import { Button } from "@/components/ui/button"

export interface ProposalCardProps {
  title: string
  lines: string[]
  status: "idle" | "applying" | "applied"
  onApprove: () => void
  onDismiss: () => void
}

export function ProposalCard({ title, lines, status, onApprove, onDismiss }: ProposalCardProps) {
  return (
    <section
      aria-label={title}
      // oxlint-disable-next-line prefer-tag-over-role -- Approval card spec requires role="group".
      role="group"
      className="rounded-2xl border border-dashed p-3 text-xs"
    >
      <p className="font-semibold">
        {title} {status === "applied" ? "applied ✓" : "needs approval"}
      </p>
      <ul className="mt-1 space-y-1 text-muted-foreground">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {status !== "applied" && (
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            className="rounded-full"
            onClick={onApprove}
            disabled={status === "applying"}
          >
            {status === "applying" ? "Applying…" : "Approve + apply"}
          </Button>
          <Button size="sm" variant="outline" className="rounded-full" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      )}
    </section>
  )
}
