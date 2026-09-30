# CareerScout

TinyFish-powered live careers finder prototype for the TinyBounties “Job Portal / Careers Finder” brief.

> Prototype status: claimed for the TinyBounties bounty; not yet submitted. This is an original build.

## What it does

- Searches public careers pages using the visitor’s role, location, keywords, seniority, and work-authorization preferences.
- Uses TinyFish Search to discover listings and Fetch to read their source pages; normalizes, deduplicates, and ranks the results with original apply links.
- Optionally compares résumé signals with listing details and sorts the shortlist by overlap.
- Makes no applications and does not predict whether an employer will hire a person.

## Optional résumé matching and privacy

Résumé matching is browser-only. The visitor selects a PDF, DOCX, or TXT file (up to 8 MB; PDFs up to 30 pages). CareerScout reads selectable text with the self-hosted PDF.js and Mammoth libraries, extracts a compact set of recognized skill and role terms, and resets the file input. Scanned/image-only PDFs are not OCR’d.

The résumé file and its raw text are **never uploaded** to CareerScout, Vercel, TinyFish, or a third-party parsing service. Only the search preferences are sent to `/api/search`. The temporary extracted profile stays in JavaScript memory for one search, then is cleared; users can clear it sooner. The result cards retain only small match counts and a few matching/other-listed terms in the current page until it is refreshed or closed. Nothing is put in local storage or a database.

“Signals matched” counts recognized résumé skills/roles found in a listing. The percentage used internally to sort is an overlap ratio, not a probability of interview or hiring. Listings with too little readable detail show no score. The controlled vocabulary can miss relevant qualifications, and an employer’s requirements are not inferred as hard requirements.

## Local development

Requirements: Node.js 20.16+.

```bash
npm install
npm test
npm run dev
```

Open http://localhost:4173. The static PDF.js, its worker, Mammoth browser bundle, and their license notices are in `public/vendor/`.

The local server reads `TINYFISH_API_KEY` or `MCP_TINYFISH_API_KEY` from its environment, or locally from `~/.hermes/.env`. It never writes the key into this project. For Vercel, configure `TINYFISH_API_KEY` as a server-side project environment variable; never use a `NEXT_PUBLIC_` variable.

TinyFish Agent is an optional, read-only deep-read route and is disabled by default because it may consume wallet credits. It is not used by normal searches. Only enable it after the project owner approves credit use; the UI asks for confirmation before each run. Do not enable it on a public deployment without access controls, because visitors could spend the project owner's credits.

## TinyFish endpoints

- **Search** discovers live listings across public careers portals.
- **Fetch** reads the actual listing pages for structured details.
- **Agent** is an optional, disabled deep-read path for a selected listing when ordinary Search/Fetch is insufficient.

The current default search uses Search + Fetch. The bounty’s “endpoint” scoring definition has not been confirmed by TinyFish; do not assume this build qualifies for a particular point tier.

## Submission checklist (not yet performed)

- Verify student/ambassador eligibility and confirm endpoint-scoring interpretation.
- Confirm the bounty is still open and read the current full requirements.
- Test varied live queries and multiple portals.
- Publish the working build and explain TinyFish usage.
- Required: LinkedIn post tagging TinyFish and share in TinyFish Discord `#showcase`; X is optional.
- Do not submit until final review; the rulebook says submissions are final and only the top three builds are approved.
