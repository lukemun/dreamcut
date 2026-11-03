import importlib.util
from pathlib import Path
import unittest
import tempfile
import json
import subprocess
import shutil
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

class WaveformSilenceRegression(unittest.TestCase):
    """Exercise the shipped comparator against actual AAC decode, not mocked scores."""
    @classmethod
    def setUpClass(cls):
        if not shutil.which('ffmpeg') or not shutil.which('node'):
            raise unittest.SkipTest('ffmpeg and node are required for encoded-audio regression')
        cls.repo = Path(__file__).resolve().parents[1]
        cls.temp = tempfile.TemporaryDirectory(prefix='rendered-audio-silence-')
        cls.root = Path(cls.temp.name)
        for name, source in [('silent', 'anullsrc=r=48000:cl=mono'), ('tone', 'sine=frequency=440:sample_rate=48000'),
                ('antiphase', 'aevalsrc=0.25*sgn(sin(2*PI*440*t))|-0.25*sgn(sin(2*PI*440*t)):s=48000')]:
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i',
                'color=c=black:s=64x64:r=30:d=1', '-f', 'lavfi', '-i', source,
                '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'alac' if name == 'antiphase' else 'aac',
                str(cls.root / (name + '.mp4'))], check=True)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def compare(self, reference, candidate):
        directory = self.root / (reference + '-' + candidate)
        directory.mkdir(exist_ok=True)
        shutil.copyfile(self.root / (reference + '.mp4'), directory / 'reference.mp4')
        shutil.copyfile(self.root / (candidate + '.mp4'), directory / 'candidate.mp4')
        result = subprocess.run(['node', str(self.repo / 'node_modules/tsx/dist/cli.mjs'),
            str(self.repo / 'scripts/compare-rendered-videos.ts'), str(directory)],
            cwd=self.repo, capture_output=True, text=True)
        return result, directory

    def test_two_silent_tracks_have_unavailable_similarity(self):
        result, directory = self.compare('silent', 'silent')
        self.assertEqual(result.returncode, 0, result.stderr)
        receipt = json.loads((directory / 'encoded-comparison.json').read_text())
        self.assertTrue(receipt['audio']['digitalSilence'])
        self.assertIsNone(receipt['audio']['alignedCorrelation'])
        self.assertIsNone(receipt['audio']['gainRatio'])

    def test_identical_nonzero_audio_still_passes(self):
        result, directory = self.compare('tone', 'tone')
        self.assertEqual(result.returncode, 0, result.stderr)
        receipt = json.loads((directory / 'encoded-comparison.json').read_text())
        self.assertFalse(receipt['audio']['digitalSilence'])
        self.assertGreater(receipt['audio']['alignedCorrelation'], .98)

    def test_silent_reference_cannot_accept_audible_candidate(self):
        result, _ = self.compare('silent', 'tone')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('audio silence mismatch', result.stderr)

    def test_audible_reference_cannot_accept_silent_candidate(self):
        result, _ = self.compare('tone', 'silent')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('audio silence mismatch', result.stderr)

    def test_antiphase_stereo_cannot_masquerade_as_silence(self):
        result, _ = self.compare('silent', 'antiphase')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('audio silence mismatch', result.stderr)

    def test_cancelled_downmix_is_unavailable_even_for_identical_stereo(self):
        result, _ = self.compare('antiphase', 'antiphase')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('mono downmix erased nonzero native-channel audio', result.stderr)

if __name__ == '__main__':
    unittest.main()
