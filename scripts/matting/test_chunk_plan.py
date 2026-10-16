import unittest

from hand_cutout import chunk_plan


class ChunkPlanTest(unittest.TestCase):
    def assert_covers(self, total, size, prompt):
        plan = chunk_plan(total, size, prompt)
        covered = set()
        for start, end, local_prompt, direction in plan:
            self.assertLessEqual(end - start, size)
            self.assertTrue(0 <= local_prompt < end - start)
            covered.update(range(start, end))
        self.assertEqual(covered, set(range(total)))
        return plan

    def test_the_first_session_holds_the_prompt_frame(self):
        plan = self.assert_covers(3483, 400, 900)
        start, end, local_prompt, direction = plan[0]
        self.assertEqual((direction, start + local_prompt), ("both", 900))

    def test_every_later_session_is_seeded_from_a_frame_already_tracked(self):
        plan = self.assert_covers(3483, 400, 900)
        tracked = set(range(plan[0][0], plan[0][1]))
        for start, end, local_prompt, direction in plan[1:]:
            self.assertIn(start + local_prompt, tracked)
            self.assertEqual(local_prompt, 0 if direction == "forward" else end - start - 1)
            tracked.update(range(start, end))

    def test_prompt_at_either_edge_and_short_tails(self):
        self.assert_covers(1001, 400, 0)
        self.assert_covers(1001, 400, 1000)
        self.assert_covers(401, 400, 200)

    def test_a_sequence_that_fits_is_one_session(self):
        self.assertEqual(chunk_plan(400, 400, 123), [(0, 400, 123, "both")])


if __name__ == "__main__":
    unittest.main()
