import unittest

import numpy as np

from mask_postprocess import fill_small_enclosed_holes


class FillSmallEnclosedHolesTest(unittest.TestCase):
    def test_fills_a_small_hole_inside_the_subject(self):
        mask = np.zeros((20, 20), dtype=bool)
        mask[3:17, 3:17] = True
        mask[8:10, 8:10] = False

        cleaned = fill_small_enclosed_holes(mask, max_area_ratio=0.02)

        self.assertTrue(cleaned[8:10, 8:10].all())

    def test_preserves_a_large_legitimate_opening(self):
        mask = np.ones((20, 20), dtype=bool)
        mask[5:15, 5:15] = False

        cleaned = fill_small_enclosed_holes(mask, max_area_ratio=0.02)

        self.assertFalse(cleaned[5:15, 5:15].any())

    def test_preserves_background_connected_to_the_frame_edge(self):
        mask = np.ones((20, 20), dtype=bool)
        mask[0:10, 9:11] = False

        cleaned = fill_small_enclosed_holes(mask, max_area_ratio=1)

        self.assertFalse(cleaned[0:10, 9:11].any())

    def test_does_not_change_the_outer_silhouette(self):
        mask = np.zeros((20, 20), dtype=bool)
        mask[4:16, 4:16] = True
        mask[8, 8] = False

        cleaned = fill_small_enclosed_holes(mask, max_area_ratio=0.01)

        self.assertTrue(np.array_equal(cleaned[0:4], mask[0:4]))
        self.assertTrue(np.array_equal(cleaned[:, 0:4], mask[:, 0:4]))


if __name__ == "__main__":
    unittest.main()
