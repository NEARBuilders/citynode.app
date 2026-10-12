---
"@everything-dev/auth-plugin": minor
"ui": patch
---

Adding an email address now needs proof that it's yours. The account asks for a 6-digit code to be sent to the new address and only takes the address, marked verified, once that code is entered; until then the account keeps its old email and the address stays free for its real owner. Codes expire after 10 minutes and allow five tries. Accepting an organization invitation now needs a verified email that matches the invitation. The old `/set-email` endpoint, which saved any unused address as verified straight away, is removed. Email-code sign-in and password reset from Better Auth's email OTP plugin stay switched off. When no email provider is configured, development logs the code to the console and production says it can't send one.
