"""
predict.py — called from the Next.js API via child_process.

Input  (stdin): JSON
  Static mode:   {"landmarks": [...63 or 126 floats...], "num_hands": 1|2, "mode": "one_hand"|"two_hand"}
  Sequence mode: {"landmarks": [...3780 floats...],       "mode": "sequence"}

Output (stdout): JSON {
  "sign":       "card_not_working",
  "label":      "card_not_working",
  "phrase":     "My card is not working",
  "confidence": 0.87,
  "handUsed":   "sequence"|"one"|"two",
  "source":     "ml_sequence"|"ml"
}
"""

import sys
import json
import os
import numpy as np
import joblib

MODEL_DIR    = os.path.join(os.path.dirname(__file__), 'model')
SEQUENCE_LEN = 30
N_FEATURES   = 126   # 21 landmarks × 3 × 2 hands

# ── Phrase labels for the sequence model ──────────────────────
LABEL_TO_PHRASE: dict[str, str] = {
    'account_forgot_password': 'I forgot my password',
    'account_locked':          'My account is locked',
    'account_mobile_fail':     'I cannot access mobile banking',
    'account_suspended':       'My account was suspended',
    'card_blocked':            'My card was blocked',
    'card_lost':               'I lost my card',
    'card_not_working':        'My card is not working',
    'card_pin_fail':           'My card PIN is not working',
    'card_stolen':             'My card was stolen',
    'fraud_hacked':            'My account was hacked',
    'fraud_money_stolen':      'Someone stole my money',
    'fraud_scammed':           'I was scammed',
    'fraud_unauthorised':      'Unauthorised transaction on my account',
    'greet_dont_understand':   'I do not understand',
    'greet_finished':          'I am finished',
    'greet_hello':             'Hello',
}


# ── Loaders ───────────────────────────────────────────────────
def load_static(tag: str):
    model  = joblib.load(os.path.join(MODEL_DIR, f'bsl_classifier_{tag}.pkl'))
    le     = joblib.load(os.path.join(MODEL_DIR, f'label_encoder_{tag}.pkl'))
    scaler = joblib.load(os.path.join(MODEL_DIR, f'scaler_{tag}.pkl'))
    return model, le, scaler


def load_sequence():
    model  = joblib.load(os.path.join(MODEL_DIR, 'asl_sequence_classifier.pkl'))
    le     = joblib.load(os.path.join(MODEL_DIR, 'asl_sequence_label_encoder.pkl'))
    scaler = joblib.load(os.path.join(MODEL_DIR, 'asl_sequence_scaler.pkl'))
    return model, le, scaler


# ── Static single-frame prediction (existing) ─────────────────
def label_to_phrase_static(label: str) -> str:
    parts      = label.split(' - ')
    sign_name  = parts[0].strip()
    sign_value = parts[1].strip() if len(parts) > 1 else sign_name
    return sign_value if sign_value.isdigit() else sign_name


def predict_static(landmarks: list, num_hands: int) -> dict:
    tag      = 'one_hand' if num_hands == 1 else 'two_hand'
    expected = 63 if num_hands == 1 else 126
    if len(landmarks) != expected:
        return {'error': f'Expected {expected} values for {num_hands} hand(s), got {len(landmarks)}'}

    model, le, scaler = load_static(tag)
    X        = np.array(landmarks, dtype=np.float32).reshape(1, -1)
    X_scaled = scaler.transform(X)
    proba    = model.predict_proba(X_scaled)[0]
    idx      = int(np.argmax(proba))
    label    = le.inverse_transform([idx])[0]

    return {
        'sign':       label.split(' - ')[0].strip(),
        'label':      label,
        'phrase':     label_to_phrase_static(label),
        'confidence': round(float(proba[idx]), 4),
        'handUsed':   'one' if num_hands == 1 else 'two',
        'source':     'ml',
    }


# ── Wrist-relative normalisation ─────────────────────────────
def normalize_frame(row: np.ndarray) -> np.ndarray:
    """
    For each hand in a 126-float frame, translate so wrist = origin and
    scale by wrist→ring-finger-MCP distance.  Position/scale invariant.
    """
    row = row.copy()
    for offset in (0, 63):          # left hand @ 0, right hand @ 63
        wx, wy, wz = row[offset], row[offset + 1], row[offset + 2]
        if wx == 0.0 and wy == 0.0: # hand absent — leave zeros
            continue
        # ring finger MCP = landmark 13 → byte offset 39
        dx = row[offset + 39] - wx
        dy = row[offset + 40] - wy
        dz = row[offset + 41] - wz
        scale = max(float(np.sqrt(dx*dx + dy*dy + dz*dz)), 1e-6)
        for i in range(21):
            row[offset + i*3]     = (row[offset + i*3]     - wx) / scale
            row[offset + i*3 + 1] = (row[offset + i*3 + 1] - wy) / scale
            row[offset + i*3 + 2] = (row[offset + i*3 + 2] - wz) / scale
    return row


def normalize_sequence(flat: np.ndarray) -> np.ndarray:
    seq = flat.reshape(SEQUENCE_LEN, N_FEATURES)
    return np.array([normalize_frame(row) for row in seq], dtype=np.float32).flatten()


# ── Sequence phrase prediction (new) ─────────────────────────
def predict_sequence(landmarks: list) -> dict:
    expected = SEQUENCE_LEN * N_FEATURES
    if len(landmarks) != expected:
        return {'error': f'Expected {expected} values for sequence, got {len(landmarks)}'}

    seq_model_path = os.path.join(MODEL_DIR, 'asl_sequence_classifier.pkl')
    if not os.path.exists(seq_model_path):
        return {'error': 'Sequence model not found — run train_video_model.py first'}

    model, le, scaler = load_sequence()
    raw      = np.array(landmarks, dtype=np.float32)
    X        = normalize_sequence(raw).reshape(1, -1)
    X_scaled = scaler.transform(X)
    proba    = model.predict_proba(X_scaled)[0]
    idx      = int(np.argmax(proba))
    label    = str(le.inverse_transform([idx])[0])
    phrase   = LABEL_TO_PHRASE.get(label, label.replace('_', ' '))

    return {
        'sign':       label,
        'label':      label,
        'phrase':     phrase,
        'confidence': round(float(proba[idx]), 4),
        'handUsed':   'sequence',
        'source':     'ml_sequence',
    }


# ── Entry point ───────────────────────────────────────────────
if __name__ == '__main__':
    try:
        payload   = json.loads(sys.stdin.read())
        landmarks = payload.get('landmarks', [])
        mode      = payload.get('mode', 'one_hand')   # 'one_hand' | 'two_hand' | 'sequence'
        num_hands = int(payload.get('num_hands', 1))

        if mode == 'sequence':
            result = predict_sequence(landmarks)
        else:
            result = predict_static(landmarks, num_hands)

        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)
