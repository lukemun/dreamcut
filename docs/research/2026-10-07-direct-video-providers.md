# Direct Kling and BytePlus video APIs — sourced findings

Public technical evidence on direct provider access, pricing, and asynchronous generation, with fal endpoint prices as a comparison source.

| Field | Method |
| --- | --- |
| Date | 2026-10-07, America/Los_Angeles |
| Collection | Official provider documentation and live pricing pages; web retrieval supplemented by rendered browser DOM inspection |
| Sourcing | Every external finding links to its primary source; recommendations are excluded |
| Source records | [Examined sources and excerpt scope](raw/direct-video-providers/sources.md) |

## Kling

The global API authentication page specifies `https://api-singapore.klingai.com` for servers outside China. It documents Bearer API keys for all models, with Access Key/Secret Key JWT authentication labeled as legacy. [Authentication](https://kling.ai/document-api/api/get-started/authentication)

The current image-to-video contract uses `POST /image-to-video/kling-3.0`, with `contents`, `settings`, and `options`. Examples include first/last frames, elements, resolution, duration, and audio. Tasks expose `submitted`, `processing`, `succeeded`, and `failed`; `GET /tasks` accepts task IDs or external task IDs. Callbacks and account-unique external task IDs are supported. Query results contain outputs and billing records distinguishing cash from package units; output descriptions specify removal after 30 days. [Current image-to-video contract](https://kling.ai/document-api/api/video/3-0-omni/image-to-video)

The older contract uses `/v1/videos/image2video` and different request/response names, including `model_name` and `task_status`. It is explicitly labeled legacy. [Legacy contract](https://kling.ai/document-api/api/video/3-0-omni/image-to-video/legacy)

### Published list prices

Each row is sourced to the [Kling pricing page](https://kling.ai/dev/pricing); prices are USD per generated second, without voice control.

| Model | Resolution | Audio | USD/second |
| --- | --- | --- | ---: |
| Kling 3.0 | 720p | Off | 0.084 |
| Kling 3.0 | 1080p | Off | 0.112 |
| Kling 3.0 | 720p | Native | 0.126 |
| Kling 3.0 | 1080p | Native | 0.168 |
| Kling 3.0 Turbo | 720p | Native | 0.112 |
| Kling 3.0 Turbo | 1080p | Native | 0.140 |

The displayed standard packages include $700/5,000 units and $3,780/30,000 units. They specify 180-day validity without rollover or extension and 20 concurrent requests. The latter package shows a 10% discount; the page excludes Kling 4.0 from these plans. [Packages](https://kling.ai/dev/pricing)

The paid-service terms define a client application and address downstream customers. Section 6.4 permits commercial use of generated content while placing lawful input/output obligations on the customer. This is a description of the source, not a determination of eligibility for a particular resale arrangement. [Paid-service terms, sections 1.4 and 6.4](https://kling.ai/document-api/protocols/paidServiceProtocol)

## BytePlus ModelArk / Seedance

The activation guide lists three qualifying routes starting at USD 30: verified Credits users with sufficient Credits; a qualifying dedicated AI Savings Plan with remaining balance; or model resource packs with remaining quota. Credits have no expiration, while model resource packs have 90-day validity. Models must then be activated in the console. [Activation and billing guide](https://docs.byteplus.com/en/docs/modelark/seedance-model-activation-usage-and-refund)

The direct creation endpoint is `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks`. The contract requires `model` and `content`, returns a task ID, and exposes fields including resolution, ratio, duration, audio, seed, callback URL, expiration, and end-user identifier. Input descriptions include text, image, audio and video. Model-specific compatibility requires checking the detailed schema. [Create task](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api)

`DELETE /api/v3/contents/generations/tasks/{id}` cancels queued tasks. Running tasks cannot be deleted through that operation. For succeeded, failed, or expired tasks, deletion removes the queryable record. [Cancel/delete contract](https://docs.byteplus.com/en/docs/modelark/cancel-or-delete-video-generation-tasks-api)

### Published estimated costs

All rows below are BytePlus's estimates for a five-second, 16:9 output **without input video**, sourced to its [pricing page](https://docs.byteplus.com/en/docs/modelark/model-pricing). Values are USD per video, using list prices rather than temporary discounts.

| Model | 720p | 1080p |
| --- | ---: | ---: |
| Seedance 2.0 Mini | 0.38 | Unsupported in this table |
| Seedance 2.0 Fast | 0.60 | Unsupported in this table |
| Seedance 2.0 | 0.76 | 1.87 |
| Seedance 2.5 | 1.156 | 2.843 |

Seedance 2.0 lists $7/million tokens without video input at 480p/720p and $7.70/million at 1080p. Actual token usage governs billing. Video-input requests use different rates and minimum token consumption. The listed Fast/Mini promotional window ends at 14:00 UTC+8 on October 7, 2026. [Pricing and billing rules](https://docs.byteplus.com/en/docs/modelark/model-pricing)

## fal comparison source

The Kling 3 Pro image-to-video endpoint lists $0.112/second with audio off, $0.168 with audio on, and $0.196 with voice control. Its parameters include start/end image URLs, elements and multi-prompt shots. [fal Kling endpoint](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video)

The Seedance 2 image-to-video endpoint's price notice lists $0.3034/second at 720p and $0.682 at 1080p, or $0.014/1,000 tokens. A later table on the same page instead says $0.3024/second for standard generation. Both values are preserved as a source discrepancy, not silently reconciled. The page gives the token formula `(height × width × duration × 24) / 1024`. [fal Seedance endpoint](https://fal.ai/models/bytedance/seedance-2.0/image-to-video)

## Method, caveats, and unanswered questions

- Search located official pages; technical findings were checked against returned page content or rendered DOM. Kling and BytePlus pricing were inspected in the browser during this conversation. Their initial web retrievals returned largely empty JavaScript shells.
- The BytePlus create-task DOM exposed endpoint and field names but omitted portions of nested descriptions. This record does not claim exhaustive parameter compatibility. Those descriptions require further inspection before implementation.
- This was documentation research, with no credentials, account activation, purchases, generation calls, or performance tests. Account eligibility, contracted discounts, regional permission, invoices, latency, output quality, and reliability remain unverified.
- Questions still requiring contract/account confirmation: permission and obligations for a paid downstream-user service; reference/output retention and model-training use; exact moderation and failed-job billing; callback verification/replay rules; rate limits for the intended account; and complete cancellation behavior on Kling. A question is not a finding that a feature is absent.
- Cross-provider feature equivalence and effective savings are not established by rate-card comparison alone. No inference from a separate BytePlus LAS service's billing rules is made about ModelArk.
- Reproduction: reopen each cited URL; select the same model, resolution, audio, duration and input-media type; record the billing unit and currency. For Kling seconds pricing multiply by duration. For Seedance use actual returned tokens and the applicable token tariff; preserve estimates separately from invoices.
