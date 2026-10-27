# Local model setup (desktop development preview)

DreamCut's desktop Local agent uses llama.cpp and a small registry of model/vision-projector
pairs. Setup is manual. Installing an unrelated GGUF or starting Ollama does not make it
appear in the picker. This guide describes the implemented setup contract; a clean-machine
walkthrough and automatic downloader are still outstanding.

## Prepare the files

Install llama.cpp using its [official instructions](https://github.com/ggml-org/llama.cpp/blob/master/docs/install.md).
On macOS, `brew install llama.cpp` supplies `llama-server`.

Choose a pair from `LOCAL_MODELS` in
[`mcp/local-model-suite.mjs`](../mcp/local-model-suite.mjs). That registry specifies the
exact directory, model filename and projector filename. Obtain the matching files from
the model publisher or a trusted distributor, check their license and published hashes,
and allow enough disk and memory for the weights plus inference context. DreamCut does
not download these files for you.

Place the registry's directory under `~/.local/share/dreamcut/models/`. Add
`download-manifest.json` in that root: a JSON array with an entry for each model and
projector file. Each entry must contain:

- `filename`: the exact filename in the registry, without its directory.
- `bytes`: the complete file size as an integer.
- `sha256`: the verified SHA-256 digest as 64 hexadecimal characters.

On macOS, `stat -f %z /absolute/path/to/file.gguf` reports size and
`shasum -a 256 /absolute/path/to/file.gguf` computes the digest. Compare the digest with
the distributor's published value before recording it. A locally computed hash alone
does not authenticate a download. Repeat for the vision projector.

## Open the desktop app

After installing the repository's dependencies and running `pnpm bootstrap`, launch:

```bash
pnpm desktop:dev
```

Choose **Local** in the desktop chat's agent picker, choose an installed model and send
a request. The app owns the model server; you do not need to start another server first.
It runs one model at a time with a 65,536-token context and stops it after 15 idle minutes
or when the app quits. Weight size alone is not the total memory requirement.

If Local is missing, check that `llama-server` is executable and both files match their
manifest sizes. For non-default locations, set `DREAMCUT_LLAMA_SERVER` to the absolute
binary path and `DREAMCUT_LOCAL_MODEL_ROOT` to the absolute model-root directory before
launching the app. Older installations may still use `~/.local/share/openedit/models`
when the DreamCut model directory does not exist.

The local agent prepares edits through DreamCut tools; the human reviews and applies
them. It has no general-purpose shell or code-writing access. Local inference is separate
from the editing-history sharing setting and optional cloud generation. See
[Data sharing](../README.md#data-sharing) before using private material.

For implementation limits and evaluation commands, see the
[operator runbook](architecture/editing-operator-runbook.md#local-agent-in-the-dreamcut-chat).
