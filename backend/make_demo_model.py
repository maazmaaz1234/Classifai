"""Builds a STAND-IN SVM so the whole app works end to end before you plug in your own model.

    python make_demo_model.py

It trains an RBF support vector machine on synthetic, Telco-style customers and saves it to model/churn_svm.joblib.
Replace that file with your own pipeline (joblib.dump(your_pipeline, "model/churn_svm.joblib")) and nothing else changes,
as long as the column names match what toModelRow() in src/lib/predict.js sends.
"""
from pathlib import Path

import warnings

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC

warnings.filterwarnings("ignore", category=FutureWarning)   # newer scikit-learn prefers CalibratedClassifierCV; either works here
rng = np.random.default_rng(7)
N = 2600

contract = rng.choice(["Month-to-month", "One year", "Two year"], N, p=[0.55, 0.21, 0.24])
internet = rng.choice(["Fiber optic", "DSL", "No"], N, p=[0.44, 0.34, 0.22])
tenure = np.where(contract == "Month-to-month", rng.integers(1, 40, N), rng.integers(6, 73, N))
payment = rng.choice(["Electronic check", "Mailed check", "Bank transfer (automatic)", "Credit card (automatic)"], N, p=[0.34, 0.23, 0.22, 0.21])
net = internet != "No"


def addon(p):
    return np.where(net, np.where(rng.random(N) < p, "Yes", "No"), "No internet service")


df = pd.DataFrame({
    "gender": rng.choice(["Male", "Female"], N),
    "SeniorCitizen": (rng.random(N) < 0.16).astype(int),
    "Partner": rng.choice(["Yes", "No"], N),
    "Dependents": rng.choice(["Yes", "No"], N, p=[0.3, 0.7]),
    "tenure": tenure,
    "PhoneService": rng.choice(["Yes", "No"], N, p=[0.9, 0.1]),
    "MultipleLines": rng.choice(["Yes", "No"], N),
    "InternetService": internet,
    "OnlineSecurity": addon(0.3),
    "OnlineBackup": addon(0.35),
    "DeviceProtection": addon(0.35),
    "TechSupport": addon(0.3),
    "StreamingTV": addon(0.4),
    "StreamingMovies": addon(0.4),
    "Contract": contract,
    "PaperlessBilling": rng.choice(["Yes", "No"], N, p=[0.6, 0.4]),
    "PaymentMethod": payment,
})
monthly = np.where(internet == "Fiber optic", 72, np.where(internet == "DSL", 48, 22)) + rng.normal(0, 8, N)
df["MonthlyCharges"] = np.clip(monthly, 18.25, 118.75).round(2)
df["TotalCharges"] = (df["MonthlyCharges"] * df["tenure"]).round(2)

z = (
    -1.1
    + 1.25 * (contract == "Month-to-month") - 1.0 * (contract == "Two year")
    + 0.6 * (internet == "Fiber optic")
    - 0.035 * tenure
    + 0.012 * (df["MonthlyCharges"] - 65)
    + 0.45 * (payment == "Electronic check")
    - 0.5 * (df["TechSupport"] == "Yes") - 0.4 * (df["OnlineSecurity"] == "Yes")
    + 0.25 * df["SeniorCitizen"]
    + rng.normal(0, 0.6, N)
)
y = (rng.random(N) < 1 / (1 + np.exp(-z))).astype(int)

numeric = ["tenure", "MonthlyCharges", "TotalCharges", "SeniorCitizen"]
categorical = [c for c in df.columns if c not in numeric]
pipe = Pipeline([
    ("prep", ColumnTransformer([("num", StandardScaler(), numeric), ("cat", OneHotEncoder(handle_unknown="ignore"), categorical)])),
    ("svm", SVC(kernel="rbf", C=1.0, gamma="scale", probability=True, random_state=7)),
])
pipe.fit(df, y)
out = Path(__file__).parent / "model" / "churn_svm.joblib"
out.parent.mkdir(exist_ok=True)
joblib.dump(pipe, out)
print(f"Saved a demo SVM trained on {N} synthetic customers (churn rate {y.mean():.0%}) to {out}")
