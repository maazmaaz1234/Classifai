// What the Model page and Pandu say about the SVM (support vector machine).
//
// >>> These are the numbers shown on the Model page. Replace them with the real results from your training
// >>> notebook (accuracy, precision, recall, ROC-AUC, the permutation importances, row counts, C and gamma) before you present.
// Pandu reads this file too, so his answers always match the page.

export const MODEL = {
  algorithm: "Support Vector Machine (SVM)",
  kernel: "RBF",
  C: 1.0,
  gamma: "0.01",
  supportVectors: 3070,
  records: 7043,
  attributes: 19,
  horizonMonths: 12,
};

export const METRICS = [
  ["Accuracy", 70.8, "%"],
  ["Precision", 47.1, "%"],
  ["Recall", 81.6, "%"],
  ["ROC-AUC", 0.83, ""],
];

// How much each feature moves the SVM's score when it is shuffled (permutation importance), biggest first.
// An RBF SVM has no built-in importances like a tree does, so this is the honest way to rank features.
export const FEATURES = [
  ["Contract", 0.57],
  ["tenure", 0.21],
  ["TechSupport", 0.05],
  ["MonthlyCharges", 0.05],
  ["InternetService", 0.04],
  ["OnlineSecurity", 0.04],
  ["TotalCharges", 0.02],
  ["OnlineBackup", 0.02],
];

export const STEPS = [
  ["01", "Collect", `${MODEL.records.toLocaleString()} customer records with ${MODEL.attributes} attributes: contract, tenure, internet plan, add-ons, payment method and monthly charges.`],
  ["02", "Clean and scale", "Fix blank charges, one-hot encode the categories and scale every number, because an SVM measures distances and needs features on the same scale."],
  ["03", "Draw the boundary", `The SVM finds the widest street between customers who stayed and customers who left. With the ${MODEL.kernel} kernel the street can bend around the data (C = ${MODEL.C}, gamma = ${MODEL.gamma}).`],
  ["04", "Score", "A new customer is placed on the map. How far they are from the boundary, and on which side, becomes the churn probability (Platt scaling)."],
];
