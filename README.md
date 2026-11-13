# Classifai

**Customer churn prediction.** Classifai shows which customers are about to leave, how much revenue is at risk, and why, so a company can act before they go. A friendly assistant called **Pandu** answers questions about the customers, by text and by voice.

Final-year BCA project at Shree Vedha College.

## Screenshots

<img width="1440" height="900" alt="classifai-3-model" src="https://github.com/user-attachments/assets/70ecf9e6-dc3c-4e0c-99d5-fdbc7bb6a6ac" />
<img width="1440" height="900" alt="classifai-4-pandu" src="https://github.com/user-attachments/assets/8721805a-3bd1-43ef-b7e8-0fa0dd6b2a67" />
<img width="1440" height="900" alt="classifai-1-customers" src="https://github.com/user-attachments/assets/5b7b353d-3700-43d8-8112-1d671f02e673" />


## What it does

- **Customers:** add customers by hand, import a CSV file, search by ID or name, and open a profile with the churn risk and the reasons behind it.
- **Dashboard:** expected churn, revenue at risk (in rupees), a 12-month churn forecast, and the customers most likely to leave.
- **Model:** shows how the Support Vector Machine separates customers who stay from those who leave, with the accuracy numbers.
- **Pandu AI:** answers questions about your customers with no internet needed. With an optional Gemini key it can also answer general questions.
- **Secure sign-in:** passwords are hashed with scrypt, and each account sees only its own customers.

## The model

| Item | Value |
| --- | --- |
| Algorithm | Support Vector Machine, RBF kernel (C = 1.0, gamma = 0.01) |
| Data | IBM Telco Customer Churn, 7,043 customers, 19 attributes |
| Split | 80% train, 20% test |
| Accuracy | 70.8% |
| Recall | 81.6% (tuned to catch most customers who leave) |
| Precision | 47.1% |
| ROC-AUC | 0.83 |

## Built with

- **Machine learning:** Python, scikit-learn (SVM, pipeline, GridSearchCV)
- **Back end:** Flask, SQLite
- **Front end:** React, Vite
- **AI assistant:** Pandu (built-in rule-based brain, optional Google Gemini)

## Run it on your computer

You need Python 3.10 or newer and Node.js 18 or newer.

**1. Back end** (first terminal)

```
cd backend
pip install -r requirements.txt
copy .env.example .env
python app.py
```

The server runs at http://127.0.0.1:8000. The `.env` file is optional; add a Gemini key there only if you want Pandu to answer general questions.

**2. Front end** (second terminal)

```
cd frontend
npm install
npm run dev
```

Open http://localhost:5173, create an account and click **Try with sample data**, or import the Telco CSV from `backend/data`.

## Project layout

```
backend/    Flask server, trained model, training script
frontend/   React website
```

## Team

- **Mohammed Maaz** (Creator): trained the SVM model, built the website and Pandu AI
- **Kashifulla Khan** (Co-partner): idea, testing and presentation
- **Bhaskar Rao A** (Co-partner): idea, testing and presentation

## Notes

The model is trained on a public telecom dataset, so scores for another business are a starting point, not a verdict. Never commit your `.env` file or the database; both are in `.gitignore`.
