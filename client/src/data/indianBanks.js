/** Major Indian banks for complaint validation (alphabetical). */

export const INDIAN_BANKS = [
  "AU Small Finance Bank",
  "Axis Bank",
  "Bandhan Bank",
  "Bank of Baroda",
  "Bank of India",
  "Bank of Maharashtra",
  "Canara Bank",
  "Central Bank of India",
  "City Union Bank",
  "CSB Bank",
  "DCB Bank",
  "Dhanlaxmi Bank",
  "Federal Bank",
  "HDFC Bank",
  "ICICI Bank",
  "IDBI Bank",
  "IDFC First Bank",
  "Indian Bank",
  "Indian Overseas Bank",
  "IndusInd Bank",
  "Jammu & Kashmir Bank",
  "Karnataka Bank",
  "Karur Vysya Bank",
  "Kotak Mahindra Bank",
  "Punjab & Sind Bank",
  "Punjab National Bank",
  "RBL Bank",
  "South Indian Bank",
  "State Bank of India",
  "Tamilnad Mercantile Bank",
  "UCO Bank",
  "Union Bank of India",
  "Yes Bank",
];

export const BANK_ALIASES = {
  sbi: "State Bank of India",
  pnb: "Punjab National Bank",
  bob: "Bank of Baroda",
  boi: "Bank of India",
  bom: "Bank of Maharashtra",
  hdfc: "HDFC Bank",
  icici: "ICICI Bank",
  axis: "Axis Bank",
  kotak: "Kotak Mahindra Bank",
  yes: "Yes Bank",
  idbi: "IDBI Bank",
  idfc: "IDFC First Bank",
  indusind: "IndusInd Bank",
  rbl: "RBL Bank",
  federal: "Federal Bank",
  canara: "Canara Bank",
  union: "Union Bank of India",
  iob: "Indian Overseas Bank",
  kvb: "Karur Vysya Bank",
  cub: "City Union Bank",
  uco: "UCO Bank",
};

export function resolveBankName(input) {
  const t = String(input ?? "").trim();
  if (!t) return null;
  const lower = t.toLowerCase().replace(/\s+/g, " ");

  if (BANK_ALIASES[lower]) return BANK_ALIASES[lower];

  for (const bank of INDIAN_BANKS) {
    const bankLower = bank.toLowerCase();
    if (bankLower === lower) return bank;
    if (lower.length >= 4 && bankLower.includes(lower)) return bank;
    if (lower.length >= 4 && lower.includes(bankLower)) return bank;
  }

  return null;
}
