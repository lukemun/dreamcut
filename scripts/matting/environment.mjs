/**
 * The subject-tracing environment's contents, shared by its installer (scripts/setup-matting.mjs) and the
 * MCP tool that reports it (cutout_setup). setup-matting writes MARKER with these packages when it finishes,
 * so an environment made by an older list reads as needing an update rather than ready.
 */
export const PACKAGES = ['torch==2.14.0', 'torchvision==0.29.0', 'sam2==1.1.0', 'numpy==2.5.3', 'pillow==12.3.0', 'scipy==1.18.1', 'tqdm==4.70.1', 'opencv-python-headless==5.0.0.93'];
export const MARKER = 'environment.json';
export const CHECKPOINT = {
  file: 'sam2.1_hiera_small.pt',
  url: 'https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt',
  sha256: '6d1aa6f30de5c92224f8172114de081d104bbd23dd9dc5c58996f0cad5dc4d38',
  bytes: 184416285,
};
