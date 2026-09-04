const WORDS: Record<string, string> = {
  ali: "علی",
  ahmed: "احمد",
  ahmad: "احمد",
  muhammad: "محمد",
  mohammad: "محمد",
  mohammed: "محمد",
  farhan: "فرحان",
  khan: "خان",
  sons: "سنز",
  brothers: "برادرز",
  ms: "ایم ایس",
  ss: "ایس ایس",
  gi: "جی آئی",
  steel: "اسٹیل",
  iron: "آئرن",
  metal: "میٹل",
  metals: "میٹلز",
  mill: "مل",
  mills: "ملز",
  trader: "ٹریڈر",
  traders: "ٹریڈرز",
  trading: "ٹریڈنگ",
  industry: "انڈسٹری",
  industries: "انڈسٹریز",
  company: "کمپنی",
  enterprise: "انٹرپرائز",
  enterprises: "انٹرپرائزز",
  sheet: "شیٹ",
  sheets: "شیٹس",
  pipe: "پائپ",
  pipes: "پائپس",
  coil: "کوائل",
  coils: "کوائلز",
  bar: "بار",
  bars: "بارز",
  rod: "راڈ",
  rods: "راڈز",
  scrap: "اسکریپ",
  plate: "پلیٹ",
  plates: "پلیٹس",
  angle: "اینگل",
  angles: "اینگلز",
  channel: "چینل",
  channels: "چینلز",
  customer: "کسٹمر",
  supplier: "سپلائر",
  transport: "ٹرانسپورٹ",
  transporter: "ٹرانسپورٹر",
  loading: "لوڈنگ",
  unloading: "ان لوڈنگ",
  cutting: "کٹنگ",
  labour: "لیبر",
  labor: "لیبر",
  handling: "ہینڈلنگ",
  freight: "فریٹ",
  charge: "چارج",
  charges: "چارجز",
  warehouse: "گودام",
  godown: "گودام",
  kilogram: "کلوگرام",
  kilograms: "کلوگرام",
  kg: "کلوگرام",
  ton: "ٹن",
  tons: "ٹن",
  piece: "عدد",
  pieces: "عدد",
  pcs: "عدد",
};

const REPLACEMENTS: Array<[string, string]> = [
  ["sh", "ش"], ["ch", "چ"], ["kh", "خ"], ["gh", "غ"],
  ["ph", "ف"], ["th", "تھ"], ["dh", "دھ"], ["zh", "ژ"],
  ["aa", "ا"], ["ee", "ی"], ["oo", "و"], ["ou", "اؤ"],
  ["ai", "ائی"], ["ay", "ے"],
  ["a", "ا"], ["b", "ب"], ["c", "ک"], ["d", "د"],
  ["e", "ے"], ["f", "ف"], ["g", "گ"], ["h", "ہ"],
  ["i", "ی"], ["j", "ج"], ["k", "ک"], ["l", "ل"],
  ["m", "م"], ["n", "ن"], ["o", "و"], ["p", "پ"],
  ["q", "ق"], ["r", "ر"], ["s", "س"], ["t", "ت"],
  ["u", "و"], ["v", "و"], ["w", "و"], ["x", "کس"],
  ["y", "ی"], ["z", "ز"],
];

export function toUrduName(value: string): string {
  const input = value.trim();
  if (!input) return "";
  if (/[\u0600-\u06FF]/.test(input)) return input;

  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (WORDS[word]) return WORDS[word];
      let out = word;
      for (const [latin, urdu] of REPLACEMENTS) out = out.split(latin).join(urdu);
      return out;
    })
    .join(" ");
}
