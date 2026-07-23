import packageMetadata from "../../package.json"

const footerLinks = [
  { label: "GitHub", href: "https://github.com/cbangera2/BudgetLens" },
  { label: "Report an issue", href: "https://github.com/cbangera2/BudgetLens/issues" },
  {
    label: "CreditKarmaExtractor",
    href: "https://github.com/cbangera2/CreditKarmaExtractor",
  },
] as const

export function AppFooter() {
  return (
    <footer aria-label="BudgetLens resources" className="border-t">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-xs text-muted-foreground sm:px-6">
        <p className="mr-auto">
          BudgetLens v{packageMetadata.version} <span aria-hidden="true">·</span> © 2026 Chirag
          Bangera
        </p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {footerLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  )
}
