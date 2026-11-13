"""Train the Classifai churn SVM and save it where the back end looks for it.

    python train_svm.py path/to/WA_Fn-UseC_-Telco-Customer-Churn.csv

Needs a CSV with the public Telco churn columns (customerID, gender, SeniorCitizen, Partner, Dependents, tenure,
PhoneService, MultipleLines, InternetService, OnlineSecurity, OnlineBackup, DeviceProtection, TechSupport, StreamingTV,
StreamingMovies, Contract, PaperlessBilling, PaymentMethod, MonthlyCharges, TotalCharges, Churn).
Writes model/churn_svm.joblib and prints the numbers to copy into src/lib/modelInfo.js.
"""
import sys
import warnings
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.inspection import permutation_importance
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import GridSearchCV, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC

warnings.filterwarnings("ignore")
HERE = Path(__file__).parent

if len(sys.argv) < 2:
    sys.exit("Usage: python train_svm.py path/to/churn.csv")

df = pd.read_csv(sys.argv[1])
df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce").fillna(0)   # blank for brand-new customers
y = (df.pop("Churn").astype(str).str.strip().str.lower() == "yes").astype(int)
df = df.drop(columns=["customerID"], errors="ignore")

numeric = ["tenure", "MonthlyCharges", "TotalCharges", "SeniorCitizen"]
categorical = [c for c in df.columns if c not in numeric]

pre = ColumnTransformer([
    ("num", StandardScaler(), numeric),                                    # an SVM measures distances: scale every number
    ("cat", OneHotEncoder(handle_unknown="ignore"), categorical),
])
pipe = Pipeline([("prep", pre), ("svm", SVC(kernel="rbf", probability=True, class_weight="balanced", random_state=42))])

X_train, X_test, y_train, y_test = train_test_split(df, y, test_size=0.2, stratify=y, random_state=42)

print("Searching C and gamma (a few minutes)...")
search = GridSearchCV(pipe, {"svm__C": [0.5, 1, 2, 5], "svm__gamma": ["scale", 0.01, 0.03]}, scoring="roc_auc", cv=3, n_jobs=-1)
search.fit(X_train, y_train)
model = search.best_estimator_
print("Best settings:", search.best_params_)

pred = model.predict(X_test)
proba = model.predict_proba(X_test)[:, 1]
print(f"\nAccuracy  {accuracy_score(y_test, pred) * 100:.1f} %")
print(f"Precision {precision_score(y_test, pred) * 100:.1f} %")
print(f"Recall    {recall_score(y_test, pred) * 100:.1f} %")
print(f"ROC-AUC   {roc_auc_score(y_test, proba):.2f}")
print(f"Support vectors: {model.named_steps['svm'].n_support_.sum()}   Records: {len(df)}   Attributes: {df.shape[1]}")

print("\nPermutation importance (copy the top ones into FEATURES in src/lib/modelInfo.js):")
imp = permutation_importance(model, X_test, y_test, scoring="roc_auc", n_repeats=5, random_state=42, n_jobs=-1)
for name, v in sorted(zip(df.columns, imp.importances_mean), key=lambda t: -t[1])[:8]:
    print(f"  {name:18s} {v:.3f}")

out = HERE / "model" / "churn_svm.joblib"
out.parent.mkdir(exist_ok=True)
joblib.dump(model, out)
print(f"\nSaved {out}. Restart python app.py to use it.")
