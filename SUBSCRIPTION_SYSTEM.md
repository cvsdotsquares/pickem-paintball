# Subscription System Implementation

## ✅ Components Created

### 1. Context
- **SubscriptionContext** (`src/contexts/SubscriptionContext.tsx`)
  - Manages subscription state globally
  - Checks user subscription status from Firestore
  - Provides `showModal()` and `hideModal()` functions

### 2. Components
- **SubscriptionModal** (`src/components/Subscription/SubscriptionModal.tsx`)
  - 3 modal types: passive, soft-gate, hard-gate
  - Shows 3 subscription plans (Monthly, Quarterly, Yearly)
  - Integrates with Stripe checkout

- **SupportButton** (`src/components/Subscription/SupportButton.tsx`)
  - For top menu
  - Shows "Support Pick'Em" or "Subscriber - Thank You"

- **DashboardSupportWidget** (`src/components/Subscription/DashboardSupportWidget.tsx`)
  - For dashboard dead space
  - Shows support CTA or thank you message

- **SubscriptionModalManager** (`src/components/Subscription/SubscriptionModalManager.tsx`)
  - Global modal manager
  - Listens for custom events to show modals

### 3. API Routes
- **Stripe Checkout** (`src/app/api/stripe/create-checkout/route.ts`)
  - Creates Stripe checkout session
  - TODO: Add actual Stripe integration

- **User Subscription** (`src/app/api/users/[userId]/subscription/route.ts`)
  - Checks user subscription status

## 📍 Integration Points

### 1. Top Menu (Modal 1 - Passive)
```tsx
import SupportButton from '@/src/components/Subscription/SupportButton';

// In your header/nav component
<SupportButton />
```

### 2. Dashboard (Modal 1 - Passive)
```tsx
import DashboardSupportWidget from '@/src/components/Subscription/DashboardSupportWidget';

// Desktop: In sidebar or dead space
<DashboardSupportWidget />

// Mobile: At top of dashboard
<div className="md:hidden">
  <DashboardSupportWidget />
</div>
```

### 3. Save Picks Button (Modal 2 - Soft Gate)
```tsx
import { useSubscription } from '@/src/contexts/SubscriptionContext';

const { showModal } = useSubscription();

<button onClick={() => {
  showModal('soft-gate');
}}>
  Save Picks
</button>
```

### 4. Create League (Modal 3 - Hard Gate)
Already integrated in `CreateLeagueModal.tsx`
- Checks subscription before creating league
- Shows hard-gate modal if not subscribed

### 5. App Layout
Add to your root layout:
```tsx
import { SubscriptionProvider } from '@/src/contexts/SubscriptionContext';
import SubscriptionModalManager from '@/src/components/Subscription/SubscriptionModalManager';

<SubscriptionProvider>
  {children}
  <SubscriptionModalManager />
</SubscriptionProvider>
```

## 🎨 Modal Types

### Modal 1 (Passive)
- **When**: Top menu, Dashboard support button
- **Can Close**: Yes (Maybe Later button)
- **Continue Free**: No

### Modal 2 (Soft Gate)
- **When**: Save Picks button
- **Can Close**: Yes
- **Continue Free**: Yes (Continue for Free button)

### Modal 3 (Hard Gate)
- **When**: Create League
- **Can Close**: Yes (X button only)
- **Continue Free**: No

## 💳 Subscription Plans

1. **Monthly** - $4.99/month
2. **Quarterly** - $12.99/3 months (Save 13%)
3. **Yearly** - $44.99/year (Save 25%) - Most Popular

## 🔧 Firestore Structure

```
users/{userId}
  - isSubscribed: boolean
  - subscriptionTier: 'monthly' | 'quarterly' | 'yearly' | null
```

## ⚙️ TODO

1. **Stripe Integration**
   - Add Stripe secret key to `.env.local`
   - Update price IDs in `create-checkout/route.ts`
   - Implement webhook for subscription updates

2. **Images**
   - Add `/logo.png` for modal header
   - Add `/support-pickem.png` for passive modal
   - Add `/save-picks.png` for soft-gate modal
   - Add `/premium-feature.png` for hard-gate modal

3. **Copy Updates**
   - Update modal descriptions as needed
   - Customize feature lists per plan
