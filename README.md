# CareerScout

TinyFish-powered live careers finder prototype for the TinyBounties “Job Portal / Careers Finder” brief.

> Prototype status: claimed for the TinyBounties bounty; not yet submitted. This is an original build.

## Goals

- User-defined role, location, keywords, seniority, and visa preference.
- Live job discovery across multiple public careers portals.
- Structured, deduplicated listings with direct apply links.
- Transparent relevance ranking and explicit “unknown” values when a posting omits details.
- Meaningful TinyFish Search and Fetch use; TinyFish Agent is reserved for portals that require interactive browsing and prompts before any wallet-funded run.

## Local development

Requirements: Node.js 20+.

```bash
npm test
npm run dev
```

Open http://localhost:4173.

The local server reads `TINYFISH_API_KEY` or `MCP_TINYFISH_API_KEY` from its environment, or locally from `~/.hermes/.env`. It never writes the key into this project. For Vercel, configure `TINYFISH_API_KEY` as a server-side project environment variable; never use a `NEXT_PUBLIC_` variable.

TinyFish Agent may consume wallet credits. It is disabled by default. Only set `ENABLE_TINYFISH_AGENT=true` after the project owner approves credit use; the UI asks for confirmation before each read-only run. Do not enable it on a public deployment without access controls, because visitors could spend the project owner's credits.

## TinyFish endpoint strategy

- Search: discover live listings, scoped to meaningful careers portals.
- Fetch: read the actual listing pages and normalize their content.
- Agent: optional read-only interaction for a selected supported job URL when Search/Fetch cannot access needed content. The Agent API may consume wallet credits; the UI must obtain explicit confirmation and the endpoint is disabled by default until enabled in server configuration.

The bounty’s “endpoint” scoring definition has not been confirmed by TinyFish. The code uses three distinct APIs meaningfully but does not assume that this guarantees the 200-point tier.

## Submission checklist (not yet performed)

- Verify ambassador/student eligibility and confirm scoring interpretation.
- Confirm bounty is still open and read the current full requirements.
- Test varied live queries and multiple portals.
- Publish a working demo/repository and explanation of TinyFish usage.
- Required: LinkedIn post tagging TinyFish and share in TinyFish Discord `#showcase`; X is optional.
- Do not submit until final review; the rulebook says submissions are final and only the top three builds are approved.
