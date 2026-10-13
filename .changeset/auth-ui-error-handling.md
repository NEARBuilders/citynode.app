---
"@everything-dev/auth-plugin": patch
---

Handle failures in the sign-in and settings screens. Phone pairing shows a failed state with Retry instead of an endless QR placeholder, and uses the server's verification link and polling interval as given. The device-code page checks an invalid code once and lets you enter another instead of retrying forever, and validates typed codes with the shared code format. A failed approve or deny no longer reports success, and signing in from the approval page keeps every pairing parameter. Wallet detection errors on the login page no longer surface as unhandled rejections, signing out warns when the NEAR wallet could not be disconnected, and the profile, sign-in methods, API keys and security settings show a loading, retryable error, or signed-out state instead of a blank page. Device and login test IDs now use the hyphenated `<area>-<purpose>` form.
