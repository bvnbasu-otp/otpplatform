import fs from 'node:fs';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const pg = require('pg');

const env = {};
const envPaths = ['.env.otp.production.local', '.env.local', '.env'];
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(l => {
      const t = l.trim();
      if (t && !t.startsWith('#')) {
        const eq = t.indexOf('=');
        if (eq > 0) {
          let val = t.slice(eq + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
          if (!env[t.slice(0, eq).trim()]) env[t.slice(0, eq).trim()] = val;
        }
      }
    });
  }
}

export const CUSTOMER_EULA_BODY = `# OTP Customer Terms of Use and End User License Agreement (EULA)
Version: v1.0-20261018
Audience: BUYER (Individual, RWA, MSME)
Status: Draft Approved for Pilot Phase
Jurisdiction: Bengaluru, Karnataka, India

1. PURPOSE & CORE PRINCIPLES
Open Trade & Procurement (OTP) is a cloud-based procurement platform facilitating procurement workflows between buyers (Individuals, Residential Welfare Associations (RWAs), and Micro, Small & Medium Enterprises (MSMEs)) and verified suppliers in Bengaluru, Karnataka, India.
OTP operates strictly on the principle: TELL -> REVIEW -> DECIDE -> TRACK.
OTP automates requirement formulation, supplier discovery, RFQ dispatch, quote aggregation, and audit tracking. The Buyer retains sole decision-making authority for supplier selection and contract awards.

2. DIRECT SETTLEMENT & PAYMENTS DISCLAIMER
OTP is not a payment gateway, money transmitter, escrow agent, or banking institution. All purchase orders, work orders, contracts, and financial payments are conducted directly between the Buyer and the awarded Supplier. OTP does not hold client funds and does not charge hidden payment markups.

3. IDENTITY PROTECTION DURING EVALUATION
During requirement evaluation and bidding, supplier identities are shielded behind ephemeral, per-request aliases to eliminate cognitive bias and ensure merit-based procurement. Revealing identities occurs exclusively upon contract award locking.

4. USER RESPONSIBILITIES
The Buyer agrees to:
- Provide accurate requirement specifications and project locations.
- Maintain confidentiality of credentials.
- Respect identity protection protocols prior to award.
- Comply with all applicable statutory and local regulations in Karnataka and India.

5. PILOT PHASE RECONCILIATION & GO-LIVE GATING
This agreement is Draft Approved for the OTP Bengaluru Pilot Phase following legal review. Platform enforcement gating remains non-enforcing (enforcement_enabled = false) during pilot validation. Formal corporate registrations, production domain verification, and hard EULA gating will take effect upon commercial go-live.

6. GOVERNING LAW & JURISDICTION
This agreement is governed by the laws of India. Any disputes arising under this agreement shall be subject to arbitration in Bangalore, Karnataka in accordance with the Arbitration and Conciliation Act, 1996. Courts in Bangalore shall have exclusive jurisdiction.
`;

export const SUPPLIER_EULA_BODY = `# OTP Supplier Terms of Use and End User License Agreement (EULA)
Version: v1.0-20261018
Audience: SUPPLIER
Status: Draft Approved for Pilot Phase
Jurisdiction: Bengaluru, Karnataka, India

1. PURPOSE & PARTICIPATION
Open Trade & Procurement (OTP) connects qualified suppliers, contractors, and service vendors with institutional and individual buyers (Individuals, RWAs, and MSMEs) in Bengaluru, Karnataka, India.
OTP operates on the principle: TELL -> REVIEW -> DECIDE -> TRACK. OTP facilitates transparent requirement distribution and quote management.

2. COMMERCIAL INTENT & QUOTE INTEGRITY
Suppliers agree to submit quotes in good faith with genuine commercial intent, accurate product specifications, realistic delivery timelines, and transparent pricing inclusive of applicable GST. Quotes submitted shall remain binding for the specified validity period.

3. DIRECT CONTRACTING & PAYMENT SETTLEMENT
Contracts and purchase orders issued through OTP represent direct agreements between the Supplier and the Buyer. All milestone billings, invoices, and payment collections are settled directly between Buyer and Supplier. OTP does not guarantee payments or mediate commercial debt collection.

4. IDENTITY PROTECTION & ETHICAL CONDUCT
Suppliers agree to respect identity protection during quote evaluation. Attempting to identify buyers or circumvent platform communication channels prior to award is strictly prohibited and constitutes grounds for immediate suspension.

5. PILOT PHASE RECONCILIATION & GO-LIVE GATING
This agreement is Draft Approved for the OTP Bengaluru Pilot Phase following legal review. Platform enforcement gating remains non-enforcing (enforcement_enabled = false) during pilot validation. Full commercial registration, licensing, and hard enforcement will accompany commercial release.

6. GOVERNING LAW & JURISDICTION
This agreement is governed by the laws of India. Any disputes arising hereunder shall be resolved through arbitration in Bangalore, Karnataka under the Indian Arbitration and Conciliation Act, 1996. Courts in Bangalore have exclusive jurisdiction.
`;

async function main() {
  const connStr = env.DIRECT_URL || env.DATABASE_URL;
  if (!connStr) {
    console.error('Missing DIRECT_URL or DATABASE_URL');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('--- Reconciling Pilot EULA Status (Stage 2) ---');

  const founderId = '3c993f64-1ecb-42b0-bb7c-7b3283e7e902'; // bvnbasu@gmail.com
  const externalRef = 'LEGAL-PILOT-DRAFT-APPROVAL-20261018';
  const version = 'v1.0-20261018';

  const buyerHash = 'sha256:' + crypto.createHash('sha256').update(CUSTOMER_EULA_BODY, 'utf8').digest('hex');
  const supplierHash = 'sha256:' + crypto.createHash('sha256').update(SUPPLIER_EULA_BODY, 'utf8').digest('hex');

  console.log('Target Version:', version);
  console.log('Buyer Document Hash:', buyerHash);
  console.log('Supplier Document Hash:', supplierHash);

  await client.query('BEGIN;');

  try {
    // 1. Grant reviewer
    await client.query("SELECT set_config('otp.legal_grant_write', 'on', true);");
    await client.query(`
      INSERT INTO public.legal_review_grants (
        profile_id, can_register, can_decide, can_activate, can_authorize, external_record_ref
      ) VALUES ($1, true, true, true, true, $2)
      ON CONFLICT (profile_id) DO UPDATE SET
        can_register = true, can_decide = true, can_activate = true, can_authorize = true,
        revoked_at = NULL, external_record_ref = EXCLUDED.external_record_ref;
    `, [founderId, externalRef]);
    console.log('[1/6] Reviewer grant active for Founder profile');

    // 2. Retire old placeholder versions
    await client.query("SELECT set_config('otp.legal_catalogue_write', 'on', true);");
    await client.query(`
      UPDATE public.legal_document_versions
      SET retired_at = now()
      WHERE agreement_type IN ('CUSTOMER_EULA', 'SUPPLIER_EULA')
        AND retired_at IS NULL
        AND version IS DISTINCT FROM $1;
    `, [version]);
    console.log('[2/6] Prior unlinked/placeholder versions retired');

    // 3. Insert or fetch snapshots
    await client.query("SELECT set_config('otp.legal_snapshot_write', 'on', true);");
    let buyerSnapId = (await client.query(`
      SELECT id FROM public.legal_document_snapshots WHERE agreement_type = 'CUSTOMER_EULA' AND version = $1;
    `, [version])).rows[0]?.id;

    if (!buyerSnapId) {
      const snap = await client.query(`
        INSERT INTO public.legal_document_snapshots (agreement_type, version, document_hash, body)
        VALUES ('CUSTOMER_EULA', $1, $2, convert_to($3, 'UTF8'))
        RETURNING id;
      `, [version, buyerHash, CUSTOMER_EULA_BODY]);
      buyerSnapId = snap.rows[0].id;
    }

    let supplierSnapId = (await client.query(`
      SELECT id FROM public.legal_document_snapshots WHERE agreement_type = 'SUPPLIER_EULA' AND version = $1;
    `, [version])).rows[0]?.id;

    if (!supplierSnapId) {
      const snap = await client.query(`
        INSERT INTO public.legal_document_snapshots (agreement_type, version, document_hash, body)
        VALUES ('SUPPLIER_EULA', $1, $2, convert_to($3, 'UTF8'))
        RETURNING id;
      `, [version, supplierHash, SUPPLIER_EULA_BODY]);
      supplierSnapId = snap.rows[0].id;
    }
    console.log('[3/6] Frozen snapshots recorded:', { buyerSnapId, supplierSnapId });

    // 4. Update legal_document_versions catalogue
    await client.query("SELECT set_config('otp.legal_status_write', 'on', true);");
    await client.query(`
      INSERT INTO public.legal_document_versions (
        agreement_type, version, document_hash, title, snapshot_id, legal_approval_status, reacceptance_policy, content_ref
      ) VALUES
        ('CUSTOMER_EULA', $1, $2, 'OTP Customer Terms of Use and EULA', $3, 'APPROVED', 'IMMEDIATE', '/legal/terms'),
        ('SUPPLIER_EULA', $1, $4, 'OTP Supplier Terms of Use and EULA', $5, 'APPROVED', 'IMMEDIATE', '/legal/terms')
      ON CONFLICT (agreement_type, version) DO UPDATE SET
        snapshot_id = EXCLUDED.snapshot_id,
        legal_approval_status = 'APPROVED',
        retired_at = NULL;
    `, [version, buyerHash, buyerSnapId, supplierHash, supplierSnapId]);
    console.log('[4/6] Catalogue versions v1.0-20261018 marked APPROVED with linked snapshots');

    // 5. Record approvals in legal_agreement_approvals
    await client.query("SELECT set_config('otp.legal_approval_write', 'on', true);");
    await client.query(`
      INSERT INTO public.legal_agreement_approvals (
        snapshot_id, agreement_type, version, document_hash, decision, approver_profile_id, external_record_ref, notes
      ) VALUES
        ($1, 'CUSTOMER_EULA', $2, $3, 'APPROVED', $4, $5, 'Draft Approved for Pilot Phase per counsel discussions.'),
        ($6, 'SUPPLIER_EULA', $2, $7, 'APPROVED', $4, $5, 'Draft Approved for Pilot Phase per counsel discussions.');
    `, [buyerSnapId, version, buyerHash, founderId, externalRef, supplierSnapId, supplierHash]);
    console.log('[5/6] Formal approval evidence recorded in legal_agreement_approvals');

    // 6. Ensure enforcement configuration remains non-enforcing for pilot
    const enforcementRes = await client.query(`
      SELECT singleton, enforcement_enabled, rollout_at FROM public.legal_enforcement_config;
    `);
    const cfg = enforcementRes.rows[0];
    if (cfg.enforcement_enabled !== false || cfg.rollout_at !== null) {
      throw new Error(`Enforcement configuration invalid: expected enforcement_enabled=false, rollout_at=null. Found: ${JSON.stringify(cfg)}`);
    }
    console.log('[6/6] Enforcement config confirmed non-enforcing:', cfg);

    await client.query('COMMIT;');
    console.log('--- RECONCILIATION COMMITTED TO DATABASE ---');

    // Verification
    const buyerRpc = await client.query("SELECT public.current_legal_snapshot_text('CUSTOMER_EULA') as res;");
    const supplierRpc = await client.query("SELECT public.current_legal_snapshot_text('SUPPLIER_EULA') as res;");

    console.log('\n--- VERIFICATION PROBE ---');
    console.log('Customer EULA published:', buyerRpc.rows[0].res.published, 'version:', buyerRpc.rows[0].res.version);
    console.log('Supplier EULA published:', supplierRpc.rows[0].res.published, 'version:', supplierRpc.rows[0].res.version);

    if (!buyerRpc.rows[0].res.published || !supplierRpc.rows[0].res.published) {
      throw new Error('Verification failed: snapshot text is not published!');
    }

    console.log('\nStage 2 Legal Reconciliation complete and verified.');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('Failed to reconcile legal state:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
