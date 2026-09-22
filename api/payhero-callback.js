// PayHero callback -> Firebase/Firestore synchronizer.
// Required env: FIREBASE_SERVICE_ACCOUNT_JSON
// Optional alternative: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
import admin from 'firebase-admin';

function initFirebaseAdmin(){
  if (admin.apps.length) return admin.firestore();
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const raw = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    credential = admin.credential.cert(raw);
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    credential = admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
  } else {
    throw new Error('Firebase Admin credentials are not configured.');
  }
  admin.initializeApp({credential});
  return admin.firestore();
}

function statusLabel(body){
  if (String(body.status || '').toLowerCase() === 'success' || body.success === true) return 'Verified';
  return 'Failed';
}

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({success:false,message:'Method not allowed'});
  // Acknowledge only after the payload has been parsed. PayHero retries failed callbacks.
  try {
    const body = req.body || {};
    const externalReference = String(body.external_reference || '').trim();
    const reference = String(body.reference || '').trim();
    if (!externalReference && !reference) return res.status(400).json({success:false,message:'Missing payment reference'});

    const db = initFirebaseAdmin();
    const ref = db.collection('portalData').doc('main');
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() || {}) : {};
      const payments = Array.isArray(data.payments) ? [...data.payments] : [];
      const applications = Array.isArray(data.applications) ? [...data.applications] : [];
      const finalStatus = statusLabel(body);
      const idx = payments.findIndex(p =>
        (externalReference && String(p.externalReference || '') === externalReference) ||
        (reference && String(p.reference || '') === reference)
      );
      if (idx < 0) {
        // Keep an auditable record even if the initiating browser disappeared before saving it.
        payments.unshift({
          id: 'CALLBACK-' + Date.now(),
          date: new Date().toISOString().slice(0,10),
          member: 'PayHero Callback',
          amount: Number(body.amount || 0),
          method: 'M-PESA STK Push',
          purpose: 'PayHero callback',
          reference: reference || externalReference,
          externalReference,
          providerReference: body.provider_reference || '',
          transactionId: body.transaction_id || '',
          status: finalStatus,
          callbackMessage: body.message || '',
          transactionDate: body.transaction_date || '',
          submittedAt: new Date().toISOString(),
          verifiedAt: finalStatus === 'Verified' ? new Date().toISOString() : ''
        });
      } else {
        const p = {...payments[idx]};
        p.externalReference = p.externalReference || externalReference;
        p.reference = reference || p.reference;
        p.providerReference = body.provider_reference || p.providerReference || '';
        p.transactionId = body.transaction_id || p.transactionId || '';
        p.callbackMessage = body.message || '';
        p.transactionDate = body.transaction_date || p.transactionDate || '';
        p.status = finalStatus;
        if (finalStatus === 'Verified') {
          p.verifiedAt = new Date().toISOString();
          p.verifiedBy = 'PayHero Callback';
        }
        payments[idx] = p;
      }

      // Registration applications remain subject to the existing 3-office-bearer approval rule.
      for (let i=0;i<applications.length;i++) {
        const a = {...applications[i]};
        if (a.paymentReference && (a.paymentReference === reference || a.externalPaymentReference === externalReference)) {
          a.paymentStatus = finalStatus === 'Verified'
            ? 'Verified — Registration Fee Paid'
            : 'Registration Fee Payment Failed';
          a.providerPaymentReference = body.provider_reference || a.providerPaymentReference || '';
          a.paymentTransactionId = body.transaction_id || a.paymentTransactionId || '';
          applications[i] = a;
        }
      }
      tx.set(ref, {...data, payments, applications, updatedAt: new Date().toISOString()}, {merge:false});
    });
    return res.status(200).json({success:true,received:true});
  } catch (e) {
    console.error('PayHero callback error:', e);
    return res.status(500).json({success:false,message:e?.message || 'Callback processing failed'});
  }
}
