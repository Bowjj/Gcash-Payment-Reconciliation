# VeriPay

**Payment Reconciliation & Verification System**

VeriPay is a personal payment reconciliation and verification system I built to simplify and speed up the process of checking payment records against GCash transaction statements.

The system was created primarily for my personal workflow and for work I perform with my client. Instead of manually checking transactions one by one, VeriPay helps automate the reconciliation process, identify records that need attention, and generate organized Excel outputs.

VeriPay is currently designed primarily for local use, although it may be deployed again in the future depending on our needs.

## Why I Built VeriPay

Payment verification can become repetitive and time-consuming when working with many records.

The usual process involves manually searching through GCash transaction statements, comparing reference numbers with payment records, identifying missing or duplicate transactions, and updating records manually.

I built VeriPay to make that workflow faster and more organized.

The goal is not to completely remove manual review, but to automate the repetitive parts while clearly identifying transactions that still require human verification.

## Features

- Payment Records XLSX import
- GCash transaction statement XLSX import
- Multiple GCash statement support
- Exact reference-number reconciliation
- Missing reference detection
- Reference-not-found detection
- Duplicate reference detection
- Manual review workflow
- CASH and BANK payment handling
- Matched customer annotation
- Verification history
- Annotated Payment Records export
- Individual annotated GCash exports
- Workspace-based organization

## How Verification Works

For GCash payments, VeriPay uses the **exact transaction reference number** as the primary basis for reconciliation.

The payment amount alone does **not** determine whether a transaction is verified.

General behavior:

| Situation | Result |
| --- | --- |
| One exact reference match | Verified |
| Missing reference number | Needs Review |
| Reference not found | Needs Review |
| Duplicate reference | Needs Review |
| Cash payment | Cash |
| Bank payment | Bank |

When multiple GCash statements are uploaded, VeriPay checks references across the combined set of GCash transactions while preserving which source file each transaction came from.

If the same reference number appears more than once, VeriPay does not automatically choose one. The transaction is instead marked for review.

## Technology Stack

VeriPay is built using technologies including:

- Next.js
- TypeScript
- Tailwind CSS
- Supabase
- PostgreSQL
- ExcelJS
- Zod
- Vitest
- Playwright
- Docker

## Quick Start

VeriPay currently runs locally.

### Requirements

Before starting VeriPay, make sure you have the required development tools installed, including:

- Node.js
- pnpm
- Docker Desktop
- Supabase CLI

### Recommended Windows Startup

The easiest way to start VeriPay is using the included:

`VeriPay.bat`

To start the system:

1. Start **Docker Desktop**.
2. Wait until Docker Desktop is fully running.
3. Double-click **`VeriPay.bat`**.
4. The launcher checks Docker and starts the local Supabase environment.
5. VeriPay starts on your computer.
6. The launcher waits for the application to become available.
7. Your browser opens automatically to the VeriPay login page.
8. Sign in and use the system.

The local application runs at:

`http://127.0.0.1:3000`

For normal Windows use, `VeriPay.bat` is the recommended way to start the application.

## Manual Startup

For development or troubleshooting, VeriPay can also be started manually.

Start local Supabase:

```bash
supabase start
```

Then start VeriPay:

```bash
pnpm dev
```

Open:

`http://127.0.0.1:3000`

## Stopping VeriPay

In the terminal running VeriPay, press:

`Ctrl + C`

If Windows asks whether you want to terminate the batch job, confirm it.

To also stop the local Supabase environment:

```bash
supabase stop
```

> **Important:** `supabase db reset` is not a normal shutdown command. It resets the local database and should not be used simply to stop VeriPay.

## Using VeriPay

A typical verification workflow is:

1. Start VeriPay using `VeriPay.bat`.
2. Sign in.
3. Open the appropriate workspace.
4. Start a verification run.
5. Upload one Payment Records `.xlsx` file.
6. Upload one or more GCash statement `.xlsx` files.
7. Run the reconciliation.
8. Review verified transactions and records requiring manual review.
9. Resolve review cases when necessary.
10. Download the annotated Payment Records workbook.
11. Download the annotated workbook for each GCash source.
12. Access previous verification runs through History when needed.

## Multiple GCash Sources

VeriPay supports reconciling one Payment Records workbook against multiple GCash statement files.

For example:

```text
Payment Records.xlsx
        +
GCash Account 1.xlsx
        +
GCash Account 2.xlsx
```

The system searches for exact reference numbers across all uploaded GCash statements while preserving the original source of each transaction.

A reference must be unique across the GCash transaction pool to qualify for automatic verification.

Each GCash source also receives its own annotated output rather than combining all GCash transactions into one file.

## Supported Files

VeriPay currently works with:

`.xlsx`

Legacy `.xls` files are not supported.

Payment and transaction files may contain sensitive information and should be handled appropriately.

## Local-First Usage

VeriPay is currently a **local-first application**.

The local environment uses Docker and Supabase to provide the database and authentication services required by the application.

A public deployment is not required to use VeriPay.

The application may be deployed in the future depending on operational needs, but its current primary purpose is supporting my personal and client workflow locally.

## Data & Privacy

VeriPay may process payment records and transaction information.

When using the system:

- Keep source spreadsheets secure.
- Do not commit customer or transaction files to Git.
- Do not commit `.env` files.
- Never publish API keys, passwords, database credentials, or other secrets.
- Keep backups of important source files and generated outputs.
- Avoid using real client information in public examples or test data.

## Project Status

VeriPay is actively developed and used as a personal workflow tool.

The current setup is local-first. Deployment may be added or changed in the future depending on operational requirements.

## Disclaimer

VeriPay is an independent personal workflow tool. It is not affiliated with, endorsed by, or an official product of GCash or its operators.
