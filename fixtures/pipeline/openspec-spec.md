## Signature handling

### Requirement: Verify signatures

The billing service shall verify the signature.

#### Scenario: invalid signature

If the signature is invalid, then the billing service shall reject the webhook.

### Requirement: Audit

The billing service shall log every attempt.
