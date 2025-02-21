const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Load environment variables when in emulator
if (process.env.FUNCTIONS_EMULATOR) {
  require("dotenv").config();
}

const stripe = require("stripe")(
  process.env.FUNCTIONS_EMULATOR ?
    process.env.STRIPE_TEST_KEY :
    process.env.STRIPE_SECRET_KEY,
);

admin.initializeApp();

// Create a Stripe customer when a new user is created
exports.createStripeCustomer = functions.auth.user().onCreate(async (user) => {
  try {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        firebaseUID: user.uid,
      },
    });

    // Store the customer ID in Firestore
    await admin.firestore().collection("users").doc(user.uid).set({
      stripeCustomerId: customer.id,
      email: user.email,
    }, {merge: true});

    console.log(customer);

    return customer;
    
  } catch (error) {
    console.error("Error creating Stripe customer:", error);
    throw error;
  }
});

exports.createSubscription = functions.https.onCall(async (data, context) => {

  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to subscribe",
    );
  }

  const {priceId} = data;
  const userId = context.auth.uid;

  try {
    // Get the customer ID from Firestore
    const userDoc = await admin.firestore()
        .collection("users")
        .doc(userId)
        .get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
          "not-found",
          "User document not found",
      );
    }

    const {stripeCustomerId} = userDoc.data();

    if (!stripeCustomerId) {
      throw new functions.https.HttpsError(
          "failed-precondition",
          "User has no associated Stripe customer",
      );
    }

    // Create the subscription
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{price: priceId}],
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
    });

    return {
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
    };
  } catch (error) {
    console.error("Error creating subscription:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

exports.createCustomerPortalSession = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to access the customer portal",
    );
  }

  const userId = context.auth.uid;

  try {
    // Get the customer ID from Firestore
    const userDoc = await admin.firestore()
        .collection("users")
        .doc(userId)
        .get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
          "not-found",
          "User document not found",
      );
    }

    const {stripeCustomerId} = userDoc.data();

    if (!stripeCustomerId) {
      throw new functions.https.HttpsError(
          "failed-precondition",
          "No Stripe customer found",
      );
    }

    // Create customer portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: data.returnUrl, // URL to return to after leaving the portal
    });

    return {url: session.url};
  } catch (error) {
    console.error("Error creating customer portal session:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// Handle Stripe webhooks
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.FUNCTIONS_EMULATOR ?
    process.env.STRIPE_TEST_WEBHOOK_SECRET :
    process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        webhookSecret,
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return res.status(400).send("Webhook signature verification failed");
  }
  try {
    let subscription;
    let customerId;
    let userDoc;
    let usersSnapshot;

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        subscription = event.data.object;
        customerId = subscription.customer;

        // Find user with this customer ID
        usersSnapshot = await admin.firestore()
            .collection("users")
            .where("stripeCustomerId", "==", customerId)
            .get();

        if (!usersSnapshot.empty) {
          userDoc = usersSnapshot.docs[0];
          await userDoc.ref.update({
            subscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            priceId: subscription.items.data[0].price.id,
            subscriptionPeriodEnd: admin.firestore.Timestamp.fromMillis(
                subscription.current_period_end * 1000,
            ),
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        subscription = event.data.object;
        customerId = subscription.customer;

        usersSnapshot = await admin.firestore()
            .collection("users")
            .where("stripeCustomerId", "==", customerId)
            .get();

        if (!usersSnapshot.empty) {
          userDoc = usersSnapshot.docs[0];
          await userDoc.ref.update({
            subscriptionId: admin.firestore.FieldValue.delete(),
            subscriptionStatus: "canceled",
            priceId: admin.firestore.FieldValue.delete(),
            subscriptionPeriodEnd: admin.firestore.FieldValue.delete(),
          });
        }
        break;
      }
    }

    res.json({received: true});
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).send("Webhook processing failed");
  }
});
