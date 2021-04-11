# Client flow
1. Doesn't have token?
 - If not, open browser to `sponsorkit.io/api/browser/{beneficiary}/{token}` where `token` is some random ID (could be a SHA of an email, or some random ID) (serverless).
 - A redirect is made to `sponsorkit.io/signup?token={token}` (S3).
 - Repeatedly check for donations at `GET sponsorkit.io/api/sponsor/{beneficiary}/{token}` (serverless).
    - Not finished yet: `206 Partial Content`
    - Cancelled / Not found: `204 No Content`

2. Has token?
 - Check for donations at `GET sponsorkit.io/api/sponsor/{beneficiary}/{token}` (serverless) once.
    - Not finished yet: `206 Partial Content`
    - Cancelled / Not found: `204 No Content`

# Signup flow
1. Go to sponsorkit.io
2. Sign up (redirect to Auth0).
3. Get redirected to `sponsorkit.io/signup?token={token}` (S3).
4. Fill in Stripe information.
5. Get redirected to `sponsorkit.io/dashboard` (S3).

# Payment flow
1. Get sent to `sponsorkit.io/{beneficiary}?token={token}`.
2. Fill in Stripe information (and perhaps e-mail).
3. Pay!
4. Close browser.
