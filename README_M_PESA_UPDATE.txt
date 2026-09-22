ULTIMATED HIPPIES — M-PESA STK PUSH UPDATE

Updated workflows
1. New Member Registration
   - After the applicant completes the Membership Application & KYC form, the application is saved.
   - A Ksh 1,500 Registration Fee M-PESA STK Push is then sent to the applicant's phone.
   - The application stores the STK payment status/reference.

2. Contributions
   - Added a dedicated Pay Contribution with M-PESA section.
   - Enter phone, amount and description, then Send M-PESA STK Push.

3. Table Banking
   - Added Pay Table Banking with M-PESA.
   - Supports Table Banking Deposit and Loan Fund Contribution.
   - Withdrawals are not processed through STK Push.

4. Merry-Go-Round
   - Added Pay Merry-Go-Round with M-PESA.
   - Enter phone, agreed contribution and beneficiary, then send the STK Push.

Security / confirmation behavior
- The browser never receives the PayHero username/password/channel credentials.
- The frontend calls /api/payhero-stk, which uses the existing server-side PayHero configuration.
- STK Initiated payments are stored as pending and are NOT treated as verified money.
- A payment should only be credited after the configured PayHero callback/verification process confirms it.

PayHero server configuration
The Vercel serverless function requires these environment variables. PayHero payment-channel collections require both the channel ID and the PayHero account ID:
PAYHERO_API_USERNAME
PAYHERO_API_PASSWORD
PAYHERO_CHANNEL_ID
PAYHERO_ACCOUNT_ID
PAYHERO_CALLBACK_URL
PAYHERO_BASE_URL (optional; default: https://api.payhero.africa)

Deploy the /api/payhero-stk.js function together with the frontend. Do not put PayHero credentials in index.html or other public frontend files.


See SECURE_PAYHERO_SETUP.txt for the secure Netlify environment-variable setup.
