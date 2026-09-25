export interface MechanicInfo {
  id: string;
  name: string;
  /** one line for cards */
  blurb: string;
  /** rules card bullets */
  rules: string[];
  hue: number;
}

export const MECHANICS: Record<string, MechanicInfo> = {
  classic: {
    id: "classic",
    name: "Classic",
    blurb: "Pour until every color sits in its own bottle.",
    rules: [
      "Pour onto the same color or into an empty bottle.",
      "The whole top layer of one color pours at once — as much as fits.",
      "A finished bottle gets a cork.",
    ],
    hue: 210,
  },
  hidden: {
    id: "hidden",
    name: "Hidden layers",
    blurb: "A “?” hides a color until that layer reaches the top.",
    rules: [
      "A cloudy layer with a “?” is a color you can't see yet.",
      "It shows up as soon as it's on top.",
      "Pour so you uncover the layers you need before you run out of room.",
    ],
    hue: 250,
  },
  flask: {
    id: "flask",
    name: "Mini flask",
    blurb: "A small flask for 2 portions: half a spare bottle.",
    rules: ["The flask holds 2 portions of any color.", "It's temporary storage: it has to be empty by the end of the level."],
    hue: 275,
  },
  jar: {
    id: "jar",
    name: "Jar",
    blurb: "A jar for 8 portions of one color. Nothing pours out of it.",
    rules: [
      "The jar holds 8 portions and takes only the color on its label.",
      "A jar with a rainbow “?” drop takes any color — the first one poured in becomes its color.",
      "You can't pour out of a jar: it's storage, not a spare bottle.",
    ],
    hue: 190,
  },
  locks: {
    id: "locks",
    name: "Locks",
    blurb: "A chained bottle opens when you complete the lock's color.",
    rules: [
      "You can't pour into or out of a locked bottle.",
      "The lock opens when a bottle of its color is completed (or an order of that color is served).",
      "An empty locked bottle is a reward: opening it gives you room.",
    ],
    hue: 45,
  },
  valve: {
    id: "valve",
    name: "Valve",
    blurb: "A bottle with a tap pours from the bottom — a queue, not a stack.",
    rules: [
      "A valve bottle pours its BOTTOM layer.",
      "You pour into it from the top as usual.",
      "It doesn't tilt: it moves over the target and opens the tap.",
    ],
    hue: 350,
  },
  orders: {
    id: "orders",
    name: "Orders",
    blurb: "Fill the order cups with their colors. The queue is shown on top.",
    rules: [
      "Each cup wants one color — it's tinted and stands on a colored base.",
      "A full cup leaves and the next order arrives.",
      "Serve every order; you don't need to sort the bottles.",
    ],
    hue: 32,
  },
  mix: {
    id: "mix",
    name: "Mix",
    blurb: "Two or three mechanics in one level.",
    rules: ["Mechanics combined: a jar with locks, a valve with hidden layers, a flask with a valve…"],
    hue: 160,
  },
};

export interface TierInfo {
  name: string;
  short: string;
  color: string;
  ink: string;
}

export const TIERS: TierInfo[] = [
  { name: "Easy", short: "Easy", color: "#3ddc84", ink: "#05361c" },
  { name: "Medium", short: "Medium", color: "#46b8ff", ink: "#04263d" },
  { name: "Hard", short: "Hard", color: "#ffa227", ink: "#3d2200" },
  { name: "Very hard", short: "Very hard", color: "#ff4f73", ink: "#3d0613" },
];
