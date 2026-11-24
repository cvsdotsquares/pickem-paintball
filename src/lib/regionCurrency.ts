/**
 * Country → the currency we price in (UK £, eurozone €, everyone else $). One rule, shared by the plans route
 * (what the subscribe pop-up shows) and /api/user/region (what our emails quote).
 */
export type PriceCurrency = "gbp" | "eur" | "usd";

const EUROZONE = ["FR", "DE", "IT", "ES", "NL", "BE", "AT", "PT", "IE", "FI", "GR", "CY", "MT", "EE", "LT", "LV", "SI", "SK", "LU"];

export function currencyForRegion(region: string): PriceCurrency {
  if (region === "UK" || region === "GB") return "gbp";
  if (region === "EU" || EUROZONE.includes(region)) return "eur";
  return "usd";
}
