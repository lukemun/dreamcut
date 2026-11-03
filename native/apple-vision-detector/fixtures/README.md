# Apple Vision promotion fixtures

`manifest.json` is checked in; source and generated image binaries are not. Run:

```bash
pnpm preprocess detector-fixtures
pnpm preprocess detector-benchmark
pnpm preprocess doctor
```

The generator downloads two immutable, SHA-256-pinned images from NASA's public
image library and creates deterministic transformations with FFmpeg. The
manifest carries the NASA detail-page provenance and rights note for each
source. It also carries visually hand-authored truth boxes. Detector results
must never be copied into that truth.

The promotion report is local and machine-specific. `doctor` reports
`available` only while the detector source, manifest, generated fixture bytes,
Swift compiler, and macOS version still match a report that passed every gate.
Changing any of those inputs returns the detector to `candidate` status.
