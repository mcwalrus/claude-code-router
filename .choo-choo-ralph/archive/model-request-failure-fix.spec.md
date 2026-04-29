---
title: "Fix modelSplitHook Executes Before routerHook (P0)"
created: 2026-04-30
poured:
  - ccr-mol-sct1
  - ccr-mol-xmwb
  - ccr-mol-7ozh
  - ccr-mol-efkr
  - ccr-mol-7b17
iteration: 1
auto_discovery: false
auto_learnings: false
---
<project_specification>
<project_name>Fix modelSplitHook Executes Before routerHook (P0)</project_name>

  <overview>
    The router is returning 400 {"error":"Missing model in request body"} for all /v1/messages
    requests. The root cause is a Fastify hook execution order bug introduced when the routerHook
    was moved inside a plugin (registerNamespace) while modelSplitHook remained as a root-level
    app hook registered after the plugin. In Fastify, root-level hooks always run before
    plugin-scoped hooks, so modelSplitHook fires before routerHook has a chance to set body.model
    to the required "provider,modelname" format. The fix is to move modelSplitHook inside the
    plugin scope, after routerHook, ensuring correct execution order.
  </overview>

  <context>
    <existing_patterns>
      - All routing logic lives in packages/core/src/server.ts (local workspace pkg @mcwalrus/llms v3.0.0)
      - routerHook is a preHandler inside registerNamespace('/') plugin at lines 144-152
      - modelSplitHook is a root-level preHandler registered in start() at lines 216-239, AFTER registerNamespace('/')
      - Non-'/' namespaces (project-level routing) also have a routerHook at lines 185-194 and need the same fix
      - Fastify rule: root hooks run before plugin-scoped hooks, regardless of registration order
    </existing_patterns>
    <integration_points>
      - packages/core/src/server.ts: Server class, start(), registerNamespace() — primary change target
      - packages/core/src/utils/router.ts: router() sets req.body.model = "provider,modelname"
      - packages/server/src/server.ts: consumes @mcwalrus/llms, calls server.addHook() and server.start()
    </integration_points>
    <new_technologies>
      - Fastify hook scoping: hooks registered inside fastify.register() run AFTER root hooks for routes in that plugin
      - Hooks within the same plugin scope run in registration order — this is the property we exploit for the fix
    </new_technologies>
    <conventions>
      - All comments in code MUST be in English
      - No new documentation files — add notes to docs project if needed
      - packages/core is the local workspace copy of @mcwalrus/llms — edit it directly
    </conventions>
  </context>

  <tasks>
    <task id="fix-hook-order-root" priority="0" category="functional">
      <title>Move modelSplitHook inside registerNamespace('/') plugin scope</title>
      <description>
        In packages/core/src/server.ts, the modelSplitHook (lines 216-239) must move from the
        root app level in start() to inside the registerNamespace('/') plugin callback, registered
        AFTER routerHook. This guarantees Fastify executes routerHook first (setting body.model to
        "provider,modelname"), then modelSplitHook (splitting provider from model name).

        Remove the this.app.addHook("preHandler", ...) block for modelSplitHook from start() and
        add an equivalent fastify.addHook('preHandler', ...) inside the async (fastify) => {}
        callback in registerNamespace('/'), after the existing routerHook addHook call and before
        await registerApiRoutes(fastify).
      </description>
      <steps>
        - Open packages/core/src/server.ts
        - Cut the entire this.app.addHook("preHandler", ...) modelSplitHook block from start() (lines 216-239)
        - Inside registerNamespace('/'): after the routerHook addHook block (line 152), before await registerApiRoutes(fastify) (line 153), add the modelSplitHook as fastify.addHook('preHandler', ...)
        - Update the FastifyRequest/FastifyReply type imports to be available inside the plugin scope (they may need to come from the fastify parameter rather than direct import)
      </steps>
      <test_steps>
        1. Build the core package: cd packages/core && pnpm build (or pnpm build:server from root)
        2. Start the router: ccr start (or pnpm dev:server)
        3. Send a test /v1/messages request via curl with a valid body but without explicitly relying on body.model being set by the client (the router should set it)
        4. Verify the request succeeds (2xx or streams back) instead of returning 400 "Missing model in request body"
        5. Verify the provider is correctly extracted from the router-assigned model string
      </test_steps>
      <review></review>
    </task>

    <task id="fix-hook-order-namespace" priority="0" category="functional">
      <title>Apply the same fix to non-'/' namespace registrations</title>
      <description>
        The registerNamespace() method also handles non-'/' namespace registrations (lines 179-195)
        which have their own routerHook inside a plugin. After the root-level modelSplitHook is
        removed from start(), these namespaces will have no modelSplitHook at all.

        Add modelSplitHook inside the non-'/' namespace plugin callback too, after routerHook, so
        project-level routing (~/.claude/projects/) also correctly splits provider from model.
      </description>
      <steps>
        - In registerNamespace(), locate the non-'/' branch: this.app.register(async (fastify) => { ... routerHook ... }, { prefix: name }) at lines 179-195
        - After the routerHook addHook call (line 194) and before registerApiRoutes, add the same modelSplitHook fastify.addHook block
        - Extract the modelSplitHook into a shared helper function to avoid copy-paste: e.g., function addModelSplitHook(fastify: FastifyInstance) { fastify.addHook(...) } and call it in both places
      </steps>
      <test_steps>
        1. Confirm that the helper function is called in both namespace branches
        2. Build: pnpm build from root
        3. If project-level routing is testable, verify a request routed through a non-'/' namespace also succeeds
      </test_steps>
      <review></review>
    </task>

    <task id="verify-no-regression" priority="0" category="functional">
      <title>Smoke test the full request pipeline after the fix</title>
      <description>
        After both hook-order fixes are applied, do a full end-to-end smoke test to confirm:
        1. /v1/messages requests no longer return 400 "Missing model in request body"
        2. The correct provider and model are extracted (req.provider and req.model are set correctly)
        3. No regression in the streaming or non-streaming response path
        4. The logging hook (first preHandler in start()) still fires correctly

        Also verify that requests that genuinely lack a model field (malformed client requests)
        still correctly return 400 after the routerHook has run and failed to set body.model.
      </description>
      <steps>
        - Run pnpm build from the repo root
        - Start the server with a valid config pointing to at least one provider
        - Send a valid /v1/messages request and verify 2xx response
        - Send a /v1/messages request with no model field and no router config that would set one — verify 400 is still returned (not 500)
        - Check server logs to confirm routerHook ran before modelSplitHook (log order)
      </steps>
      <test_steps>
        1. pnpm build — must succeed with no TypeScript errors
        2. curl -s -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"hi"}],"max_tokens":10}' — should NOT return 400 "Missing model"
        3. Inspect response: should be a valid Anthropic-format response from the configured provider
        4. Check ccr logs for "routerHook" then "modelSplitHook" ordering evidence
      </test_steps>
      <review></review>
    </task>
  </tasks>

  <success_criteria>
    - No 400 "Missing model in request body" errors for properly configured requests
    - routerHook always executes before modelSplitHook for /v1/messages routes
    - Fix applied consistently to both '/' and named namespace registrations
    - TypeScript build passes with no new errors
    - Malformed requests (no model, no router config) still get a clear 400 error
  </success_criteria>

</project_specification>
