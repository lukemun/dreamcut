# Agent tool capabilities

Tools are organized by reusable editing outcome. Start with the
[implementation shortlist](script-audit.md), [capability registry](registry.json), and
[script inventory](script-inventory.json). The inventory is a dated static review,
not a usage ranking or proof of runtime safety.

The [tool-authoring standard](../standards/tool-authoring.md) defines interfaces,
authority, caching, recovery, telemetry and evolution records. The
[agent/harness standard](../standards/agent-harness-authoring.md) defines how the model
uses those tools. `pnpm check:tools` verifies registry ownership and MCP catalog coverage.

Each capability has an `evolution/` record. Update it for material changes, recording
why the change was needed and actual test/eval evidence. Do not append routine tool
calls; local telemetry and activity capture own those. Existing registrations are
marked as awaiting contract review; registration alone does not retrofit structured
errors, job semantics, or test coverage.

This registry is developer/agent documentation. It adds no editor cards, notifications,
preferences, automatic retrospectives, or new tool permissions.

## Selective access and recipes

The [discovery and recipe architecture](../architecture/tool-discovery-recipes.md)
describes `capability_catalog`, the opt-in editing profile and `recipe_compile`.
Use catalog discovery before adding tools; add recipes to express supported treatments.
