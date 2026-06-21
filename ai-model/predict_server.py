"""
predict_server.py — persistent prediction server.

Loads the model ONCE at startup, then reads one JSON payload per line
from stdin and writes one JSON result per line to stdout.
Next.js spawns this process once and reuses it for all predictions.
"""

import sys
import json
import os
import numpy as np
import joblib

MODEL_DIR    = os.path.join(os.path.dirname(__file__), 'model')
SEQUENCE_LEN = 30
N_FEATURES   = 126

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


def normalize_frame(row: np.ndarray) -> np.ndarray:
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


def predict(payload: dict, model, le, scaler) -> dict:
    landmarks = payload.get('landmarks', [])
    expected  = SEQUENCE_LEN * N_FEATURES
    if len(landmarks) != expected:
        return {'error': f'Expected {expected} values, got {len(landmarks)}'}

    raw      = np.array(landmarks, dtype=np.float32)
    seq      = raw.reshape(SEQUENCE_LEN, N_FEATURES)
    norm     = np.array([normalize_frame(seq[i]) for i in range(SEQUENCE_LEN)], dtype=np.float32).flatten()
    X        = scaler.transform(norm.reshape(1, -1))
    proba    = model.predict_proba(X)[0]
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


def main():
    seq_path = os.path.join(MODEL_DIR, 'asl_sequence_classifier.pkl')
    if not os.path.exists(seq_path):
        sys.stdout.write(json.dumps({'error': 'Model not found — run Retrain first'}) + '\n')
        sys.stdout.flush()
        sys.exit(1)

    model  = joblib.load(seq_path)
    le     = joblib.load(os.path.join(MODEL_DIR, 'asl_sequence_label_encoder.pkl'))
    scaler = joblib.load(os.path.join(MODEL_DIR, 'asl_sequence_scaler.pkl'))

    # Signal ready
    sys.stdout.write('ready\n')
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
            result  = predict(payload, model, le, scaler)
        except Exception as e:
            result = {'error': str(e)}

        sys.stdout.write(json.dumps(result) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
