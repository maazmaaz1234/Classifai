// The people behind Classifai. Pandu shows this as a card when someone asks "who developed Classifai?".
// Edit the text here and the chat card changes. Photos live in public/team/.
import { ageFromDob } from "./format";

export const DEVELOPERS = [
  {
    id: "maaz",
    name: "Mohammed Maaz",
    short: "Maaz",
    role: "Creator",
    dob: "2006-05-29",
    photo: "/team/maaz.webp",
    studies: "BCA at Shree Vedha College",
    intro:
      "Hi, I'm Maaz. I'm a BCA student at Shree Vedha College, and I like turning an idea into something people can actually use. Classifai is a project close to my heart: I wanted a churn predictor that feels as good as the apps I enjoy using, and that explains itself in plain words.",
    more: [
      "I trained the support vector machine behind the predictions and worked on how Classifai looks and feels, from the glowing ribbon to Pandu himself.",
      "I built it together with my co-partners Kashifulla Khan and Bhaskar Rao A. We wanted any business to see which customers might leave, understand why, and know what to do before it is too late.",
    ],
  },
  {
    id: "kashif",
    name: "Kashifulla Khan",
    short: "Kashif",
    role: "Co-partner",
    dob: "2007-06-08",
    photo: "/team/kashif.webp",
  },
  {
    id: "bhaskar",
    name: "Bhaskar Rao A",
    short: "Bhaskar",
    role: "Co-partner",
    dob: "2005-11-07",
    photo: "/team/bhaskar.webp",
  },
];

export const bornText = (dob) =>
  new Date(`${dob}T00:00:00`).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" });
export const ageOf = (dev) => ageFromDob(dev.dob);

// the line Pandu writes above the card (and reads aloud on a voice call)
export const DEVELOPER_SUMMARY =
  "Classifai was developed by Mohammed Maaz, the creator, together with his co-partners Kashifulla Khan and Bhaskar Rao A. Here they are.";
