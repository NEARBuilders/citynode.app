---
"ui": patch
---

An email address is only marked verified once the account proves it controls it. When an email provider is configured, adding an email sends a 6-digit code to the new address and the account only takes the address, verified, once the code is entered; until then it keeps its old email and the address stays free for its real owner. Codes expire after 10 minutes and allow five tries. Without an email provider, adding an email saves it straight away but unverified, and nothing in the app needs an email provider to start. Accepting an organization invitation now needs a verified email that matches the invitation, so an unverified address can't be used to take someone else's invitation. The old `/set-email` endpoint, which saved any unused address as verified straight away, is removed, and Better Auth's email-code sign-in and password reset stay switched off. Invitation emails only report a delivery failure when a provider is configured.
