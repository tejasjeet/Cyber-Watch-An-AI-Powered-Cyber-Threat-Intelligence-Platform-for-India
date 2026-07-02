import { useState } from "react";
import {
  Smartphone,
  CreditCard,
  Landmark,
  Briefcase,
  TrendingUp,
  MailWarning,
  ShoppingBag,
  UserX,
  MessageSquareWarning,
  ShieldAlert,
  HelpCircle,
} from "lucide-react";

function InstagramIcon({ size, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5.5" />
      <rect x="7.2" y="7.2" width="9.6" height="9.6" rx="2.8" />
      <circle cx="12" cy="12" r="2.6" />
      <circle cx="17.1" cy="6.9" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Custom logos in client/public/icons/categories/ */
const CUSTOM_ICON_FILES = {
  "upi-fraud": "upi.png",
  "whatsapp-scam": "whatsapp.png",
  "facebook-scam": "facebook.png",
};

const LUCIDE_ICONS = {
  "card-fraud": CreditCard,
  "internet-banking": Landmark,
  "fake-job": Briefcase,
  "investment-scam": TrendingUp,
  "email-phishing": MailWarning,
  "fake-shopping": ShoppingBag,
  "identity-theft": UserX,
  "cyber-bullying": MessageSquareWarning,
  sextortion: ShieldAlert,
  other: HelpCircle,
};

function CustomCategoryImage({ categoryId, className, size }) {
  const file = CUSTOM_ICON_FILES[categoryId];
  const [useFallback, setUseFallback] = useState(false);
  const src = `/icons/categories/${file}`;

  if (!file || useFallback) {
    const LucideIcon = LUCIDE_ICONS[categoryId] || Smartphone;
    return <LucideIcon className={className} size={size} strokeWidth={1.75} aria-hidden="true" />;
  }

  return (
    <>
      <img src={src} alt="" aria-hidden="true" onError={() => setUseFallback(true)} hidden />
      <span
        className={`${className} ccr-category-icon-mask`}
        style={{ width: size, height: size, WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` }}
        aria-hidden="true"
      />
    </>
  );
}

export default function FraudCategoryIcon({ categoryId, className = "", size = 22 }) {
  const iconClass = `ccr-category-icon ${className}`.trim();

  if (categoryId === "instagram-hacked") {
    return <InstagramIcon size={size} className={iconClass} />;
  }

  if (CUSTOM_ICON_FILES[categoryId]) {
    return <CustomCategoryImage categoryId={categoryId} className={iconClass} size={size} />;
  }

  const LucideIcon = LUCIDE_ICONS[categoryId] || Smartphone;
  return <LucideIcon className={iconClass} size={size} strokeWidth={1.75} aria-hidden="true" />;
}
