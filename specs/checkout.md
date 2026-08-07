# Checkout webhooks

Source specification for checkout webhook handling in the billing service.

## Behavior

When a payment webhook is received, the billing service must verify the HMAC
signature before doing anything else.

If the HMAC signature is invalid, the webhook must be rejected.

When a webhook arrives, validate the signature, persist the event, and enqueue
a processing job.

While the payment provider is unavailable, queued events should be retried.

Where dunning management is enabled, declined charges are retried.

When a payment is declined, the customer should be notified quickly.
