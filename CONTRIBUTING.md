# Contributing to BudgetLens

Keep pull requests focused and explain the user-visible behavior they change.

## Development workflow

1. Create a branch from `main`.
2. Install with `pnpm install --frozen-lockfile`.
3. Add or update tests with the implementation.
4. Run the checks documented in the README.
5. In the pull request, distinguish automated checks from human manual testing.

Use unit tests for parsing and calculations, component tests for accessible interaction, and Playwright for important workflows across routes and browser storage.

## Financial-data safety

Never commit or paste real financial exports, HAR files, credentials, browser databases, backups, or screenshots containing personal data. Files in `tests/fixtures` must be synthetic and use invented names, dates, and values.

To reproduce a real-export edge case, inspect it locally, then create the smallest synthetic fixture that demonstrates the same file shape. Do not include the source filename or row values in logs, issues, tests, or pull requests.
