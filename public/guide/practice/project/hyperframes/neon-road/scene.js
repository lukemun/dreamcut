// A neon road seen from the side. The camera tracks along it at a steady speed, so someone running
// on the spot in front of it seems to run down the road: past little houses, then a forest, then the city.
// The road runs along x at z = 0; scenery stands behind it, mountains far back.
const objects = [
  { type: "ground", size: 110, grid: 10, at: [60, 0, -60], line: "#2a1670", appear: "none" },
  // The road: two kerbs and a dashed middle line.
  { type: "box", size: [190, 0.05, 0.12], at: [60, 0, 1.6], line: "#28f0ff", appear: "none" },
  { type: "box", size: [190, 0.05, 0.12], at: [60, 0, -1.6], line: "#28f0ff", appear: "none" },
];
for (let x = -30; x <= 150; x += 3) objects.push({ type: "box", size: [1.4, 0.04, 0.1], at: [x, 0, 0], line: "#fff36b", appear: "none" });
// Street lamps behind the road.
for (let x = -20; x <= 150; x += 9) {
  objects.push({ type: "cylinder", radius: 0.05, height: 2.6, at: [x, 0, -2.4], line: "#ffb13b", delay: 0.2 });
  objects.push({ type: "sphere", radius: 0.18, at: [x, 2.6, -2.4], line: "#fff36b", appear: "pop", delay: 0.3 });
}
// Little houses first.
for (const [x, z, w, h] of [[-14, -6, 3, 2.2], [-6, -7, 3.6, 2.6], [2, -6, 3, 2.4], [10, -8, 4, 3], [17, -6.5, 3, 2.2]]) {
  objects.push({ type: "box", size: [w, h, 3], at: [x, 0, z], line: "#ff4fd8", delay: 0.1 });
  objects.push({ type: "prism", points: [[-w / 2 - 0.3, 0], [w / 2 + 0.3, 0], [0, 1.4]], depth: 3.2, at: [x, h, z], line: "#ff4fd8", appear: "pop", delay: 0.35 });
}
// Then a forest, then the city.
objects.push({ type: "forest", count: 34, radius: 9, at: [42, 0, -10], line: "#39ff88" });
objects.push({ type: "city", count: 60, span: 4, cell: 3.4, avenue: false, bands: 0.5, at: [94, 0, -30], line: "#28f0ff" });
// Mountains far back and a big sun, for depth.
for (const [x, w, h] of [[-10, 30, 9], [25, 36, 12], [65, 30, 10], [100, 40, 14], [140, 30, 9]]) {
  objects.push({ type: "prism", points: [[-w / 2, 0], [w / 2, 0], [0, h]], depth: 2, at: [x, 0, -60], line: "#8a3dff", appear: "none" });
}
objects.push({ type: "disc", radius: 7, at: [60, 14, -150], fill: "#ff3d8b", line: "#ffb13b", appear: "none" });

window.SKETCH_SCENE = {
  appear: "rise",
  objects,
  camera: {
    fov: 40,
    // Steady speed along the road, not easing in and out.
    ease: "linear",
    moves: {
      // Run along the road from the houses to the city.
      fly: [
        { at: 0, from: [0, 2.6, 12], to: [0, 1.8, 0] },
        { at: 1, from: [100, 2.6, 12], to: [100, 1.8, 0] },
      ],
      // Run along, then rise above the city at the end.
      rise: [
        { at: 0, from: [0, 2.6, 12], to: [0, 1.8, 0] },
        { at: 0.75, from: [75, 2.6, 12], to: [75, 1.8, 0] },
        { at: 1, from: [100, 14, 22], to: [96, 2, -10] },
      ],
    },
  },
};
