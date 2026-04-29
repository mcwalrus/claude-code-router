Here's the current state:

  Confirmed: The 400 {"error":"Missing model in request body"} comes from modelSplitHook in
  packages/core/src/server.ts when body.model is falsy.

  Hook order (verified in compiled code): apiKeyAuth → docsAuth → pathname/preset → agents →
  logHook → routerHook → modelSplitHook

  The routerHook SHOULD set body.model: Traced through the compiled server.cjs — the router
  (Ke) calls getUseModel (Rt), which returns {model: "together,moonshotai/Kimi-K2.6",
  scenarioType: "default"}, then sets r.body.model = h. This should make body.model truthy by
  the time modelSplitHook runs.

  What I haven't found: Why body.model is still falsy when modelSplitHook runs despite the
  above. The code path looks correct in both source and compiled output.

  Where I got interrupted: I was checking where /v1/messages is actually registered — it's NOT
   in packages/server/src/server.ts. It's registered dynamically via transformer endpoints in
  packages/core/src/api/routes.ts (line 482: fastify.post(transformer.endPoint, ...)). The
  OpenAI transformer registers /v1/chat/completions, not /v1/messages. The Anthropic
  transformer registers /v1/messages.

  The real next question: Is /v1/messages registered inside the registerNamespace('/') plugin
  (where the routerHook lives), or somewhere else? If it's registered outside that plugin's
  scope, the routerHook wouldn't run for it at all — and body.model would remain as-is (the
  Anthropic model name) which is truthy, so that's still not the cause of 400.

  Do you want me to keep digging, or is there a specific direction you want to take this?

⏺ Ran 1 stop hook (ctrl+o to expand)
  ⎿  Stop hook error: Failed with non-blocking status code: Error: workspace identity
  mismatch detected

    metadata.json project_id: fad2d939-781d-4bf5-9066-857f5e8fa6bb
    database _project_id:     78174a49-2d8c-4220-9a93-5bd1f716b193

  This means the CLI config and database belong to different projects.
  Possible causes:
    • BEADS_DIR points to a different project's .beads/
    • Dolt server endpoint changed and now serves a different database
    • metadata.json was copied from another project

  To diagnose: bd context --json
  To override: set BEADS_SKIP_IDENTITY_CHECK=1