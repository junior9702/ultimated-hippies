// PayHero callback -> Firebase/Firestore synchronizer.
// This endpoint is the source of truth for final payment status.
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

function normalizePhone(value){
  let p=String(value||'').replace(/[\s+()-]/g,'');
  if(/^0[17]\d{8}$/.test(p)) p='254'+p.slice(1);
  return p;
}

function statusLabel(body){
  const s=String(body?.status ?? body?.callback_status ?? body?.Status ?? '').trim().toLowerCase();
  const rc=body?.result_code;
  if(rc===0 || s==='success' || s==='completed' || s==='paid' || body?.success===true) return 'Verified';
  if(rc!==undefined && Number(rc)!==0 || s==='failed' || s==='failure' || s==='cancelled' || body?.success===false) return 'Failed';
  return 'Pending Confirmation';
}

function isVerifiedStatus(status){ return status==='Verified'; }

function paymentMatches(p, externalReference, reference){
  return !!p && (
    (externalReference && String(p.externalReference||'')===externalReference) ||
    (reference && String(p.reference||'')===reference)
  );
}

function alreadyCredited(rows, payment){
  const ext=String(payment.externalReference||'');
  const ref=String(payment.reference||'');
  const pid=String(payment.id||'');
  return (rows||[]).some(x =>
    (pid && String(x.paymentId||'')===pid) ||
    (ext && String(x.externalReference||'')===ext) ||
    (ref && String(x.paymentReference||'')===ref)
  );
}

function findMemberName(members, payment, body){
  if(payment?.member && payment.member!=='PayHero Callback' && payment.member!=='New Member Applicant') return payment.member;
  const phone=normalizePhone(payment?.phone || body?.phone_number || body?.phone || '');
  if(phone){
    const m=(members||[]).find(x=>normalizePhone(x.phone)===phone);
    if(m?.name) return m.name;
  }
  return payment?.member || 'PayHero Callback';
}

function purposeType(payment){
  const purpose=String(payment?.purpose||'').toLowerCase();
  if(purpose.includes('table banking') || purpose.includes('loan fund contribution')) return 'tableBanking';
  if(purpose.includes('merry-go-round') || purpose.includes('merry go round')) return 'merry';
  if(purpose.includes('member contribution') || purpose.includes('contribution')) return 'contribution';
  if(purpose.includes('loan repayment')) return 'loanPayment';
  return '';
}

function applyVerifiedLedger(data, payment, body){
  const type=purposeType(payment);
  if(!type) return;

  const member=findMemberName(data.members, payment, body);
  const amount=Number(payment.amount || body.amount || 0);
  if(!member || amount<=0) return;

  const common={
    paymentId:payment.id,
    paymentReference:payment.reference || '',
    externalReference:payment.externalReference || '',
    providerReference:body.provider_reference || '',
    transactionId:body.transaction_id || '',
    date:String(body.transaction_date||'').slice(0,10) || new Date().toISOString().slice(0,10),
    member,
    amount,
    recordedAt:new Date().toISOString(),
    recordedBy:'PayHero Callback'
  };

  if(type==='contribution'){
    data.contributions=Array.isArray(data.contributions)?[...data.contributions]:[];
    if(!alreadyCredited(data.contributions,payment)){
      data.contributions.unshift({...common,desc:payment.purpose||'Member contribution',method:'M-PESA STK Push'});
    }
    return;
  }

  if(type==='tableBanking'){
    data.tableBanking=Array.isArray(data.tableBanking)?[...data.tableBanking]:[];
    if(!alreadyCredited(data.tableBanking,payment)){
      const p=String(payment.purpose||'').toLowerCase();
      const typeValue=p.includes('loan fund')?'loan_fund':'deposit';
      data.tableBanking.unshift({
        ...common,
        id:'TB-PAY-'+Date.now()+'-'+Math.random().toString(16).slice(2),
        type:typeValue,
        note:payment.purpose||'M-PESA table banking payment'
      });
    }
    return;
  }

  if(type==='merry'){
    data.merry=Array.isArray(data.merry)?[...data.merry]:[];
    if(!alreadyCredited(data.merry,payment)){
      const purpose=String(payment.purpose||'');
      const match=purpose.match(/Beneficiary:\s*(.+)$/i);
      data.merry.unshift({
        ...common,
        beneficiary:match?.[1]?.trim()||'',
        total:amount*Number((data.members||[]).length||0)
      });
    }
    return;
  }

  if(type==='loanPayment'){
    data.loanPayments=Array.isArray(data.loanPayments)?[...data.loanPayments]:[];
    if(!alreadyCredited(data.loanPayments,payment)){
      data.loanPayments.unshift({...common,note:payment.purpose||'Loan repayment',method:'M-PESA STK Push'});
      const loans=Array.isArray(data.loans)?[...data.loans]:[];
      // Match the member's active loan. If there is one, apply the verified
      // payment to the oldest outstanding loan first.
      const candidates=loans
        .map((l,i)=>({...l,__i:i}))
        .filter(l=>String(l.member||'')===String(member) && ['approved','active'].includes(String(l.status||'').toLowerCase()))
        .sort((a,b)=>new Date(a.appliedAt||0)-new Date(b.appliedAt||0));
      let remaining=amount;
      for(const loan of candidates){
        if(remaining<=0) break;
        const outstanding=Math.max(0,Number(loan.totalRepayable||0)-Number(loan.paid||0));
        const applied=Math.min(remaining,outstanding);
        loans[loan.__i]={...loan,paid:Number(loan.paid||0)+applied,status:(Number(loan.paid||0)+applied>=Number(loan.totalRepayable||0)?'completed':'active')};
        delete loans[loan.__i].__i;
        remaining-=applied;
      }
      data.loans=loans;
    }
  }
}

async function readCallbackBody(req){
  // PayHero documents application/json, but some serverless runtimes expose
  // the request body differently. Handle parsed objects, strings, buffers,
  // and finally read the raw request stream when req.body is unavailable.
  let body=req?.body;

  if(body && typeof body==='object' && !Buffer.isBuffer(body)) return body;

  if(Buffer.isBuffer(body)) body=body.toString('utf8');

  if(typeof body==='string' && body.trim()){
    try { return JSON.parse(body); } catch {}
    try { return Object.fromEntries(new URLSearchParams(body)); } catch {}
  }

  if(req && typeof req.on==='function'){
    const chunks=[];
    try{
      await new Promise((resolve,reject)=>{
        req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
        req.on('end', resolve);
        req.on('error', reject);
      });
      const raw=Buffer.concat(chunks).toString('utf8').trim();
      if(raw){
        try { return JSON.parse(raw); } catch {}
        try { return Object.fromEntries(new URLSearchParams(raw)); } catch {}
      }
    }catch{}
  }

  return {};
}

function unwrapCallbackBody(input){
  let body=input||{};
  for(let i=0;i<10;i++){
    if(typeof body==='string'){
      try{ body=JSON.parse(body); continue; }catch{}
    }
    if(!body || typeof body!=='object') break;
    if(body.data && typeof body.data==='object' && !Array.isArray(body.data)){ body=body.data; continue; }
    if(body.payload && typeof body.payload==='object' && !Array.isArray(body.payload)){ body=body.payload; continue; }
    if(body.result && typeof body.result==='object' && !Array.isArray(body.result)){ body=body.result; continue; }
    if(body.callback && typeof body.callback==='object' && !Array.isArray(body.callback)){ body=body.callback; continue; }
    // Actual PayHero callback observed in production:
    // { status: boolean, response: { ExternalReference, ResultCode, ... }, forward_url }
    if(body.response!==undefined && body.response!==null){
      if(typeof body.response==='string'){
        try{ body=JSON.parse(body.response); continue; }catch{}
      }else if(typeof body.response==='object' && !Array.isArray(body.response)){
        body=body.response; continue;
      }
    }
    break;
  }
  return body||{};
}

function firstField(obj,names){
  if(!obj || typeof obj!=='object') return '';
  for(const name of names){
    if(obj[name]!==undefined && obj[name]!==null && String(obj[name]).trim()!=='') return String(obj[name]).trim();
  }
  const wanted=new Set(names.map(n=>String(n).toLowerCase()));
  for(const [k,v] of Object.entries(obj)){
    if(wanted.has(String(k).toLowerCase()) && v!==undefined && v!==null && String(v).trim()!=='') return String(v).trim();
  }
  return '';
}

function findReferenceFields(body){
  const refs={externalReference:'', reference:''};
  const queue=[body];
  const seen=new Set();
  while(queue.length){
    const current=queue.shift();
    if(!current || typeof current!=='object' || seen.has(current)) continue;
    seen.add(current);

    refs.externalReference ||= firstField(current, [
      'external_reference','externalReference','merchant_reference',
      'merchantReference','client_reference','clientReference'
    ]);
    refs.reference ||= firstField(current, [
      'reference','payhero_reference','payHeroReference'
    ]);

    if(refs.externalReference && refs.reference) break;

    for(const value of Object.values(current)){
      if(value && typeof value==='object' && !Array.isArray(value)) queue.push(value);
      else if(Array.isArray(value)){
        for(const item of value){
          if(item && typeof item==='object') queue.push(item);
        }
      }
    }
  }
  return refs;
}


function inspectShape(value, path='', out=[], depth=0){
  if(depth>5 || out.length>250) return out;
  if(value===null){ out.push({path:path||'$',type:'null'}); return out; }
  if(Buffer.isBuffer(value)){ out.push({path:path||'$',type:'buffer',length:value.length}); return out; }
  if(Array.isArray(value)){
    out.push({path:path||'$',type:'array',length:value.length});
    value.slice(0,10).forEach((v,i)=>inspectShape(v,`${path||'$'}[${i}]`,out,depth+1));
    return out;
  }
  if(typeof value==='object'){
    const keys=Object.keys(value);
    out.push({path:path||'$',type:'object',keys:keys.slice(0,100)});
    for(const key of keys.slice(0,100)){
      inspectShape(value[key],`${path||'$'}.${key}`,out,depth+1);
    }
    return out;
  }
  out.push({path:path||'$',type:typeof value});
  return out;
}

function collectReferenceCandidates(value, path='', out=[], seen=new Set(), depth=0){
  if(depth>6 || out.length>50 || value===null || value===undefined) return out;
  if(typeof value==='object'){
    if(seen.has(value)) return out;
    seen.add(value);
    if(Array.isArray(value)){
      value.slice(0,20).forEach((v,i)=>collectReferenceCandidates(v,`${path||'$'}[${i}]`,out,seen,depth+1));
    }else{
      for(const [key,v] of Object.entries(value).slice(0,150)){
        const keyLower=key.toLowerCase();
        if(
          keyLower.includes('reference') ||
          keyLower.includes('transaction') ||
          keyLower.includes('external')
        ){
          const printable=(v!==null && typeof v!=='object') ? String(v) : '[object]';
          out.push({path:`${path||'$'}.${key}`,value:printable.slice(0,200)});
        }
        if(v && typeof v==='object') collectReferenceCandidates(v,`${path||'$'}.${key}`,out,seen,depth+1);
      }
    }
  }
  return out;
}

async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({success:false,message:'Method not allowed'});
  try{
    const rawBody=await readCallbackBody(req);
    const unwrapped=unwrapCallbackBody(rawBody);
    const body={
      ...unwrapped,
      external_reference:firstField(unwrapped,['external_reference','externalReference','ExternalReference','merchant_reference','merchantReference','client_reference','clientReference']),
      reference:firstField(unwrapped,['reference','Reference','payhero_reference','payHeroReference']),
      amount:unwrapped.amount ?? unwrapped.Amount,
      phone_number:firstField(unwrapped,['phone_number','phone','Phone']),
      provider_reference:firstField(unwrapped,['provider_reference','providerReference','MpesaReceiptNumber']),
      transaction_id:firstField(unwrapped,['transaction_id','transactionId','CheckoutRequestID','MerchantRequestID']),
      message:firstField(unwrapped,['message','ResultDesc','resultDesc']),
      result_code:unwrapped.ResultCode!==undefined ? Number(unwrapped.ResultCode) : undefined,
      callback_status:firstField(unwrapped,['status','Status'])
    };
    const refs=findReferenceFields(body);
    const externalReference=refs.externalReference;
    const reference=refs.reference;
    if(!externalReference && !reference){
      console.error('PAYHERO CALLBACK DIAGNOSTIC: missing reference fields', {
        contentType:req.headers?.['content-type']||'',
        contentLength:req.headers?.['content-length']||'',
        rawType:typeof rawBody,
        rawShape:inspectShape(rawBody).slice(0,120),
        bodyShape:inspectShape(body).slice(0,120),
        referenceCandidates:collectReferenceCandidates(rawBody)
      });
      // Acknowledge malformed callbacks so the provider does not retry
      // indefinitely. No ledger update is performed without a reference.
      return res.status(200).json({success:true,received:true,matched:false,message:'Callback received but no payment reference was found'});
    }

    const db=initFirebaseAdmin();
    const ref=db.collection('portalData').doc('main');

    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const data=snap.exists?(snap.data()||{}):{};
      const payments=Array.isArray(data.payments)?[...data.payments]:[];
      const applications=Array.isArray(data.applications)?[...data.applications]:[];
      const finalStatus=statusLabel(body);

      let idx=payments.findIndex(p=>paymentMatches(p,externalReference,reference));
      if(idx<0){
        const newPayment={
          id:'CALLBACK-'+Date.now()+'-'+Math.random().toString(16).slice(2),
          date:String(body.transaction_date||'').slice(0,10)||new Date().toISOString().slice(0,10),
          member:'PayHero Callback',
          amount:Number(body.amount||0),
          method:'M-PESA STK Push',
          purpose:'PayHero callback',
          reference:reference||externalReference,
          externalReference,
          providerReference:body.provider_reference||'',
          transactionId:body.transaction_id||'',
          status:finalStatus,
          callbackMessage:body.message||'',
          transactionDate:body.transaction_date||'',
          phone:normalizePhone(body.phone_number||body.phone||''),
          submittedAt:new Date().toISOString(),
          verifiedAt:isVerifiedStatus(finalStatus)?new Date().toISOString():''
        };
        payments.unshift(newPayment);
        idx=0;
      }else{
        const p={...payments[idx]};
        p.externalReference=p.externalReference||externalReference;
        p.reference=reference||p.reference||externalReference;
        p.providerReference=body.provider_reference||p.providerReference||'';
        p.transactionId=body.transaction_id||p.transactionId||'';
        p.callbackMessage=body.message||'';
        p.transactionDate=body.transaction_date||p.transactionDate||'';
        if(body.amount!=null) p.amount=Number(body.amount);
        if(body.phone_number||body.phone) p.phone=normalizePhone(body.phone_number||body.phone);
        p.status=finalStatus;
        p.callbackReceivedAt=new Date().toISOString();
        if(isVerifiedStatus(finalStatus)){
          p.verifiedAt=p.verifiedAt||new Date().toISOString();
          p.verifiedBy='PayHero Callback';
        }
        payments[idx]=p;
      }

      const payment=payments[idx];

      // Registration application status is updated immediately from the callback.
      for(let i=0;i<applications.length;i++){
        const a={...applications[i]};
        if(
          (a.paymentReference && paymentMatches({reference:a.paymentReference,externalReference:a.externalPaymentReference},externalReference,reference)) ||
          (a.externalPaymentReference && String(a.externalPaymentReference)===String(externalReference))
        ){
          a.paymentStatus=isVerifiedStatus(finalStatus)
            ? 'Verified — Registration Fee Paid'
            : finalStatus==='Failed'
              ? 'Registration Fee Payment Failed'
              : 'STK Initiated — Awaiting M-PESA Confirmation';
          a.providerPaymentReference=body.provider_reference||a.providerPaymentReference||'';
          a.paymentTransactionId=body.transaction_id||a.paymentTransactionId||'';
          a.paymentCallbackAt=new Date().toISOString();
          applications[i]=a;
        }
      }

      // Only a verified callback credits a financial ledger. Repeated callbacks
      // are idempotent, so the same M-PESA transaction cannot be credited twice.
      if(isVerifiedStatus(finalStatus)){
        // applyVerifiedLedger mutates its data object, so copy the arrays back.
        const ledgerData={...data,payments,applications};
        applyVerifiedLedger(ledgerData,payment,body);
        Object.assign(data,{
          payments:ledgerData.payments,
          applications:ledgerData.applications,
          contributions:ledgerData.contributions,
          tableBanking:ledgerData.tableBanking,
          merry:ledgerData.merry,
          loanPayments:ledgerData.loanPayments,
          loans:ledgerData.loans
        });
      }else{
        data.payments=payments;
        data.applications=applications;
      }

      // Ensure arrays exist after callback-created records.
      data.payments=payments;
      data.applications=applications;
      data.updatedAt=new Date().toISOString();
      tx.set(ref,data,{merge:false});
    });

    return res.status(200).json({success:true,received:true});
  }catch(e){
    console.error('PayHero callback error:',e);
    return res.status(500).json({success:false,message:e?.message||'Callback processing failed'});
  }
}

export default handler;
