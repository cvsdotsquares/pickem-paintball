import type Stripe from "stripe";

/**
 * Feature bullets for a Stripe Product: marketing_features first, then
 * metadata keys named features, features_1, features_2, … (sorted).
 */
export function productFeaturesFromStripe(product: Stripe.Product): string[] {
  let features: string[] = [];
  if (product.marketing_features && product.marketing_features.length > 0) {
    features = product.marketing_features
      .map((f) => f.name)
      .filter((name): name is string => Boolean(name));
  }
  if (features.length === 0 && product.metadata) {
    features = Object.keys(product.metadata)
      .filter((key) => key.startsWith("features"))
      .sort()
      .map((key) => product.metadata[key])
      .filter(Boolean);
  }
  return features;
}
