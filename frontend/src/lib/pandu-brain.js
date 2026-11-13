// Pandu AI's brain.
//
// Two layers:
//  1. THE LOCAL BRAIN (this file): answers from the customers saved in this account right now (so numbers are always live)
//     and from what he knows about the SVM, the CSV format and the app. It works offline, with no key and no server.
//  2. GEMINI (optional): for everything else (general questions like "who is the Prime Minister of India?", pictures,
//     PDFs, long explanations) the chat asks your Python back end:   POST {API}/pandu   → Gemini.
//     The Gemini key lives only in backend/.env (GEMINI_API_KEY). It is never in the browser.
import { getData } from "./store";
import { money, pct, plural, riskTier, tenureText, tierLabel } from "./format";
import { ACTIONS, expectedChurnMonth, featuresOf, reasonsFor, revenueAtRisk } from "./predict";
import { DIMENSIONS, expectedLeavers, summary, tierCounts, topDrivers } from "./analytics";
import { FEATURES, METRICS, MODEL } from "./modelInfo";
import { DEVELOPERS, DEVELOPER_SUMMARY } from "./developers";
import { parseCSV } from "./csv";

const API = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) || "/api";

export const SUGGESTIONS = ["Analyse the churn prediction", "Who is most likely to leave?", "How does the SVM decide?", "Who developed Classifai?"];

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15 };
const norm = (t) => t.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9%.\s-]/g, " ").replace(/\s+/g, " ").trim();
const has = (q, re) => re.test(q);

function countIn(q, fallback) {
  const d = q.match(/\b(\d{1,2})\b/);
  if (d) return Math.min(15, Math.max(1, Number(d[1])));
  for (const [w, n] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${w}\\b`).test(q)) return n;
  return fallback;
}

const keyIn = (q, key) => new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es|ed|ing)?\\b`).test(q);
const ranked = (list) => [...list].sort((a, b) => b.risk - a.risk);
const EMPTY = "There are no customers yet. Open the Customers page and add some by hand or import a CSV, or press Try with sample data on the Dashboard. After that I can tell you who is likely to leave and why.";

// Segment words people use → [dimension, value]
const SEGMENT_WORDS = [
  [/month[ -]?to[ -]?month|monthly (contract|plan)|no contract/, "contract", "Month-to-month"],
  [/\b(one|1)[ -]?year\b|annual (contract|plan)/, "contract", "One year"],
  [/\b(two|2)[ -]?year\b/, "contract", "Two year"],
  [/fib(er|re)/, "internet", "Fiber optic"],
  [/\bdsl\b/, "internet", "DSL"],
  [/(no|without) internet|phone[ -]only/, "internet", "No"],
  [/electronic check|e-?check/, "payment", "Electronic check"],
  [/mailed check/, "payment", "Mailed check"],
  [/bank transfer/, "payment", "Bank transfer (automatic)"],
  [/credit card/, "payment", "Credit card (automatic)"],
  [/new customers?|under (a|1|one) year|first year/, "tenure", "Under 1 year"],
  [/(long[ -]?time|loyal|4\+ years|four years)/, "tenure", "4+ years"],
];

const groupLine = (list, dim) => {
  const d = DIMENSIONS[dim];
  const groups = d.values.map((v) => {
    const g = list.filter((c) => d.of(c) === v);
    return { v, n: g.length, avg: g.length ? g.reduce((s, c) => s + c.risk, 0) / g.length : 0 };
  }).filter((g) => g.n);
  return groups.sort((a, b) => b.avg - a.avg).map((g) => ({ ...g, name: d.valueLabel ? d.valueLabel(g.v) : g.v }));
};

// ── what Pandu knows without any data ────────────────────────────────────────────────────────
const KNOWLEDGE = [
  {
    topic: "svm",
    keys: ["svm", "support vector", "how does it work", "how do you predict", "how is it predicted", "how are predictions", "how the model works", "how does the model work", "how does the model decide", "how does it decide", "how does it predict", "algorithm", "how does the svm"],
    text: `The model is a Support Vector Machine. Picture every past customer as a dot on a huge map: one colour for people who stayed, another for people who left. The SVM draws the widest possible street between the two groups. The dots that sit right on the edge of that street are the support vectors, and they are the only ones that decide where it runs.\n\nA new customer is placed on the same map. Which side of the street they land on, and how far from it, becomes the churn probability. Close to the line means "unsure"; far away means "confident". The Model page lets you drag a dot and watch it happen.`,
    follow: ["What is the kernel?", "What are support vectors?", "Which factors matter most?"],
  },
  {
    topic: "kernel",
    keys: ["kernel", "rbf", "gamma", "linear kernel", "non linear", "nonlinear", "curved", "hyperplane"],
    text: `Real customers rarely split along a straight line. The ${MODEL.kernel} kernel lets the SVM bend the boundary around the data, so a short-tenure customer with a big bill and a long-tenure customer with the same bill can land on different sides.\n\nTwo settings shape it: C (${MODEL.C}) is how strict the street is about mistakes, and gamma (${MODEL.gamma}) is how tightly the boundary hugs the data. On the Model page, switch between the Linear and RBF kernel to see the difference.`,
    follow: ["What are support vectors?", "How does the SVM decide?"],
  },
  {
    topic: "sv",
    keys: ["support vectors", "margin", "decision boundary", "boundary", "decision score", "decision function"],
    text: `Support vectors are the customers closest to the boundary: the hard cases that are almost as likely to stay as to leave. This model keeps ${MODEL.supportVectors.toLocaleString()} of its ${MODEL.records.toLocaleString()} training customers as support vectors.\n\nThe decision score on a customer's analytics is their signed distance from the boundary: positive means the churn side, negative means the stay side. The bigger the number, the surer the model is.`,
    follow: ["What is the kernel?", "How does the SVM decide?"],
  },
  {
    topic: "accuracy",
    keys: ["accuracy", "accurate", "precision", "recall", "roc", "auc", "f1", "how good", "how well", "metrics", "performance", "reliable", "trust", "how correct", "can i trust"],
    text: `On the held-out test set the model reaches about ${METRICS[0][1]}% accuracy, ${METRICS[1][1]}% precision, ${METRICS[2][1]}% recall and a ROC-AUC of ${METRICS[3][1]}.\n\nPrecision tells you how many customers flagged as leaving really do leave. Recall tells you how many of the real leavers were caught. Treat a score as a reason to look after a customer, not a verdict.`,
    follow: ["How does the SVM decide?", "Which factors matter most?"],
  },
  {
    topic: "features",
    keys: ["feature", "factor", "important", "importance", "inputs", "columns the model", "what does the model look at", "what matters", "variables", "permutation"],
    text: `The factors that move the SVM's score most, biggest first:\n\n${FEATURES.slice(0, 5).map(([n, v], i) => `${i + 1}. ${n}: ${Math.round(v * 100)}%`).join("\n")}\n\nAn RBF SVM has no built-in importances, so these are permutation importances: shuffle one column and see how much the score gets worse. The Model page draws them all as bars.`,
    follow: ["How does the SVM decide?", "Analyse the churn prediction"],
  },
  {
    topic: "churn",
    keys: ["what is churn", "churn mean", "define churn", "meaning of churn", "what does churn", "customer churn"],
    text: "Churn is when a customer leaves: they cancel the subscription, or simply stop using the product. Classifai predicts it early so you can talk to the right customers, with the right offer, before they go.",
    follow: ["Who is most likely to leave?", "How can we reduce churn?"],
  },
  {
    topic: "csv",
    keys: ["csv", "upload", "import", "bulk", "spreadsheet", "excel", "file format", "columns", "template", "sample file", "sample data"],
    text: "On the Customers page choose Import CSV. These columns work (the Telco churn names do too):\n\ncustomerID, name, gender, dateOfBirth, subscriptionStart (or tenure in months), phone, email, address, SeniorCitizen, Partner, Dependents, PhoneService, MultipleLines, InternetService, OnlineSecurity, OnlineBackup, DeviceProtection, TechSupport, StreamingTV, StreamingMovies, Contract, PaperlessBilling, PaymentMethod, MonthlyCharges, TotalCharges.\n\nA 40-customer sample file is on the Support page, and an empty Dashboard has a Try with sample data button. A Churn column in your file is ignored, because the model works that out itself.",
    follow: ["How do I add a customer?", "Is my data stored anywhere?"],
  },
  {
    topic: "add",
    keys: ["add customer", "new customer", "add a customer", "create customer", "add people", "add a person"],
    text: "Open the Customers page and choose Add customer. Give a name, an optional photo, contact details (phone, email, address), when the subscription started, and the plan and bill. If you skip the photo, a friendly avatar is chosen for you. Each customer is scored the moment they are saved.",
    follow: ["How do I import a CSV?", "Analyse the churn prediction"],
  },
  {
    topic: "edit",
    keys: ["edit customer", "change customer", "remove customer", "delete customer", "update customer", "password", "photo", "picture", "avatar", "profile picture"],
    text: "Click any customer card in Total customers to open their own page: picture, every detail, and an Open analytics button. Edit details and Remove both ask for your account password first, so nobody can change your data by accident. Your own picture, name and password can be changed from the round profile button at the top left.",
    follow: ["How do I add a customer?", "Is my data stored anywhere?"],
  },
  {
    topic: "privacy",
    keys: ["stored", "privacy", "private", "safe", "secure", "security", "my data", "where is", "remove my data"],
    text: "Your customers are saved in the Classifai database on your own server, under your own account, and no other account can see them. Passwords are stored only as a scrambled hash, never in plain form. The only things that leave your server are, if you ask me a question that needs it, the text of that question to the AI service connected to your back end.",
    follow: ["How do I add a customer?", "How does the SVM decide?"],
  },
  {
    topic: "dashboard",
    keys: ["dashboard", "churn cases", "select segment", "what can i see", "churn forecast graph"],
    text: "The Dashboard is where the predictions live. Pick a segment (contract, internet plan, time with us, payment method), or one customer for their own journey. You get three signal rows (expected churn, revenue at risk, likely to churn), what drives churn, a 12-month forecast you can split by segment, and the Churn cases list with Top 5, 10 and more. Tap a name to see the reasons behind their score.",
    follow: ["Who is most likely to leave?", "Analyse the churn prediction"],
  },
  {
    topic: "pages",
    keys: ["model page", "support page", "what pages", "navigation", "menu", "dock", "pages are there"],
    text: "There are five pages: Home, Customers (add, import, browse), Dashboard (predictions and forecast), Model (how the SVM works, with a map you can play with) and Support (answers and contacts). The dock at the bottom moves between them.",
    follow: ["What is on the Dashboard?", "How does the SVM decide?"],
  },
  {
    topic: "voice",
    keys: ["voice", "call", "speak", "talk to you", "microphone", "mic", "can you hear"],
    text: "Yes! Press the phone button at the top of this chat to start a voice call. Say your question out loud and I will answer out loud. It works in Chrome and Edge (they have speech recognition built in). Press the red button to hang up.",
    follow: SUGGESTIONS,
  },
  {
    topic: "gemini",
    keys: ["gemini", "api key", "connect ai", "general questions", "can you search", "internet access", "browse"],
    text: "For questions beyond churn (general knowledge, today's news, pictures or PDFs you attach) I connect to Google Gemini through the project's Python back end. The key goes in backend/.env as GEMINI_API_KEY, never in the website, and the README has the three-line setup. Without it I still answer everything about your customers, the SVM and the app.",
    follow: SUGGESTIONS,
  },
];

const IDENTITY =
  "I'm Pandu AI, the panda assistant of Classifai. I can analyse your customer churn predictions, name who is most likely to leave and why, compare segments, look customers up by name or ID, and explain the SVM. With my Gemini connection I can also answer general questions, read pictures and PDFs you attach, and talk with you on a voice call.";

// ── answering ────────────────────────────────────────────────────────────────────────────────
function reasonsLine(c) {
  const rs = reasonsFor(c).filter((r) => typeof r.impact === "number");
  const up = rs.filter((r) => r.impact > 0).sort((a, b) => b.impact - a.impact).slice(0, 3);
  const down = rs.filter((r) => r.impact < 0).sort((a, b) => a.impact - b.impact).slice(0, 2);
  let out = "";
  if (up.length) out += `Pushing the risk up: ${up.map((r) => (r.label || "").toLowerCase()).join(", ")}.`;
  if (down.length) out += `${out ? "\n" : ""}Helping them stay: ${down.map((r) => (r.label || "").toLowerCase()).join(", ")}.`;
  return out;
}

function describePerson(c) {
  const f = featuresOf(c);
  const tier = riskTier(c.risk);
  const up = reasonsFor(c).filter((r) => r.impact > 0).sort((a, b) => b.impact - a.impact)[0];
  let out = `${c.name} (${c.customerId}) has been a customer for ${tenureText(c.joined)} on a ${f.contract.toLowerCase()} plan, paying ${money(f.monthly, 2)} a month${f.internet === "No" ? "" : ` for ${f.internet} internet`}.\n\nChance of churning in the next 12 months: ${pct(c.risk)}, so ${tierLabel[tier].toLowerCase()}.`;
  if (c.risk >= 0.3) out += ` Expected around month ${expectedChurnMonth(c.risk)}, with ${money(revenueAtRisk(c))} of revenue at risk.`;
  const why = reasonsLine(c);
  if (why) out += `\n\n${why}`;
  if (up && ACTIONS[up.key] && tier !== "low") out += `\n\nA good first step: ${ACTIONS[up.key]}`;
  return out;
}

function findPeople(q, customers) {
  const byId = customers.filter((c) => c.customerId && q.includes(c.customerId.toLowerCase()));
  if (byId.length) return byId.slice(0, 5);
  const exact = customers.filter((c) => q.includes(norm(c.name)));
  if (exact.length) return exact.slice(0, 5);
  // A name that is only PART of a customer's name must not hijack general questions ("Shahrukh Khan" is not "Yash Khan").
  // First names count in a short question; a surname alone counts only when the question is clearly about customers.
  const words = q.split(" ");
  const aboutCustomers = /customers?|clients?|accounts?|subscribers?|churn|risk|plan|contract|leave|leaving|stay|bill|tenure/.test(q);
  const short = words.length <= 6;
  const byPart = customers.filter((c) => {
    const parts = norm(c.name).split(" ");
    return parts.some((p) => p.length >= 4 && words.includes(p) && (aboutCustomers || (short && p === parts[0])));
  });
  return byPart.length && byPart.length <= 4 ? byPart : [];
}

const DEV_ASK = /\b(who|whom)\b.*\b(develop(ed|er|ers)?|made|makes?|built|builds?|created?|designed|invented|behind|owns?|owner|programmed|coded|trained)\b|\b(developers?|creators?|co-?partners?)\b|\byour (makers?|creators?|team|developers?)\b|\bteam behind\b|\b(meet|about) the (team|developers)\b/;

function developerReply(q) {
  const focus = DEVELOPERS.find((d) => q.includes(norm(d.short)) || q.includes(norm(d.name)))?.id || "maaz";
  return {
    text: DEVELOPER_SUMMARY,
    topic: "developers",
    follow: ["Tell me more about Maaz", "How does the SVM decide?", "Analyse the churn prediction"],
    card: { type: "developers", focus },
    matched: true,
  };
}

// matched = true when a specific rule answered it (so the chat can skip the language model for speed)
function answerLocal(text, lastTopic) {
  const { customers } = getData();
  const q = norm(text);
  const empty = customers.length === 0;
  const reply = (t, topic = "", follow, matched = true) => ({ text: t, topic, follow: follow || SUGGESTIONS, matched });

  // small talk
  if (/^(hi|hii+|hello|hey|yo|hola|namaste|good (morning|afternoon|evening))\b/.test(q) && q.split(" ").length <= 4) {
    return reply("Hii! I'm Pandu AI. Ask me who is likely to leave, how the model works, or anything else on your mind.");
  }
  if (/^(thanks|thank you|thx|ty|great|nice|cool|awesome|perfect|ok|okay)\b/.test(q) && q.split(" ").length <= 4) {
    return reply("Happy to help! Anything else you want to look at?", "", ["Analyse the churn prediction", "Who is most likely to leave?"]);
  }
  if (/^(bye|goodbye|see you|cya)\b/.test(q)) return reply("See you soon! I'll be up here whenever you need me.");

  // who built it / who are you
  if (has(q, DEV_ASK) || has(q, /^tell me more about (maaz|mohammed|kashif|bhaskar)/) || has(q, /^who is (maaz|mohammed maaz|kashif|kashifulla|bhaskar)/)) return developerReply(q);
  if (has(q, /who are you|what are you|your name|what can you do|are you (an )?ai|are you real|introduce yourself|about yourself|what do you do|^help$/)) return reply(IDENTITY, "who", SUGGESTIONS);

  // follow-ups on the last thing we talked about
  if (/^(why|why\??|how come|tell me more|more|explain( that| this| it)?|go on|and)$/.test(q) && lastTopic) {
    if (lastTopic === "top" && !empty) return reply(`Taking the top name. ${describePerson(ranked(customers)[0])}`, "person", ["Analyse the churn prediction", "How can we reduce churn?"]);
    if (lastTopic === "analysis" && !empty) return answerLocal("what are the main reasons customers leave", "");
    if (lastTopic === "svm") return answerLocal("which factors matter most", "");
    if (lastTopic === "developers") return developerReply("maaz");
  }

  // a customer by name or ID
  if (!empty) {
    const people = findPeople(q, customers);
    if (people.length === 1) return reply(describePerson(people[0]), "person", ["Who is most likely to leave?", "How can we reduce churn?"]);
    if (people.length > 1) {
      return reply(`I found ${people.length} customers that match:\n\n${people.map((c, i) => `${i + 1}. ${c.name} (${c.customerId}): ${pct(c.risk)}`).join("\n")}\n\nAsk with the full name or the customer ID and I'll go into detail.`, "person");
    }
  }

  // a segment ("month-to-month customers", "fiber optic")
  if (!empty) {
    const hit = SEGMENT_WORDS.find(([re]) => re.test(q));
    const aboutBase = has(q, /customers?|subscribers?|accounts?|clients?|segment|group|churn|risk|people|plan/) || q.split(" ").length <= 3;
    if (hit && aboutBase && !has(q, /which|compare|rank|by contract|by payment|by internet/)) {
      const [, dim, value] = hit;
      const list = customers.filter((c) => DIMENSIONS[dim].of(c) === value);
      if (!list.length) return reply(`None of your customers are in that group (${value}).`);
      const s = summary(list);
      const top = ranked(list)[0];
      const label = DIMENSIONS[dim].valueLabel ? DIMENSIONS[dim].valueLabel(value) : value;
      return reply(`${label}: ${plural(list.length, "customer")} with an average churn risk of ${pct(s.avg)}. ${s.high.length} (${pct(s.high.length / list.length)}) are likely to churn, putting ${money(s.atRisk)} a year at risk.\n\nHighest risk there: ${top.name} (${top.customerId}) at ${pct(top.risk)}.`, "segment", ["Who is most likely to leave?", "How can we reduce churn?"]);
    }
  }

  // comparisons between segments
  const dimAsked = has(q, /contract/) ? "contract" : has(q, /payment|pay by|paying/) ? "payment" : has(q, /internet|fib(er|re)|dsl|plan/) ? "internet" : has(q, /tenure|how long|time with|loyal/) ? "tenure" : null;
  const aboutChurn = has(q, /churn|risk|leave|leaving|cancel|customers?|segments?|subscribers?/);
  if (aboutChurn && (has(q, /(which|what|compare|rank|by).*(contract|payment|internet|segment|tenure|group)/) || /compare my segments/.test(q) || (dimAsked && has(q, /highest|lowest|safest|riskiest|most|least|worst|best/)))) {
    if (empty) return reply(EMPTY);
    const dim = dimAsked || "contract";
    const g = groupLine(customers, dim);
    const low = has(q, /lowest|safest|least|stable|best/);
    const list = low ? [...g].reverse() : g;
    return reply(`${low ? "Safest" : "Riskiest"} ${DIMENSIONS[dim].label.toLowerCase()} groups by average churn risk:\n\n${list.slice(0, 5).map((x, i) => `${i + 1}. ${x.name}: ${pct(x.avg)} (${plural(x.n, "customer")})`).join("\n")}`, "compare", ["Who is most likely to leave?", "How can we reduce churn?"]);
  }

  // counts
  if (has(q, /how many (customers|people|accounts|subscribers|clients)/) || has(q, /(number|count|total) of (customers|people|accounts)/)) {
    if (empty) return reply(EMPTY);
    const t = tierCounts(customers);
    return reply(`You have ${plural(customers.length, "customer")}: ${t.high} likely to churn, ${t.medium} at risk and ${t.low} likely to stay.`, "count", ["Who is most likely to leave?", "What is the forecast?"]);
  }
  if ((has(q, /how many/) && has(q, /churn|cancel|at risk|high risk/)) || has(q, /how many (customers|accounts|subscribers|clients).*(leave|leaving|likely|quit|go)/)) {
    if (empty) return reply(EMPTY);
    const s = summary(customers);
    const mid = customers.filter((c) => c.risk >= 0.3 && c.risk < 0.5).length;
    return reply(`${plural(s.high.length, "customer")} (${pct(s.high.length / s.n)}) look likely to churn in the next 12 months, and ${mid} more are at risk. In total I expect about ${Math.round(s.expected)} cancellations.`, "count", ["Who is most likely to leave?", "What is the forecast?"]);
  }

  // money
  if (has(q, /revenue|money|income|mrr|worth|lose|losing/) && has(q, /risk|churn|leave|leaving|customers?|\bour\b|\bmy\b|\bwe\b|exposed|stake|business|company/)) {
    if (empty) return reply(EMPTY);
    const s = summary(customers);
    const top = ranked(customers).slice(0, 3);
    return reply(`Your customers pay about ${money(s.revenue)} a year. Weighted by each customer's chance of leaving, ${money(s.atRisk)} (${pct(s.atRisk / Math.max(1, s.revenue))}) of that is at risk.\n\nBiggest single exposures:\n${[...customers].sort((a, b) => revenueAtRisk(b) - revenueAtRisk(a)).slice(0, 3).map((c, i) => `${i + 1}. ${c.name}: ${money(revenueAtRisk(c))}`).join("\n")}${top.length ? "\n\nSaving even a few of these accounts pays for a lot of retention effort." : ""}`, "money", ["Who is most likely to leave?", "How can we reduce churn?"]);
  }

  // forecast
  if (has(q, /forecast|next (12|twelve) months|next year|expected (to leave|leavers|exits|churn)/) && !has(q, /weather|rain|temperature|stock|share price|election|cricket|match|score|gold|petrol|inflation/)) {
    if (empty) return reply(EMPTY);
    const arr = expectedLeavers(customers, 12);
    const s = summary(customers);
    return reply(`Looking ahead: about ${Math.round(arr[3])} customers are expected to churn within 3 months, ${Math.round(arr[6])} within 6 months and ${Math.round(arr[12])} within 12 months. That is ${pct(arr[12] / s.n)} of ${s.n.toLocaleString()} customers.\n\nThe Dashboard draws this as the Churn forecast graph, and can split it by contract, internet plan, time with us or payment method.`, "forecast", ["Who is most likely to leave?", "Which contract has the highest risk?"]);
  }

  // average / overall
  if (has(q, /average risk|overall risk|how risky|how safe|risk level/)) {
    if (empty) return reply(EMPTY);
    const s = summary(customers);
    return reply(`The average chance of churning is ${pct(s.avg)} across ${plural(s.n, "customer")}, and ${plural(s.high.length, "customer is", "customers are")} above 50%.`, "analysis");
  }

  // top N at risk
  if ((has(q, /\b(who|which|top|names?|list|most|highest|riskiest|biggest|call first|contact first|first)\b/) && has(q, /churn|leave|leaving|at risk|high risk|highest risk|riskiest|cancel|quit|priorit|call first|contact first|save first/)) || has(q, /^(top|first) \d+ (customers|at risk|risky|churn)/)) {
    if (empty) return reply("I need customer data first. Add some customers, then ask me again.");
    const n = countIn(q, 5);
    const top = ranked(customers).slice(0, n);
    const callFirst = has(q, /call|contact|first|priorit|save/);
    const list = callFirst ? [...customers].filter((c) => c.risk >= 0.3).sort((a, b) => revenueAtRisk(b) - revenueAtRisk(a)).slice(0, n) : top;
    return reply(`${callFirst ? `Start with these ${list.length === 1 ? "customer" : `${list.length} customers`}: high chance of leaving and the most revenue at stake.` : `The ${top.length === 1 ? "customer" : `${top.length} customers`} with the highest chance of churning:`}\n\n${list.map((c, i) => `${i + 1}. ${c.name} (${c.customerId}), ${featuresOf(c).contract.toLowerCase()}: ${pct(c.risk)}${callFirst ? `, ${money(revenueAtRisk(c))} at risk` : ""}`).join("\n")}\n\nOpen the Dashboard and tap a name under Churn cases to see the reasons.`, "top", ["Why?", "How can we reduce churn?", "Analyse the churn prediction"]);
  }

  // reasons / drivers
  if (has(q, /why (do|are|did) (customers|clients|subscribers)/) || has(q, /what makes (customers|clients|subscribers) (leave|churn|cancel)/) || (has(q, /(main|top|biggest|common) (reasons?|drivers?|causes?)|what (drives|causes)|reasons? (for|why)/) && has(q, /churn|leave|leaving|cancel|customers?|subscribers?|clients?|quit/))) {
    if (empty) return reply("Common drivers are a month-to-month contract, a short time with the service, a high bill, paying by electronic check and having no tech support. Add your customers and I'll tell you which ones matter for your base.", "drivers");
    const d = topDrivers(customers);
    if (!d.drivers.length) return reply("No single reason stands out right now, which is good news.");
    return reply(`Among ${d.label}, the most common reasons are:\n\n${d.drivers.map((x, i) => `${i + 1}. ${x.label} (${Math.round(x.share * 100)}% of them)`).join("\n")}\n\nEach customer's own reasons are on the Dashboard when you open them.`, "drivers", ["How can we reduce churn?", "Who is most likely to leave?"]);
  }

  // what to do about it
  if (has(q, /reduce|prevent|retain|retention|keep (customers|them|clients)|win back|what (should|can|could) (i|we)|how (can|do) (i|we)|advice|suggest|recommend/) && has(q, /churn|leave|leaving|retain|retention|customers?|subscribers?|clients?|cancel/)) {
    if (empty) return reply("Usually it comes down to a few things: move month-to-month customers onto longer plans with a small discount, fix service quality for fibre customers, bundle tech support and online security, offer automatic payment, and welcome new customers well in their first months. Add your data and I'll point at the ones that fit your base.", "advice");
    const d = topDrivers(customers, 3);
    if (!d.drivers.length) return reply("Nobody is at real risk right now. Keep the service reliable, and check back as new customers join.");
    return reply(`Based on what is driving churn in your base:\n\n${d.drivers.map((x, i) => `${i + 1}. ${x.label}: ${ACTIONS[x.key] || "Talk to the customers affected."}`).join("\n")}\n\nStart with the customers at the top of the Churn cases list.`, "advice");
  }

  // overview
  if (has(q, /analy[sz]e (the |my |our )?(churn|customers?|prediction|data|base)|churn (summary|overview|report|analysis|prediction)|(summary|overview|report) of (my|our|the) (customers|churn|data|business)|\binsights?\b|how (is|are) (my|the|our) (customers|business|base)|^(analy[sz]e|summary|overview)$/)) {
    if (empty) return reply(EMPTY, "analysis");
    const s = summary(customers);
    const mid = customers.filter((c) => c.risk >= 0.3 && c.risk < 0.5);
    const d = topDrivers(customers, 3);
    const contracts = groupLine(customers, "contract");
    let out = `Across ${plural(s.n, "customer")}, ${s.high.length} (${pct(s.high.length / s.n)}) look likely to churn in the next 12 months and ${mid.length} more are at risk. About ${money(s.atRisk)} of ${money(s.revenue)} yearly revenue is exposed.`;
    if (d.drivers.length) out += `\n\nMain drivers: ${d.drivers.map((x) => `${x.label.toLowerCase()} (${Math.round(x.share * 100)}%)`).join(", ")}.`;
    if (contracts.length > 1) out += `\n\n${contracts[0].name} contracts are the riskiest, at ${pct(contracts[0].avg)} on average.`;
    return reply(`${out}\n\nOpen the Dashboard and tap Churn cases to see each customer and why.`, "analysis", ["Who is most likely to leave?", "How can we reduce churn?", "What is the forecast?"]);
  }

  // general knowledge about the model and the app: score every entry by how many of its phrases appear
  let best = null;
  let bestScore = 0;
  KNOWLEDGE.forEach((k) => {
    const score = k.keys.reduce((s, key) => (keyIn(q, key) ? s + (key.includes(" ") ? 2 : 1) : s), 0);
    if (score > bestScore) { best = k; bestScore = score; }
  });
  // one stray word ("called", "speak", "menu") inside a long question is not a question about the app: let the AI take it
  if (best && (bestScore >= 2 || q.split(" ").length <= 6)) return reply(best.text, best.topic, best.follow);

  return reply(
    "That one is outside what I can answer on my own. I'm best with your customers, churn and the SVM. For general questions (news, facts, homework, pictures) I need my Gemini connection: add GEMINI_API_KEY to backend/.env and restart the server (the README has the steps). Meanwhile, try one of these:",
    "", ["Analyse the churn prediction", "Who is most likely to leave?", "How does the SVM decide?", "Who developed Classifai?"], false,
  );
}

// ── a short, live description of the account for the language model ────────────────────────
export function buildContext() {
  const { customers } = getData();
  if (!customers.length) return "No customers have been added yet.";
  const s = summary(customers);
  const t = tierCounts(customers);
  const d = topDrivers(customers, 4);
  const line = (c) => `${c.name} (${c.customerId}): ${pct(c.risk)} risk, ${featuresOf(c).contract}, ${featuresOf(c).internet === "No" ? "no internet" : featuresOf(c).internet}, ${money(featuresOf(c).monthly, 2)}/month, ${tenureText(c.joined)} with us`;
  const seg = (dim) => groupLine(customers, dim).map((g) => `${g.name}: ${g.n} customers, average risk ${pct(g.avg)}`).join("; ");
  return [
    `Customers: ${s.n}. Likely to churn (risk 50% or more): ${t.high}. At risk (30-50%): ${t.medium}. Likely to stay: ${t.low}. Average risk ${pct(s.avg)}.`,
    `Yearly revenue ${money(s.revenue)}, of which ${money(s.atRisk)} is at risk. Expected cancellations in 12 months: about ${Math.round(s.expected)}.`,
    `By contract: ${seg("contract")}.`,
    `By internet plan: ${seg("internet")}.`,
    d.drivers.length ? `Main churn drivers: ${d.drivers.map((x) => `${x.label} (${Math.round(x.share * 100)}%)`).join(", ")}.` : "",
    `Highest-risk customers:\n${ranked(customers).slice(0, 10).map((c, i) => `${i + 1}. ${line(c)}`).join("\n")}`,
    `Model: ${MODEL.algorithm}, ${MODEL.kernel} kernel, C=${MODEL.C}, gamma=${MODEL.gamma}; accuracy ${METRICS[0][1]}%, precision ${METRICS[1][1]}%, recall ${METRICS[2][1]}%, ROC-AUC ${METRICS[3][1]}. Top features: ${FEATURES.slice(0, 5).map(([n]) => n).join(", ")}.`,
  ].filter(Boolean).join("\n");
}

// ── Gemini through your back end ─────────────────────────────────────────────────────────────
let statusCache = { at: 0, value: null };
export async function getPanduStatus(force = false) {
  if (!force && statusCache.value && Date.now() - statusCache.at < 20_000) return statusCache.value;
  let value;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${API}/pandu/status`, { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json();
    value = { online: true, gemini: !!data.gemini, model: data.model || "", grounding: !!data.grounding, label: data.label || "" };
  } catch {
    value = { online: false, gemini: false, model: "", grounding: false };
  }
  statusCache = { at: Date.now(), value };
  return value;
}

// false = the usual churn questions are answered instantly from your live data (exact numbers, no AI call).
// true  = when the AI is connected, EVERY question goes to the AI models (smarter wording, slower); the instant answer is the back-up.
const AI_FIRST = false;

const NO_KEY = "I can answer questions about your customers and the SVM on my own, but general questions need my Gemini connection, and it is not set up yet. Add GEMINI_API_KEY to backend/.env, restart the back end, and ask me again.";
const OFFLINE = "I can't reach my AI connection right now. Is the Python back end running (python backend/app.py)? Meanwhile I can still answer anything about your customers, churn and the SVM.";

async function askGemini(question, history, files, voice) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 50_000);
  try {
    const res = await fetch(`${API}/pandu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: buildContext(),
        voice: !!voice,
        messages: [...history.filter((m) => m.text && !m.error), { from: "me", text: question }].slice(-14).map((m) => ({ role: m.from === "me" ? "user" : "assistant", content: m.text })),
        files: files.map(({ name, mime, data }) => ({ name, mime, data })),
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    let data = {};
    try { data = await res.json(); } catch { /* not json */ }
    if (res.ok && typeof data.reply === "string" && data.reply.trim()) return { ok: true, text: data.reply.trim(), grounded: !!data.grounded, sources: data.sources || [], model: data.model };
    return { ok: false, code: data.error || `http_${res.status}`, detail: data.detail || "" };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, code: e.name === "AbortError" ? "timeout" : "offline", detail: "" };
  }
}

// What a CSV / text attachment looks like, for the offline brain.
function describeAttachment(a) {
  if (a.text !== undefined && /csv|tsv/i.test(a.name)) {
    try {
      const { headers: cols, rows } = parseCSV(a.text);
      return `I can see ${a.name}: ${rows.length.toLocaleString()} rows and ${cols.length} columns (${cols.slice(0, 8).join(", ")}${cols.length > 8 ? ", …" : ""}). To score these customers, use Import CSV on the Customers page. To have me read and discuss the file, I need my Gemini connection.`;
    } catch { /* fall through */ }
  }
  return `I can see you attached ${a.name}, but reading ${a.mime?.startsWith("image/") ? "pictures" : "files"} needs my Gemini connection, and it is not set up yet. Add GEMINI_API_KEY to backend/.env and restart the back end.`;
}

// history: [{ from: "me" | "pandu", text }]   files: [{ name, mime, data?(base64), text? }]
// → { text, topic, follow, card?, sources?, grounded?, note? }
export async function askPandu(question, history = [], lastTopic = "", files = [], options = {}) {
  const local = answerLocal(question, lastTopic);
  const attachments = files || [];
  // a specific local rule matched and nothing is attached: answer instantly, offline, from live data
  if (local.matched && attachments.length === 0) {
    if (!AI_FIRST || local.card) return local;
    if (!(await getPanduStatus()).gemini) return local;
  }

  const status = await getPanduStatus();
  if (!status.gemini) {
    if (attachments.length) return { text: describeAttachment(attachments[0]), topic: "", follow: SUGGESTIONS };
    return status.online ? { ...local, text: local.matched ? local.text : NO_KEY, follow: local.follow } : { ...local, text: local.matched ? local.text : OFFLINE };
  }
  const textFiles = attachments.filter((a) => a.text !== undefined).map((a) => `\n\n[Attached file: ${a.name}]\n${a.text}`).join("");
  const r = await askGemini(`${question}${textFiles}`, history, attachments.filter((a) => a.data), options.voice);
  if (r.ok) return { text: r.text, topic: "", follow: local.follow, sources: r.sources, grounded: r.grounded };
  const msg =
    r.code === "bad_key" ? "The AI service rejected the API key in backend/.env. Check that the key is copied correctly."
    : r.code === "rate_limited" ? "The AI service's limit was reached for the moment. Give it a minute and ask again."
    : r.code === "no_key" ? NO_KEY
    : r.code === "timeout" ? "That took too long, so I stopped. Try a shorter question, or ask again."
    : r.code === "offline" ? OFFLINE
    : `My AI connection hit a problem${r.detail ? ` (${r.detail})` : ""}. Try again in a moment.`;
  return { text: local.matched ? local.text : msg, topic: local.topic, follow: local.follow, error: !local.matched };
}

export const panduReply = (text) => answerLocal(text, "").text;
