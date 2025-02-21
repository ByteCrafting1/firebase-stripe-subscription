# Firebase Functions for Subscription with Stripe

This repository contains the Cloud Functions for Firebase for the Subscription with Stripe project. It includes functions for handling user authentication, Stripe subscriptions, and more.

## Project Setup

### Prerequisites

- **Node.js**: Ensure you have Node.js version 16 installed, as specified in the `package.json`.
- **Firebase CLI**: Install the Firebase CLI globally if you haven't already:

  ```bash
  npm install -g firebase-tools
  ```

- **Service Account Key**: You need a Firebase service account key for admin operations. Place it in the `functions` directory and update the path in your scripts if necessary.

### Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/superdp1/firebase-stripe-subscription
   cd firebase-stripe-subscription/functions
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Set up environment variables**:

   Create a `.env` file in the `functions` directory with the following content:

   ```plaintext
   STRIPE_TEST_KEY=your_stripe_test_key
   STRIPE_SECRET_KEY=your_stripe_secret_key
   STRIPE_TEST_WEBHOOK_SECRET=your_stripe_test_webhook_secret
   STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
   ```

   Replace the placeholders with your actual Stripe keys.

### Running Locally

To run the functions locally using the Firebase Emulator Suite:

1. **Start the emulators**:

   ```bash
   firebase emulators:start
   ```

   This will start the functions emulator on `http://localhost:5001`.

### Deployment

To deploy the functions to Firebase:

```bash
firebase deploy --only functions
```

This will deploy the functions to the Firebase project specified in your `firebase.json`.
