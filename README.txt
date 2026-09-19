ULTIMADED HIPPIES — PROFESSIONAL FINANCIAL & MEMBERSHIP UPDATE V7

Included updates:
- New member KYC onboarding: National ID number, ID front/back and signature upload.
- Executive-only KYC review queue; sensitive KYC links are hidden from ordinary members.
- Membership review window: approval cannot occur before 1 full day; default deadline is 7 days, with an executive extension workflow.
- Existing three-office-bearer approval rule remains: Chairperson + Secretary + Treasurer.
- Table Banking: member-chosen savings amounts, withdrawals, loan-fund contributions, statements and audit trail.
- Merry-Go-Round participation is now recorded per member.
- Loan eligibility engine requires configurable Merry-Go-Round participation and Table Banking activity, checks savings and blocks a second active loan.
- Loan approval, disbursement status and repayment ledger with remaining balance.
- Pro-rata dividend engine based on average qualifying Table Banking savings over a selected period, with saved calculation history.
- Existing portal features, logo, PWA and Firebase sync retained.

IMPORTANT PRODUCTION NOTE:
This V7 remains a browser/Firebase portal. KYC images are compressed before storage, but true production deployment should also enforce Firebase Storage/Firestore security rules so only authorized executive accounts can read KYC documents. Do not rely on browser visibility controls alone for legal/financial data. Review the group's approved loan interest, dividend, savings, quorum and KYC policies before going live.

Deployment:
1. Replace the repository files with the files in this folder.
2. Commit and push to GitHub.
3. Wait for Netlify/Firebase hosting to publish.
4. Hard refresh the portal (Ctrl+Shift+R).

PAYMENT CHANNEL UPDATE — 19 SEPTEMBER 2026

Official payment details shown in the portal:
- M-PESA PayBill: 522533
- Airtel Money PayBill: 522533
- KCB Vooma: dial *844# and use Pay Bill 522533 / Account 8142777 when prompted
- T-Kash: dial *334# and use Pay Bill 522533 / Account 8142777 when prompted
- Account number: 8142777
- Business name: ULTIMATED HIPPIES SHG

Payments are submitted with a transaction/reference number and remain Pending Verification until an executive verifies them. Verified payments are counted in the dashboard. Only the Chairperson can remove an incorrect payment record, and removals are logged in the audit trail.

This portal update does not claim automatic mobile-money confirmation. Live M-PESA/Airtel/T-Kash/Vooma API integration requires the appropriate provider/business credentials and backend webhooks.

- Updated Group Certificate: replaced the previous certificate image with the official certificate image supplied on 19 September 2026.
