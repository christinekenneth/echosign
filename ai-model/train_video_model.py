"""
train_video_model.py

Reads ASL training videos from data/asl_recordings/,
extracts MediaPipe hand landmark sequences,
trains a RandomForest classifier per sequence,
and saves the model to model/.

Usage:
    python ai-model/train_video_model.py
"""

import argparse
import json
import re
import sys
import time
import urllib.request
import threading
import numpy as np
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
from pathlib import Path
from collections import defaultdict, Counter
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, accuracy_score
import joblib

# ── Config ─────────────────────────────────────────────────────
BASE          = Path(__file__).parent
RECORDINGS    = BASE / "data" / "asl_recordings"
LANDMARKS_DIR = BASE / "data" / "landmark_samples"
MODEL_DIR     = BASE / "model"
SEQUENCE_LEN  = 30     # frames sampled per video
N_FEATURES    = 126    # 21 landmarks * 3 (x,y,z) * 2 hands
MIN_SAMPLES   = 3      # min videos required to include a class

HAND_MODEL_PATH = BASE / "hand_landmarker.task"
HAND_MODEL_URL  = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
)


def ensure_hand_model():
    """Download the MediaPipe hand landmarker model if not already present."""
    if HAND_MODEL_PATH.exists():
        return
    print(f"Downloading hand landmarker model -> {HAND_MODEL_PATH.name} ...")
    urllib.request.urlretrieve(HAND_MODEL_URL, HAND_MODEL_PATH)
    print("Download complete.")


# ── Label extraction ───────────────────────────────────────────
def extract_label(filepath: Path) -> str:
    """Derive a clean class label from a video filename."""
    name = filepath.name
    # Strip .mp4 extension(s) — handles double .mp4.mp4
    name = re.sub(r'(\.mp4)+$', '', name, flags=re.IGNORECASE)
    # Normalise to lowercase + underscores only
    name = name.lower()
    name = re.sub(r'[^a-z0-9_]', '_', name)
    name = re.sub(r'_+', '_', name).strip('_')

    # Remove signer/take suffix: _sN_ (e.g. _s1_f_a_t01)
    m = re.match(r'^(.+?)_s\d+_', name)
    if m:
        return m.group(1)

    # Remove trailing 3-digit take number: _001 at end
    m = re.match(r'^(.+)_\d{3}$', name)
    if m:
        return m.group(1)

    return name


# ── Landmark extraction ────────────────────────────────────────
def get_frames(video_path: Path):
    """Return a list of evenly-sampled BGR frames from a video."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return []
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total < 1:
        frames = []
        while True:
            ret, f = cap.read()
            if not ret:
                break
            frames.append(f)
        cap.release()
        total = len(frames)
        if total == 0:
            return []
        indices = np.linspace(0, total - 1, SEQUENCE_LEN, dtype=int)
        return [frames[i] for i in indices]
    else:
        indices = np.linspace(0, total - 1, SEQUENCE_LEN, dtype=int)
        result  = []
        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
            ret, frame = cap.read()
            result.append(frame if ret else None)
        cap.release()
        return result


def normalize_frame(row: np.ndarray) -> np.ndarray:
    """Wrist-relative, scale-normalised frame (matches predict.py)."""
    row = row.copy()
    for offset in (0, 63):
        wx, wy, wz = row[offset], row[offset + 1], row[offset + 2]
        if wx == 0.0 and wy == 0.0:
            continue
        dx = row[offset + 39] - wx
        dy = row[offset + 40] - wy
        dz = row[offset + 41] - wz
        scale = max(float(np.sqrt(dx*dx + dy*dy + dz*dz)), 1e-6)
        for i in range(21):
            row[offset + i*3]     = (row[offset + i*3]     - wx) / scale
            row[offset + i*3 + 1] = (row[offset + i*3 + 1] - wy) / scale
            row[offset + i*3 + 2] = (row[offset + i*3 + 2] - wz) / scale
    return row


def extract_sequence(video_path: Path, landmarker) -> np.ndarray:
    """
    Sample SEQUENCE_LEN frames and return normalised, flattened landmarks.
    Shape: (SEQUENCE_LEN, N_FEATURES). Zero-filled where hands absent.
    """
    sequence = np.zeros((SEQUENCE_LEN, N_FEATURES), dtype=np.float32)
    frames   = get_frames(video_path)

    for slot, frame in enumerate(frames):
        if frame is None:
            continue
        rgb      = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result   = landmarker.detect(mp_image)

        if not result.hand_landmarks:
            continue

        left_lm = right_lm = None
        for handedness_list, lm_list in zip(result.handedness, result.hand_landmarks):
            side = handedness_list[0].category_name
            if side == 'Left':
                left_lm  = lm_list
            else:
                right_lm = lm_list

        row = np.zeros(N_FEATURES, dtype=np.float32)
        if left_lm:
            for i, pt in enumerate(left_lm):
                row[i*3], row[i*3+1], row[i*3+2] = pt.x, pt.y, pt.z
        if right_lm:
            off = 63
            for i, pt in enumerate(right_lm):
                row[off+i*3], row[off+i*3+1], row[off+i*3+2] = pt.x, pt.y, pt.z

        if left_lm or right_lm:
            sequence[slot] = normalize_frame(row)

    return sequence


# ── Data augmentation ──────────────────────────────────────────
def augment_sequence(seq: np.ndarray, n_aug: int = 19) -> list[np.ndarray]:
    """
    Generate n_aug augmented variants of a (SEQUENCE_LEN, N_FEATURES) array.
    Augmentations: Gaussian noise, temporal shift, speed jitter.
    """
    rng = np.random.default_rng()
    variants = []
    for _ in range(n_aug):
        aug = seq.copy()

        # 1. Gaussian coordinate noise (±1.5% of typical landmark spread)
        aug += rng.normal(0, 0.015, aug.shape).astype(np.float32)

        # 2. Temporal shift ±4 frames — simulate signing slightly early/late
        shift = int(rng.integers(-4, 5))
        if shift > 0:
            aug = np.vstack([aug[shift:], np.tile(aug[-1:], (shift, 1))])
        elif shift < 0:
            aug = np.vstack([np.tile(aug[:1], (-shift, 1)), aug[:shift]])

        # 3. Speed jitter ±20% — resample then crop back to SEQUENCE_LEN
        speed    = rng.uniform(0.8, 1.2)
        new_len  = max(8, int(SEQUENCE_LEN / speed))
        idx      = np.linspace(0, len(aug) - 1, new_len)
        lo       = np.floor(idx).astype(int)
        hi       = np.minimum(lo + 1, len(aug) - 1)
        t        = (idx - lo)[:, None]
        stretched = aug[lo] * (1 - t) + aug[hi] * t
        final_idx = np.linspace(0, new_len - 1, SEQUENCE_LEN).round().astype(int)
        aug = stretched[final_idx]

        variants.append(aug.astype(np.float32))
    return variants


# ── JSON landmark samples ──────────────────────────────────────
def load_json_samples() -> tuple[list[np.ndarray], list[str]]:
    """
    Load user-recorded landmark samples from data/landmark_samples/<label>/*.json.
    Returns originals + 19 augmented variants per sample.
    """
    X, y = [], []
    if not LANDMARKS_DIR.exists():
        return X, y

    orig_count = 0
    for label_dir in sorted(LANDMARKS_DIR.iterdir()):
        if not label_dir.is_dir():
            continue
        label = label_dir.name
        for json_file in sorted(label_dir.glob("*.json")):
            try:
                data   = json.loads(json_file.read_text())
                frames = np.array(data["frames"], dtype=np.float32)

                n = len(frames)
                if n == 0:
                    continue
                if n != SEQUENCE_LEN:
                    indices = np.linspace(0, n - 1, SEQUENCE_LEN)
                    lo = np.floor(indices).astype(int)
                    hi = np.minimum(lo + 1, n - 1)
                    t  = (indices - lo)[:, None]
                    frames = frames[lo] * (1 - t) + frames[hi] * t

                normalised = np.array([normalize_frame(frames[i]) for i in range(SEQUENCE_LEN)],
                                      dtype=np.float32)

                # Original
                X.append(normalised.flatten())
                y.append(label)
                orig_count += 1

                # 19 augmented variants
                for aug_seq in augment_sequence(normalised, n_aug=19):
                    X.append(aug_seq.flatten())
                    y.append(label)

            except Exception as e:
                print(f"  WARNING: skipping {json_file.name} - {e}")

    if X:
        print(f"\nLoaded {orig_count} original JSON samples -> {len(X)} total after augmentation "
              f"(20x per sample) across {len(set(y))} labels")
    return X, y


# ── Main ───────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--json-only', action='store_true',
                        help='Skip MP4 video processing — train only on JSON landmark samples')
    args = parser.parse_args()

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    t0 = time.time()

    print("=" * 60)
    print("EchoSign - ASL sequence model training")
    if args.json_only:
        print("Mode: JSON samples only (fast)")
    print("=" * 60)

    # 1. Discover all MP4 files and extract labels
    print(f"\nScanning {RECORDINGS} ...")

    label_to_files: dict[str, list[Path]] = defaultdict(list)
    for mp4 in sorted(RECORDINGS.rglob("*.mp4")):
        label = extract_label(mp4)
        label_to_files[label].append(mp4)

    total_videos = sum(len(v) for v in label_to_files.values())
    print(f"Found {total_videos} videos across {len(label_to_files)} labels\n")

    # 2. Show label inventory
    print(f"{'Label':<40}  {'Videos':>6}  Status")
    print("-" * 60)
    for label, files in sorted(label_to_files.items(), key=lambda x: -len(x[1])):
        status = "OK" if len(files) >= MIN_SAMPLES else f"SKIP (<{MIN_SAMPLES})"
        print(f"  {label:<38}  {len(files):>6}  {status}")

    usable  = {k: v for k, v in label_to_files.items() if len(v) >= MIN_SAMPLES}
    skipped = len(label_to_files) - len(usable)
    print(f"\nTraining on {len(usable)} classes  |  "
          f"{skipped} skipped (fewer than {MIN_SAMPLES} videos)")

    # 3. Load user-recorded JSON samples first
    json_X, json_y = load_json_samples()

    X, y = [], []

    # 4. Extract landmark sequences from MP4 videos (skipped in --json-only mode)
    if usable and not args.json_only:
        ensure_hand_model()
        print("\nExtracting hand landmarks from videos...")
        print("(this takes a few minutes)\n")

        options = mp_vision.HandLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(HAND_MODEL_PATH)),
            num_hands=2,
            min_hand_detection_confidence=0.3,
            min_tracking_confidence=0.3,
            running_mode=mp_vision.RunningMode.IMAGE,
        )

        errors = []
        done  = 0

        VIDEO_TIMEOUT = 30  # seconds — skip video if MediaPipe hangs

        with mp_vision.HandLandmarker.create_from_options(options) as landmarker:
            for label, files in sorted(usable.items()):
                for path in files:
                    result_holder = [None]
                    error_holder  = [None]

                    def _run(p=path, lm=landmarker, rh=result_holder, eh=error_holder):
                        try:
                            rh[0] = extract_sequence(p, lm)
                        except Exception as exc:
                            eh[0] = exc

                    t = threading.Thread(target=_run, daemon=True)
                    t.start()
                    t.join(VIDEO_TIMEOUT)

                    if t.is_alive():
                        errors.append(f"{path.name}: timed out after {VIDEO_TIMEOUT}s")
                        print(f"  TIMEOUT: {path.name}")
                        continue
                    if error_holder[0]:
                        errors.append(f"{path.name}: {error_holder[0]}")
                        print(f"  ERROR: {path.name} - {error_holder[0]}")
                        continue

                    X.append(result_holder[0].flatten())
                    y.append(label)
                    done += 1
                    print(f"  [{done:>3}/{total_videos}]  {label:<35}  {path.name}")

        if errors:
            print(f"\n{len(errors)} file(s) failed:")
            for e in errors:
                print(f"  {e}")

    # Merge JSON samples (already augmented 20× — no extra duplication needed)
    if json_X:
        X = X + json_X
        y = y + json_y

    if len(set(y)) < 2:
        print("\nERROR: Need at least 2 classes. Record more samples via the admin train page.")
        sys.exit(1)

    X = np.array(X)
    print(f"\nDataset shape: {X.shape[0]} samples x {X.shape[1]} features")
    print(f"Classes ({len(set(y))}): {sorted(set(y))}")

    # 4. Encode labels
    le    = LabelEncoder()
    y_enc = le.fit_transform(y)

    # 5. Train / test split
    class_counts  = Counter(y)
    can_stratify  = all(c >= 2 for c in class_counts.values())
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_enc, test_size=0.2, random_state=42,
        stratify=y_enc if can_stratify else None,
    )
    print(f"Train: {len(X_train)}  |  Test: {len(X_test)}\n")

    # 6. Scale
    scaler  = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_test  = scaler.transform(X_test)

    # 7. Train RandomForest
    print("Training RandomForest (200 trees)...")
    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=20,
        class_weight='balanced',
        n_jobs=-1,
        random_state=42,
    )
    clf.fit(X_train, y_train)

    # 8. Save first — before any reporting that might fail
    model_path = MODEL_DIR / "asl_sequence_classifier.pkl"
    le_path    = MODEL_DIR / "asl_sequence_label_encoder.pkl"
    sc_path    = MODEL_DIR / "asl_sequence_scaler.pkl"

    joblib.dump(clf,    model_path)
    joblib.dump(le,     le_path)
    joblib.dump(scaler, sc_path)
    print(f"\nModel saved to {model_path}")

    # 9. Evaluate
    y_pred = clf.predict(X_test)
    acc    = accuracy_score(y_test, y_pred) * 100
    print(f"\nTest accuracy: {acc:.1f}%")

    try:
        print("\nClassification report:")
        # Only include labels that actually appear in y_test
        present = sorted(set(y_test))
        print(classification_report(
            y_test, y_pred,
            labels=present,
            target_names=[le.classes_[i] for i in present],
            zero_division=0,
        ))
    except Exception as e:
        print(f"  (report skipped: {e})")

    # Cross-validation — use at most min(3, min_class_count) folds
    try:
        min_count = min(Counter(y).values())
        n_folds   = min(3, min_count)
        if n_folds >= 2:
            X_all     = scaler.transform(X)
            cv_scores = cross_val_score(clf, X_all, y_enc, cv=n_folds, scoring='accuracy')
            print(f"Cross-val ({n_folds}-fold): {cv_scores.mean()*100:.1f}% (+/- {cv_scores.std()*100:.1f}%)")
    except Exception as e:
        print(f"  (cross-val skipped: {e})")

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.0f}s")
    print(f"Classes trained ({len(le.classes_)}): {list(le.classes_)}")


if __name__ == "__main__":
    main()
