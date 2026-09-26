@AGENTS.md
# Knock

HackGT 13 hackathon project (Impiricus track). Deadline Sunday Sep 27, 8:00 AM ET.
Full spec: `docs/REQUIREMENTS.md`. Read it before building anything. Schema: `supabase/schema.sql`.

## Working rules
- Build in the order in REQUIREMENTS.md section 10. Get each step working end to end before polishing.
- Anything in "What Knock is NOT" is out of scope. Do not add it. Ask before adding any feature not in the spec.
- Keep code plain and readable. Prefer the simplest version over clever or compressed code. The decision engine in `src/lib/decide.ts` must stay a plain, readable function.
- The demo must never depend on the LLM responding. Every Grok call has a timeout and a template fallback.
- Browser reads use the Supabase anon key. All writes go through server route handlers or server actions using `SUPABASE_SERVICE_ROLE_KEY`. Never expose the service role key or `XAI_API_KEY` to the client.
- Use shadcn/ui components and the status color variables. No new colors.

## Git
- Do not run git commit or git push. Give me the commands and I will run them.
- Never add Co-Authored-By or any Claude/session trailers to commit messages.
- Never stage files without confirming with me what goes in.