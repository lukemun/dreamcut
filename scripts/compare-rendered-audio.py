"""Phase-insensitive comparison for explicitly time-stretched reference exports.

Requires numpy/scipy (the repository media-test environment). Waveform correlation
remains the stricter default in compare-rendered-videos.ts for ordinary audio.
"""
import hashlib
import argparse
import json
import subprocess
from pathlib import Path
import numpy as np
from scipy.signal import stft, correlate, correlation_lags

def align_audio(reference, candidate, delay_seconds, rate=12000):
    """Correct only the evidenced leading delay; never discard an unmatched tail."""
    assert 0 <= delay_seconds <= .05, 'Reference delay must be separately evidenced'
    reference = reference[round(delay_seconds * rate):]
    assert len(reference) == len(candidate), f'Aligned audio length mismatch: {len(reference)} versus {len(candidate)} samples'
    assert len(reference) > 0, 'Empty audio comparison'
    return reference, candidate


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    parser.add_argument('--reference-delay', type=float, default=0)
    args = parser.parse_args()
    assert 0 <= args.reference_delay <= .05, 'Reference delay must be separately evidenced'
    rate = 12000

    def decode(name):
        data = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(args.directory / name), '-ac', '1', '-ar', str(rate), '-f', 'f32le', '-'])
        return np.frombuffer(data, dtype='<f4')

    reference, candidate = decode('reference.mp4'), decode('candidate.mp4')
    reference, candidate = align_audio(reference, candidate, args.reference_delay, rate)
    length = len(reference)
    windows = []
    # Use equal analysis windows, overlapping the last one so the tail is covered.
    # A short residual window has different spectral variance and is not comparable.
    starts=sorted(set(list(range(0, max(1,length-rate*10+1), rate*10))+[max(0,length-rate*10)]))
    for start in starts:
        a, b = reference[start:start+rate*10], candidate[start:start+rate*10]
        if len(a) < 480:
            continue
        energy_a, energy_b = float(np.sum(a*a)), float(np.sum(b*b))
        if max(energy_a, energy_b) < 1e-8:
            windows.append({'start_seconds':start/rate,'silent':True})
            continue
        assert min(energy_a, energy_b)>1e-8, 'Audio missing in a window'
        _, _, aa = stft(a, rate, nperseg=480, noverlap=360)
        _, _, bb = stft(b, rate, nperseg=480, noverlap=360)
        aa, bb = np.abs(aa), np.abs(bb)
        ea, eb = np.sqrt(np.mean(aa**2, axis=0)), np.sqrt(np.mean(bb**2, axis=0))
        envelope = float(np.corrcoef(ea, eb)[0, 1])
        spectrum = float(np.sum(aa*bb)/np.sqrt(np.sum(aa**2)*np.sum(bb**2)))
        correlation = correlate(eb, ea)
        lag = float(correlation_lags(len(eb),len(ea))[np.argmax(correlation)]*.01)
        gain = float(np.sqrt(energy_b/energy_a))
        row = {'start_seconds':start/rate,'envelope_correlation':envelope,'spectral_cosine':spectrum,'lag_seconds':lag,'gain_ratio':gain}
        windows.append(row)
        assert envelope > .97, row
        assert spectrum > .95, row
        assert abs(lag) <= .01, row
        assert .95 < gain < 1.05, row
    result={'passed':True,'method':'10-second windows; 40ms STFT with 10ms hop; magnitude spectrum, RMS envelope, lag and gain','reference_delay_seconds':args.reference_delay,'waveform_phase_equivalence':False,'files':{name:hashlib.sha256((args.directory/name).read_bytes()).hexdigest() for name in ['reference.mp4','candidate.mp4']},'windows':windows}
    (args.directory/'time-stretched-audio-comparison.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2))

if __name__ == '__main__':
    main()
