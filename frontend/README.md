# Classifai

**Customer churn prediction**: which customers are about to leave, cancel their subscription or stop using the product, and why.
The prediction model is a **Support Vector Machine (SVM)**. The mascot is **Pandu**.

* `src/` is the website (React + Vite). Dark theme only: a ribbon of red, amber and electric-blue light flows behind every page, glass panels lean toward your cursor.
* `backend/` is a small Python (Flask) server that loads your trained SVM and connects **Pandu AI** to Google Gemini.

Created by **Mohammed Maaz** with co-partners **Kashifulla Khan** and **Bhaskar Rao A**.

## Run it

Website:

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Back end (second terminal, from the project folder):

```bash
cd backend
pip install -r requirements.txt
python make_demo_model.py      # ONLY if you do not have your own model yet: makes a stand-in SVM
cp .env.example .env           # then open .env and fill it in (see "Pandu AI" below)
python app.py                  # http://127.0.0.1:8000
```

`npm run dev` forwards everything under `/api` to that server (see `vite.config.js`). The website also works **without** the back end: customers are then scored by a rule-based demo scorer and Pandu answers from your data only. Pandu's chat header tells you which mode you are in (green dot = Gemini connected).

**On your phone (same Wi-Fi):** stop `npm run dev` and run `npm run dev:phone` instead. It serves the site over **https**, which a phone needs before it will let a page use the microphone (the voice call). Open the `Network` address Vite prints (`https://192.168.x.x:5173`). The first time the phone says the connection is not private: tap **Advanced**, then **Proceed**. Over plain `http://` the phone blocks the microphone without asking, and Pandu tells you so.

To show it to someone else while you develop: `cloudflared tunnel --url http://localhost:5173` (already allowed in `vite.config.js`).

## Pages

| Page | What it does |
|------|--------------|
| **Sign in** | Create an account (name, email, password, optional profile picture) or sign in. Each account keeps its own customers. |
| **Home** | Headline, Pandu, and what the product does. Pandu waves, follows your cursor and flies up into the **Ask Pandu** pill when you move on. |
| **Customers** | *Add customer* (name, customer ID, optional photo, contact details, subscription start, plan and bill), *Import CSV*, *Total customers* and *At-risk customers* (each opens a 3D card carousel). Click any card to open that customer's own page: picture, every detail, **Open analytics**, **Edit** and **Remove** (both ask for your password). Search by name or customer ID inside the window. |
| **Dashboard** | Pick a segment (contract, internet plan, time with us, payment method) or one customer. Signals (expected churn, revenue at risk, likely to churn), what drives churn, a 12-month forecast (total or by segment) and **Churn cases** with Top 5 / 10 / more. Tap a name to see the reasons behind their score. |
| **Model** | How the SVM works, with a map you can play with (drag a customer and watch the street, the margin and the support vectors), the four-step pipeline, accuracy / precision / recall / ROC-AUC and permutation importance. |
| **Support** | Questions to ask Pandu (including "Who developed Classifai?"), an FAQ and contact cards. |

The round profile button at the top left opens **Settings** (name, profile picture, password) and **Log out**.

Customers without a photo get one of 22 friendly avatars (`public/avatars/a01…a22.webp`): male customers are offered the male people and the animals, female customers the female people and the animals, and anyone else all 22. The list is in `src/lib/avatars.js`.

## Pandu AI

Click **Ask Pandu** (or any suggestion). Pandu answers in two layers:

1. **Your data, instantly, with no key.** `src/lib/pandu-brain.js` answers from the customers saved in the account, so the numbers are always live: "Analyse the churn prediction", "Who is most likely to leave?", "Tell me about Rohan Desai" (or a customer ID), "Which contract has the highest risk?", "How much revenue is at risk?", "How can we reduce churn?", "What is the forecast?", plus how the SVM, the kernel, support vectors and the metrics work, the CSV format and privacy.
2. **Google Gemini, for everything else.** General questions ("Who is the Prime Minister of India?"), pictures, PDFs and CSV files you attach, long explanations. Gemini can use Google Search for current facts, and Pandu shows the sources.

Other things the chat does:

* **Drag it** by the grip button (or the header). **Double-click the header**, or press the expand button, for **full screen**; the ribbon then runs around the edges of the screen. `Esc` leaves full screen.
* **Attach** pictures, PDFs and text or CSV files (paperclip, drag-and-drop or paste).
* **Voice call** (phone button): say your question, Pandu answers out loud. Uses the browser's own speech recognition and voices (best in Chrome and Edge, nothing to install).
* **"Who developed Classifai?"** shows a card with the team's photos and details. Edit the text in `src/lib/developers.js`.

### Connecting Gemini

The key lives **only on the server**. The website never sees it.

1. Create a free key at <https://aistudio.google.com/apikey>.
2. In `backend/`, copy `.env.example` to `.env` and set `GEMINI_API_KEY=your-key` (no quotes).
3. Restart `python app.py`. The chat header turns green: "Gemini · gemini-3.8-flash".

Never paste the key into the chat or commit `.env`. (If a message looks like a key, Pandu refuses to send it anywhere.) Other settings in `.env`: `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `GEMINI_GROUNDING` (1 = allow Google Search).

## Connecting your trained SVM

The website asks your server for a churn probability for every customer that is added or imported:

```
POST /api/predict
body:  { "customers": [ { "tenure": 12, "Contract": "Month-to-month", "MonthlyCharges": 79.5, ... }, ... ] }
reply: { "predictions": [ { "probability": 0.62, "decision": 0.41, "reasons": [...] }, ... ] }   # same order
```

1. Save your trained scikit-learn **Pipeline** (scaling and encoding included) with `joblib.dump(pipeline, "churn_svm.joblib")` and put it at `backend/model/churn_svm.joblib`. The pipeline must be able to give probabilities (`SVC(probability=True)`).
2. **Make the columns match.** The names the website sends come from `toModelRow()` in `src/lib/predict.js` (they are the public *Telco churn* names: `tenure`, `Contract`, `InternetService`, `MonthlyCharges`, `TotalCharges`, ...). **Edit that one function** so they match the columns *your* SVM was trained on. Columns your model was not trained on can be dropped with `DROP_COLUMNS` in `backend/.env`.
3. `POSITIVE_CLASS` in `.env` says which label means "churned" if your classes are text (for example `Yes`).
4. `reasons` are optional. The server adds a simple explanation from the model; if the list is missing the website explains the score with its own rules.

Until a server answers, a rule-based **demo scorer** (`scoreLocal` in `src/lib/predict.js`) is used and the customer page says "demo estimate" instead of "from the model". `backend/model/churn_svm.joblib` that ships with the project is only a **stand-in** made by `make_demo_model.py`: replace it with your own.

For a deployed server set `VITE_API_URL` (for example `https://my-server.example.com/api`) before `npm run build`, and `CORS_ORIGIN` in `backend/.env`.

## Before you present: put your real numbers in

`src/lib/modelInfo.js` holds the facts shown on the **Model** page and quoted by Pandu: records, attributes, kernel, C, gamma, support vectors, accuracy / precision / recall / ROC-AUC and the permutation importances. They are **placeholders**. Replace them with the results from your training notebook and the page and the chat both update.

Currency is `CURRENCY` in `src/lib/format.js` (rupees, `₹`, with Indian digit grouping).

## CSV import

Customers page → **Import CSV**. Columns that work (the Telco churn names do too):

`customerID, name, gender, dateOfBirth, subscriptionStart (or tenure in months), phone, email, address, idNumber, SeniorCitizen, Partner, Dependents, PhoneService, MultipleLines, InternetService, OnlineSecurity, OnlineBackup, DeviceProtection, TechSupport, StreamingTV, StreamingMovies, Contract, PaperlessBilling, PaymentMethod, MonthlyCharges, TotalCharges`

A 40-customer sample is at `public/sample-customers.csv` (also on the Support page). A `Churn` column is ignored: the model works that out itself. An empty Dashboard also has **Try with sample data**.

## Accounts and database

Accounts and customers are stored in a real **SQLite database**, `backend/classifai.db`, which is created by itself the first time `python app.py` runs (SQLite is part of Python: nothing to install, nothing to pay). The code is `backend/accounts.py`, hooked into `app.py` with `init_accounts(app)`.

* **Passwords** are hashed (scrypt, random salt) on the server. The real password is never saved.
* After sign-in the browser keeps a random token in an **HttpOnly cookie** (scripts on the page cannot read it); the database stores only a hash of it. Log out deletes it. Sessions last 30 days.
* Six wrong passwords for one email lock it for five minutes.
* Each account only ever sees its own customers. `/api/predict` and `/api/pandu` need a signed-in session.
* Passwords need at least 8 characters.

Back up or reset: stop the server and copy or delete `backend/classifai.db`. For a deployed site, serve it over **https** (the cookie then becomes `Secure` automatically) and keep `classifai.db` out of git.

## How it is built (and why it stays fast)

* **Background** (`src/components/Background.jsx`): one WebGL canvas. Hair-thin strands and sparks are drawn as ribbons whose curve is computed on the graphics card, so the main thread does almost nothing per frame. Each page has its own route for the ribbon (`SCENES`), and windows, the customer page, sign-in and the full-screen chat each have another (`OVERRIDES`). If a computer cannot run WebGL it falls back to a soft coloured glow.
* **Tilt** (`src/lib/tilt.js`): one pointer listener sets a few CSS variables; the browser does the 3D lean and the moving highlight. Nothing runs while the cursor is away.
* **Scroll**: cards fly in with a CSS scroll-driven animation, which runs off the main thread. There is deliberately no backdrop blur: it would be redrawn every frame under the moving ribbon.
* Animations respect the system "reduce motion" setting.

## Where things live

```
src/App.jsx                      page shell, page tracking, docking logic
src/App.css pages.css            shared glass kit, Home and Support layouts
src/customers.css dashboard.css  Customers and Dashboard pages
src/extras.css svm.css           Model page, FAQ and contact cards, the SVM map
src/components.css auth.css      windows, customer page, avatar picker, sign-in
src/chat.css                     Pandu AI chat: popup, full screen, call, developers card
src/components/Background.jsx    the ribbon of light (SCENES = one route per page)
src/components/ChatWindow.jsx    the chat;  DeveloperCard.jsx = the team card
src/components/Pandu.jsx         the mascot;  PanduFlight.jsx = the fly-to-pill animation
src/components/CustomerPage.jsx  one customer: details, analytics, edit / remove
src/pages/                       Home, Customers, Dashboard, Model, Support
src/lib/pandu-brain.js           what Pandu knows + the call to /api/pandu
src/lib/predict.js               toModelRow(), back-end call, demo scorer, suggested actions
src/lib/modelInfo.js             the Model page numbers (replace with your own)
src/lib/developers.js            the team card text and birth dates
src/lib/voice.js                 speech recognition and speaking for the voice call
src/lib/store.js analytics.js    saved customers, forecast and segment maths
src/lib/auth.js api.js           sign-in calls to the server; the small fetch helper
src/lib/tilt.js                  the cursor tilt
public/avatars/                  the 22 default avatars
public/team/                     the three developer photos
public/sample-customers.csv      40 example customers
backend/app.py                   /api/predict and /api/pandu
backend/accounts.py              database, sign-in and customer routes (SQLite)
backend/make_demo_model.py       builds a stand-in SVM (replace with your own)
```
