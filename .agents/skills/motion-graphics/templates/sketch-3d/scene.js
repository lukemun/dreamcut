// The scene DreamCut draws: shapes and generators on the ground (y is up, units are roughly metres),
// then the camera moves the `camera` control can pick. Write a new scene.js for a new subject; keep
// the move names in step with the Camera choice in dreamcut.controls.json.
window.SKETCH_SCENE = {
  appear: "rise",
  objects: [
    { type: "city", count: 150, span: 9, cell: 3, avenue: true, bands: 0.42 },
    { type: "disc", radius: 3.2, at: [14, 30, -70], fill: "#e4572e", appear: "none" },
  ],
  camera: {
    fov: 50,
    moves: {
      // Swoop down from above the skyline, then fly along the avenue and look up between the towers.
      fly: [
        { at: 0, from: [19, 26, 34], to: [0, 0, 0] },
        { at: 0.4, from: [0, 3, 26], to: [0, 6, -10] },
        { at: 1, from: [0, 3.6, -2], to: [0, 16, -32] },
      ],
      // Circle round the whole scene from above.
      orbit: [
        { at: 0, from: [22.6, 22, 33], to: [0, 5, 0] },
        { at: 0.25, from: [39.9, 20, -2.6], to: [0, 5, 0] },
        { at: 0.5, from: [22, 18, -34], to: [0, 5, 0] },
        { at: 0.75, from: [-14, 16, -37.5], to: [0, 5, 0] },
        { at: 1, from: [-36, 14, -17], to: [0, 5, 0] },
      ],
      // Start in the street looking up, then rise above the rooftops.
      rise: [
        { at: 0, from: [0, 1.6, 24], to: [0, 16, -24] },
        { at: 1, from: [0, 40, 34], to: [0, 0, 0] },
      ],
    },
  },
};
