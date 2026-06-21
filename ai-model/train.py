import os
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import joblib

DATA_DIR  = os.path.join(os.path.dirname(__file__), 'data')
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'model')
os.makedirs(MODEL_DIR, exist_ok=True)


def load_dataset(path):
    # CSVs have no header row — the first row is real data, so use header=None
    df = pd.read_csv(path, header=None)
    X = df.iloc[:, :-1].values.astype(np.float32)
    y = df.iloc[:, -1].values.astype(str)
    return X, y


def train_and_evaluate(name, X, y, rf_params, knn_params):
    print(f"\n{'='*60}")
    print(f"  Training: {name}")
    print(f"  Samples : {X.shape[0]}  |  Features: {X.shape[1]}")
    print(f"  Classes : {sorted(set(y))}")
    print(f"{'='*60}")

    le = LabelEncoder()
    y_enc = le.fit_transform(y)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y_enc, test_size=0.2, random_state=42, stratify=y_enc
    )

    print(f"\n[RF]  Training Random Forest (n_estimators={rf_params['n_estimators']}, max_depth={rf_params['max_depth']})...")
    rf = RandomForestClassifier(**rf_params)
    rf.fit(X_train, y_train)
    rf_acc = accuracy_score(y_test, rf.predict(X_test))
    print(f"[RF]  Test accuracy: {rf_acc*100:.2f}%")

    print(f"\n[KNN] Training KNN (n_neighbors={knn_params['n_neighbors']})...")
    knn = KNeighborsClassifier(**knn_params)
    knn.fit(X_train, y_train)
    knn_acc = accuracy_score(y_test, knn.predict(X_test))
    print(f"[KNN] Test accuracy: {knn_acc*100:.2f}%")

    best_model  = rf  if rf_acc >= knn_acc else knn
    best_name   = 'Random Forest' if rf_acc >= knn_acc else 'KNN'
    best_acc    = max(rf_acc, knn_acc)

    print(f"\n[WIN] Better model: {best_name} ({best_acc*100:.2f}%)")
    print(f"\n[RF]  Classification report:\n")
    print(classification_report(y_test, rf.predict(X_test), target_names=le.classes_))

    return best_model, le, scaler, best_acc, best_name


def save_artifacts(tag, model, le, scaler):
    joblib.dump(model,  os.path.join(MODEL_DIR, f'bsl_classifier_{tag}.pkl'))
    joblib.dump(le,     os.path.join(MODEL_DIR, f'label_encoder_{tag}.pkl'))
    joblib.dump(scaler, os.path.join(MODEL_DIR, f'scaler_{tag}.pkl'))
    print(f"[SAVE] Saved {tag} model, label encoder, and scaler to {MODEL_DIR}/")


def main():
    rf_params  = {'n_estimators': 200, 'max_depth': 20, 'random_state': 42, 'n_jobs': -1}
    knn_params = {'n_neighbors': 5}

    print("\nLoading one-hand dataset...")
    X1, y1 = load_dataset(os.path.join(DATA_DIR, 'one_hand_dataset.csv'))

    print("Loading two-hand dataset...")
    X2, y2 = load_dataset(os.path.join(DATA_DIR, 'two_hand_dataset.csv'))

    model1, le1, sc1, acc1, name1 = train_and_evaluate(
        'ONE-HAND (numbers 0-9 + letter C)', X1, y1, rf_params, knn_params
    )
    save_artifacts('one_hand', model1, le1, sc1)

    model2, le2, sc2, acc2, name2 = train_and_evaluate(
        'TWO-HAND (BSL alphabet letters)', X2, y2, rf_params, knn_params
    )
    save_artifacts('two_hand', model2, le2, sc2)

    print(f"\n{'='*60}")
    print("  TRAINING SUMMARY")
    print(f"{'='*60}")
    print(f"  One-hand model  : {name1}  —  {acc1*100:.2f}% accuracy")
    print(f"  Supported signs : {sorted(set(y1))}")
    print(f"  Two-hand model  : {name2}  —  {acc2*100:.2f}% accuracy")
    print(f"  Supported signs : {sorted(set(y2))}")
    print(f"{'='*60}")
    print(f"\n  Total BSL signs supported: {len(set(y1)) + len(set(y2))}")
    print(f"  Models saved to: {MODEL_DIR}")
    print()


if __name__ == '__main__':
    main()
