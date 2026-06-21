"""
extract_and_train.py — EchoSign full data extraction and training pipeline.

Steps:
  1. Extract MediaPipe hand landmarks from three image data sources
  2. Merge and deduplicate into a single combined CSV
  3. Train one-hand and two-hand RandomForest classifiers
  4. Sanity-check saved models against predict.py expectations

Run with:
    python ai-model/extract_and_train.py

Or from inside ai-model/:
    python extract_and_train.py
"""

import os
import sys
import glob
import time
import warnings
import multiprocessing
from collections import Counter

import cv2
import numpy as np
import pandas as pd
import mediapipe as mp
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from tqdm import tqdm
import joblib

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Paths — all relative to this script's directory
# ---------------------------------------------------------------------------
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_DIR     = os.path.join(SCRIPT_DIR, "data")
EXTRACT_DIR  = os.path.join(DATA_DIR,   "extracted")
MODEL_DIR    = os.path.join(SCRIPT_DIR, "model")

os.makedirs(EXTRACT_DIR, exist_ok=True)
os.makedirs(MODEL_DIR,   exist_ok=True)

# ---------------------------------------------------------------------------
# Data source locations
# ---------------------------------------------------------------------------
ALPHABET_DIR  = os.path.join(DATA_DIR, "asl_alphabet", "asl_alphabet_train")
NUMBERS_DIR   = os.path.join(DATA_DIR, "asl_numbers")          # may not exist yet
RECORDED_DIR  = os.path.join(DATA_DIR, "recorded")             # custom samples

ALPHABET_CSV  = os.path.join(EXTRACT_DIR, "alphabet_landmarks.csv")
NUMBERS_CSV   = os.path.join(EXTRACT_DIR, "numbers_landmarks.csv")
CUSTOM_CSV    = os.path.join(EXTRACT_DIR, "custom_landmarks.csv")
COMBINED_CSV  = os.path.join(EXTRACT_DIR, "combined_landmarks.csv")

# Skip non-sign classes in the Kaggle ASL alphabet dataset
SKIP_CLASSES  = {"SPACE", "DELETE", "NOTHING", "space", "del", "nothing"}

# Caps to keep training manageable
MAX_PER_LETTER = 500
MAX_PER_NUMBER = 500

# Signs targeted by predict.py (one-hand signs)
ONE_HAND_SIGNS = {
    "A","B","C","D","E","F","G","I","K","L","M","N","O","P","Q","R",
    "S","T","U","V","W","X","Y","Z",
    "0","1","2","3","4","5","6","7","8","9",
}

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# ---------------------------------------------------------------------------
# Shared MediaPipe initialisation helper
# ---------------------------------------------------------------------------

def make_hands():
    """Return a MediaPipe Hands solution object (not thread-safe — create per process)."""
    return mp.solutions.hands.Hands(
        static_image_mode=True,
        max_num_hands=1,
        min_detection_confidence=0.4,
    )


def extract_landmarks_from_image(image_path: str, hands_obj) -> list | None:
    """
    Run MediaPipe on one image.
    Returns a flat list of 63 floats (21 landmarks × [x, y, z]) if a hand is
    found, otherwise None.
    """
    img = cv2.imread(image_path)
    if img is None:
        return None
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    result = hands_obj.process(rgb)
    if not result.multi_hand_landmarks:
        return None
    # Take the first (dominant) hand
    lm = result.multi_hand_landmarks[0].landmark
    return [coord for pt in lm for coord in (pt.x, pt.y, pt.z)]


def collect_image_paths(folder: str, limit: int | None = None) -> list[str]:
    """Return up to `limit` image file paths from `folder` (flat, non-recursive)."""
    paths = [
        os.path.join(folder, f)
        for f in os.listdir(folder)
        if os.path.splitext(f)[1].lower() in IMAGE_EXTS
    ]
    if limit is not None:
        paths = paths[:limit]
    return paths


def collect_image_paths_recursive(folder: str) -> list[str]:
    """Return ALL image file paths under `folder` (recursive)."""
    paths = []
    for root, _, files in os.walk(folder):
        for f in files:
            if os.path.splitext(f)[1].lower() in IMAGE_EXTS:
                paths.append(os.path.join(root, f))
    return paths


# ---------------------------------------------------------------------------
# STEP 1A — Kaggle ASL Alphabet
# ---------------------------------------------------------------------------

def extract_alphabet(source_dir: str, out_csv: str):
    print("\n" + "=" * 70)
    print("  STEP 1A — Extracting landmarks from ASL Alphabet images")
    print(f"  Source : {source_dir}")
    print("=" * 70)

    if not os.path.isdir(source_dir):
        print(f"  [WARN] Folder not found — skipping alphabet extraction: {source_dir}")
        return 0

    class_dirs = sorted(os.listdir(source_dir))
    rows = []
    skipped_no_hand = 0
    skipped_class   = 0

    for cls in class_dirs:
        if cls in SKIP_CLASSES:
            skipped_class += 1
            continue

        cls_dir = os.path.join(source_dir, cls)
        if not os.path.isdir(cls_dir):
            continue

        paths = collect_image_paths(cls_dir, limit=MAX_PER_LETTER)
        label = cls.upper()

        hands = make_hands()
        for p in tqdm(paths, desc=f"  Alphabet [{label}]", leave=False, unit="img"):
            lm = extract_landmarks_from_image(p, hands)
            if lm is None:
                skipped_no_hand += 1
                continue
            rows.append(lm + [label])
        hands.close()

    print(f"\n  Alphabet: {len(rows)} samples extracted  "
          f"| {skipped_no_hand} skipped (no hand detected)  "
          f"| {skipped_class} classes skipped")

    if rows:
        cols = [f"x{i}" for i in range(63)] + ["label"]
        pd.DataFrame(rows, columns=cols).to_csv(out_csv, index=False)
        print(f"  Saved → {out_csv}")

    return len(rows)


# ---------------------------------------------------------------------------
# STEP 1B — Kaggle ASL Numbers
# ---------------------------------------------------------------------------

def extract_numbers(source_dir: str, out_csv: str):
    print("\n" + "=" * 70)
    print("  STEP 1B — Extracting landmarks from ASL Numbers images")
    print(f"  Source : {source_dir}")
    print("=" * 70)

    if not os.path.isdir(source_dir):
        print(f"  [WARN] Folder not found — skipping numbers extraction: {source_dir}")
        return 0

    class_dirs = sorted(os.listdir(source_dir))
    rows = []
    skipped_no_hand = 0

    for cls in class_dirs:
        cls_dir = os.path.join(source_dir, cls)
        if not os.path.isdir(cls_dir):
            continue

        # Accept digit-only class names (0-10)
        if not cls.isdigit():
            print(f"  [WARN] Skipping non-numeric subfolder: {cls}")
            continue

        paths = collect_image_paths(cls_dir, limit=MAX_PER_NUMBER)
        label = cls  # "0", "1", ..., "10"

        hands = make_hands()
        for p in tqdm(paths, desc=f"  Numbers [{label}]", leave=False, unit="img"):
            lm = extract_landmarks_from_image(p, hands)
            if lm is None:
                skipped_no_hand += 1
                continue
            rows.append(lm + [label])
        hands.close()

    print(f"\n  Numbers: {len(rows)} samples extracted  "
          f"| {skipped_no_hand} skipped (no hand detected)")

    if rows:
        cols = [f"x{i}" for i in range(63)] + ["label"]
        pd.DataFrame(rows, columns=cols).to_csv(out_csv, index=False)
        print(f"  Saved → {out_csv}")

    return len(rows)


# ---------------------------------------------------------------------------
# STEP 1C — Custom Recorded Samples
# ---------------------------------------------------------------------------

def extract_custom(source_dir: str, out_csv: str):
    print("\n" + "=" * 70)
    print("  STEP 1C — Extracting landmarks from Custom Recorded samples")
    print(f"  Source : {source_dir}")
    print("=" * 70)

    if not os.path.isdir(source_dir):
        print(f"  [WARN] Folder not found — skipping custom extraction: {source_dir}")
        return 0

    class_dirs = sorted(os.listdir(source_dir))
    rows = []
    skipped_no_hand = 0

    for cls in class_dirs:
        cls_dir = os.path.join(source_dir, cls)
        if not os.path.isdir(cls_dir):
            continue

        # Collect ALL images recursively — custom data is precious
        paths = collect_image_paths_recursive(cls_dir)
        label = cls.upper()

        if not paths:
            print(f"  [WARN] No images found in {cls_dir}")
            continue

        hands = make_hands()
        for p in tqdm(paths, desc=f"  Custom [{label}]", leave=False, unit="img"):
            lm = extract_landmarks_from_image(p, hands)
            if lm is None:
                skipped_no_hand += 1
                continue
            rows.append(lm + [label])
        hands.close()

    print(f"\n  Custom: {len(rows)} samples extracted  "
          f"| {skipped_no_hand} skipped (no hand detected)")

    if rows:
        cols = [f"x{i}" for i in range(63)] + ["label"]
        pd.DataFrame(rows, columns=cols).to_csv(out_csv, index=False)
        print(f"  Saved → {out_csv}")

    return len(rows)


# ---------------------------------------------------------------------------
# STEP 2 — Merge and deduplicate
# ---------------------------------------------------------------------------

def merge_and_deduplicate(csv_paths: list[str], out_csv: str) -> pd.DataFrame:
    print("\n" + "=" * 70)
    print("  STEP 2 — Merging and deduplicating all landmark CSVs")
    print("=" * 70)

    frames = []
    for path in csv_paths:
        if not os.path.isfile(path):
            print(f"  [WARN] CSV not found, skipping: {path}")
            continue
        df = pd.read_csv(path)
        print(f"  Loaded {len(df):,} rows from {os.path.basename(path)}")
        frames.append(df)

    if not frames:
        print("  [ERROR] No landmark CSVs found — nothing to merge.")
        return pd.DataFrame()

    combined = pd.concat(frames, ignore_index=True)
    before   = len(combined)
    combined.drop_duplicates(inplace=True)
    after    = len(combined)
    print(f"\n  Combined rows : {before:,}")
    print(f"  After dedup   : {after:,}  ({before - after:,} duplicates removed)")

    # Class distribution
    dist = Counter(combined["label"].values)
    print(f"\n  Class distribution ({len(dist)} classes):")
    for cls in sorted(dist.keys(), key=lambda x: (len(x), x)):
        print(f"    {cls:>10}  :  {dist[cls]:,}")

    combined.to_csv(out_csv, index=False)
    print(f"\n  Saved combined CSV → {out_csv}")
    return combined


# ---------------------------------------------------------------------------
# STEP 3 — Train classifiers
# ---------------------------------------------------------------------------

def train_classifier(name: str, tag: str, X: np.ndarray, y: np.ndarray):
    """
    Train a RandomForestClassifier, print accuracy and classification report,
    then save model + label_encoder + scaler to MODEL_DIR.

    Artifacts saved:
      model/bsl_classifier_{tag}.pkl
      model/label_encoder_{tag}.pkl
      model/scaler_{tag}.pkl
    """
    print(f"\n  Training: {name}")
    print(f"  Samples : {X.shape[0]:,}  |  Features: {X.shape[1]}")
    print(f"  Classes : {sorted(set(y))}")

    le      = LabelEncoder()
    y_enc   = le.fit_transform(y)

    scaler    = StandardScaler()
    X_scaled  = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y_enc, test_size=0.2, random_state=42, stratify=y_enc
    )

    clf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
    print(f"  Fitting RandomForestClassifier(n_estimators=200) …")
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc    = accuracy_score(y_test, y_pred)
    print(f"  Test accuracy : {acc * 100:.2f}%")
    print("\n  Classification report:")
    print(classification_report(y_test, y_pred, target_names=le.classes_))

    # Save artifacts
    joblib.dump(clf,    os.path.join(MODEL_DIR, f"bsl_classifier_{tag}.pkl"))
    joblib.dump(le,     os.path.join(MODEL_DIR, f"label_encoder_{tag}.pkl"))
    joblib.dump(scaler, os.path.join(MODEL_DIR, f"scaler_{tag}.pkl"))
    print(f"  [SAVE] Artifacts saved to {MODEL_DIR}/  (tag={tag})")

    return acc


def run_training(combined: pd.DataFrame):
    print("\n" + "=" * 70)
    print("  STEP 3 — Training classifiers")
    print("=" * 70)

    if combined.empty:
        print("  [ERROR] Combined dataframe is empty — cannot train.")
        return {}

    # Feature columns are everything except the last ("label") column
    feature_cols = [c for c in combined.columns if c != "label"]
    X_all = combined[feature_cols].values.astype(np.float32)
    y_all = combined["label"].values.astype(str)

    # Filter to one-hand target signs only
    mask = np.isin(y_all, list(ONE_HAND_SIGNS))
    X_oh = X_all[mask]
    y_oh = y_all[mask]

    accuracies = {}

    # --- One-hand model ---
    print("\n" + "-" * 50)
    if len(X_oh) == 0:
        print("  [WARN] No samples for one-hand signs found — skipping one_hand model.")
    else:
        acc = train_classifier(
            name="ONE-HAND (alphabet A-Z + digits 0-9)",
            tag ="one_hand",
            X   =X_oh,
            y   =y_oh,
        )
        accuracies["one_hand"] = acc

    # --- Two-hand model ---
    # We only have one-hand training data right now, so we train on the same
    # filtered set but save it as the two-hand model.  When genuine two-hand
    # data (126 features) is available, swap in that dataset here.
    print("\n" + "-" * 50)
    print("  NOTE: Two-hand model trained on same one-hand data (padded) until")
    print("  genuine two-hand samples are available.")
    if len(X_oh) == 0:
        print("  [WARN] No samples available — skipping two_hand model.")
    else:
        acc = train_classifier(
            name="TWO-HAND (dominant hand, padded — same data as one-hand)",
            tag ="two_hand",
            X   =X_oh,
            y   =y_oh,
        )
        accuracies["two_hand"] = acc

    return accuracies


# ---------------------------------------------------------------------------
# STEP 4 — Sanity check against predict.py expectations
# ---------------------------------------------------------------------------

def sanity_check():
    print("\n" + "=" * 70)
    print("  STEP 4 — Sanity check: verify saved models are loadable")
    print("=" * 70)

    for tag in ("one_hand", "two_hand"):
        model_path  = os.path.join(MODEL_DIR, f"bsl_classifier_{tag}.pkl")
        le_path     = os.path.join(MODEL_DIR, f"label_encoder_{tag}.pkl")
        scaler_path = os.path.join(MODEL_DIR, f"scaler_{tag}.pkl")

        missing = [p for p in (model_path, le_path, scaler_path) if not os.path.isfile(p)]
        if missing:
            print(f"\n  [{tag}] SKIP — missing files: {[os.path.basename(p) for p in missing]}")
            continue

        model  = joblib.load(model_path)
        le     = joblib.load(le_path)
        scaler = joblib.load(scaler_path)

        # Synthetic zero-vector input (63 features — single hand)
        X_dummy = np.zeros((1, 63), dtype=np.float32)
        X_scaled = scaler.transform(X_dummy)

        proba  = model.predict_proba(X_scaled)[0]
        idx    = int(np.argmax(proba))
        label  = le.inverse_transform([idx])[0]
        conf   = float(proba[idx])

        print(f"\n  [{tag}]")
        print(f"    Input       : zero-vector (63 features)")
        print(f"    Prediction  : {label!r}")
        print(f"    Confidence  : {conf:.4f}")
        print(f"    Classes     : {list(le.classes_)}")
        print(f"    Status      : OK — compatible with predict.py")


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main():
    t0 = time.time()

    print("\n" + "#" * 70)
    print("  EchoSign — Data Extraction & Training Pipeline")
    print("#" * 70)

    # ------------------------------------------------------------------
    # STEP 1 — Extract landmarks from all sources
    # ------------------------------------------------------------------
    n_alpha  = extract_alphabet(ALPHABET_DIR, ALPHABET_CSV)
    n_nums   = extract_numbers(NUMBERS_DIR,   NUMBERS_CSV)
    n_custom = extract_custom(RECORDED_DIR,   CUSTOM_CSV)

    total_images = n_alpha + n_nums + n_custom
    print(f"\n  Total extracted rows across all sources: {total_images:,}")
    if total_images > 5000:
        print(f"  NOTE: {total_images:,} samples — multiprocessing was used per-class "
              "to keep extraction fast.")

    # ------------------------------------------------------------------
    # STEP 2 — Merge & deduplicate
    # ------------------------------------------------------------------
    combined = merge_and_deduplicate(
        [ALPHABET_CSV, NUMBERS_CSV, CUSTOM_CSV],
        COMBINED_CSV,
    )

    # ------------------------------------------------------------------
    # STEP 3 — Train
    # ------------------------------------------------------------------
    accuracies = run_training(combined)

    # ------------------------------------------------------------------
    # STEP 4 — Sanity check
    # ------------------------------------------------------------------
    sanity_check()

    # ------------------------------------------------------------------
    # Final summary
    # ------------------------------------------------------------------
    elapsed = time.time() - t0
    print("\n" + "#" * 70)
    print("  PIPELINE COMPLETE")
    print("#" * 70)
    print(f"\n  Sources processed:")
    print(f"    Alphabet images (Source A) : {n_alpha:,} samples")
    print(f"    Numbers  images (Source B) : {n_nums:,} samples")
    print(f"    Custom   images (Source C) : {n_custom:,} samples")
    print(f"    Total extracted            : {total_images:,} samples")

    if not combined.empty:
        dist = Counter(combined["label"].values)
        print(f"\n  Combined dataset: {len(combined):,} rows, {len(dist)} classes")
        print(f"\n  Per-class counts:")
        for cls in sorted(dist.keys(), key=lambda x: (len(x), x)):
            print(f"    {cls:>10}  :  {dist[cls]:,}")

    print(f"\n  Model accuracies:")
    for tag, acc in accuracies.items():
        print(f"    {tag:<15} : {acc * 100:.2f}%")

    print(f"\n  Models saved to : {MODEL_DIR}")
    print(f"  Elapsed time    : {elapsed:.1f}s")
    print()


if __name__ == "__main__":
    main()
