import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location('compare_audio', Path(__file__).with_name('compare-rendered-audio.py'))
comparison = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comparison)

class TailCoverage(unittest.TestCase):
    def test_evidenced_delay_preserves_the_entire_aligned_signal(self):
        expected = np.arange(12000, dtype=np.float32)
        reference = np.concatenate([np.zeros(512), expected])
        actual, candidate = comparison.align_audio(reference, expected, 512/12000)
        np.testing.assert_array_equal(actual, candidate)
        self.assertEqual(len(actual),12000)

    def test_missing_20ms_tail_fails_even_inside_old_duration_tolerance(self):
        reference = np.ones(12000+512)
        with self.assertRaisesRegex(AssertionError,'Aligned audio length mismatch'):
            comparison.align_audio(reference,np.ones(11760),512/12000)

    def test_extra_candidate_tail_also_fails(self):
        with self.assertRaisesRegex(AssertionError,'Aligned audio length mismatch'):
            comparison.align_audio(np.ones(12000),np.ones(12120),0)

if __name__ == '__main__':
    unittest.main()
