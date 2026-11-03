# Template sharing

## Purpose

Let an agent prepare and submit the effect it just packaged through the same Cloud uploader as the editor.

## 2026-10-31 — agent contribution contract

Existing owners: `cloud-template-share.ts`, the project template-share route, and Cloud's recipes draft/upload/submit API. The UI already uploaded recipes, result MP4s and posters; no MCP route exposed it.

Added `template_share` and `scripts/share-template.ts` using the same validated owner. Local preparation describes the exact recipe, example hash, public credit and omissions. Submission requires explicit creator words and that unchanged package hash, records a private receipt, and returns pending moderation. Preparation needs neither sign-in nor network; submission uses the existing account flow. Working timelines remain unchanged.

Acceptance: fixture-only uploader tests cover no-upload preparation, stale media and missing authorization, and successful draft/upload/submit. No production submission is authorized by implementing this feature. Input footage and new skill/runtime source are not part of Cloud recipe v1; these remain explicit gaps, not silently successful uploads.

Verification: uploader fixture tests pass (3/3); registry, schema portability, agent parity and feature contracts pass; editor typecheck and website build pass. Feature discovery by an independent reviewer model passes 2/2 simulated runs. No live Cloud upload was performed.
Secondary local-model evaluation did not return a result within the bounded interactive check and was stopped; local-model usability remains unverified. Existing connected MCP processes need a restart to expose the added tool.

## 2026-10-31 — Full private implementation packages

The new prepare_package/submit_package actions replace recipe-only sharing for recreated effects. The typed manifest requires skill, recipe, input, result, instructions, evidence and rights, plus tests when runtime changes are supplied. Explicit repository/project file selection rejects root escapes. Files have bounded sizes and hashes; a private Cloud bucket stores inert files, verifies uploads before submission, and resumes identical author-scoped drafts. The maintainer pull script verifies hashes in a fresh review folder. It never installs or executes source and does not write the public catalog.

Validation: editor uploader tests 5/5, Cloud manifest/integrity tests 4/4, existing Cloud suite 66/66, editor typecheck and tool contracts pass. An independent reviewer model discovers and prepares the complete package in 2/2 simulated cases. Production storage migration/deployment and live upload/download remain unperformed; this is implemented locally, not a claim of a completed production submission.
The full-package secondary local-model run did not finish within the bounded interactive check and was stopped; local-model usability is still unverified. Website build and final Cloud types passed. Live owner pull remains to be qualified after deployment.
