# Client flow
1. Doesn't have token?
 - If not, open browser to `{beneficiary}.sponsorkit.io/browser/{token}` where `token` is some random ID (could be a SHA of an email, or some random ID) (serverless).
 - A redirect is made to `sponsorkit.io/{beneficiary}/new?token={token}` (S3).
 - Repeatedly check for donations at `GET {beneficiary}.sponsorkit.io/sponsor/{token}` (serverless).
    - Not finished yet: `206 Partial Content`
    - Not found: `404 Not Found`
    - Cancelled: `410 Gone`

2. Has token?
 - Check for donations at `GET {beneficiary}.sponsorkit.io/sponsor/{token}` (serverless) once.
    - Not finished yet: `206 Partial Content`
    - Not found: `404 Not Found`
    - Cancelled: `410 Gone`

# Signup flow
1. Go to sponsorkit.io
2. Sign up (redirect to Auth0).
3. Get redirected to `sponsorkit.io/signup` (S3).
4. Fill in Stripe information.
5. Get redirected to `sponsorkit.io/dashboard` (S3).

# Payment flow
1. Get sent to `sponsorkit.io/{beneficiary}/new?token={token}`.
2. Fill in Stripe information (and perhaps e-mail).
3. Pay!
4. Close browser.