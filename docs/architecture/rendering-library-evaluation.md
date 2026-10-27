# Rendering library choice

The browser compositor uses CanvasKit 0.42.0. Its Skia image filters, clipping, transforms and blend operations reduce the custom shader surface while keeping source clocks, frame ownership and effect evaluation under DreamCut's control.

CanvasKit and PixiJS were compared with synthetic rectangular masking, scaled masking and anisotropic blur. CanvasKit was the stronger match for the tested blur configuration; that experiment does not establish universal superiority or equivalence to browser CSS. DreamCut still supplies the scene adapter, text rasterization, media decoding, source color conversion, cache budgets and cleanup.

The earlier custom WebGPU compositor remains a development comparison path. rust-skia is a possible native desktop implementation, but requires native packaging and browser delivery integration. GES and MLT would require a broader timeline and effect adapter rather than a compositor substitution.

See the [technical sources](../research/2026-10-07-rendering-library-options.md) for the candidate screen. Verification uses synthetic fixtures and explicit runtime admission, with private project trials retained outside distributed documentation. Preview/export alignment is defined by [playback architecture](playback-rendering.md).
