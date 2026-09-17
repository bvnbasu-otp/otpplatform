/**
 * =============================================================================
 * OTP Platform — Production Environment & Configuration Validator
 * =============================================================================
 * Enforces strict environment integrity, security isolation, and secret
 * validation before any Release Candidate or Production deployment.
 *
 * Validation Dimensions:
 * 1. Client vs Server Secret Isolation (Zero secret leakage in VITE_* variables)
 * 2. Operating Mode Verification (VITE_DEMO_MODE must be false in Production)
 * 3. Database & Supabase Connectivity Configuration
 * 4. Custom Domains, CORS & Redirect Allow-Lists
 * 5. Payment Gateways (Razorpay / Stripe live credentials & webhook secrets)
 * 6. Messaging Gateways (Twilio / Meta WhatsApp / WAHA endpoints & secrets)
 * 7. Transactional Email & SMTP Relay Configuration (SES / Resend / SendGrid / SMTP)
 * 8. ONDC Beckn Protocol v1.2 Endpoints & Ed25519 Cryptographic Keys
 * 9. Statutory GSTN Verification Service Credentials
 * 10. Observability, Telemetry & Sentry Configuration
 * 11. Database Backup & Disaster Recovery Encryption Keys
 *
 * Usage:
 *   npx tsx scripts/validate-prod-env.ts
 *   npx tsx scripts/validate-prod-env.ts --env-file .env.production
 *   npx tsx scripts/validate-prod-env.ts --target-env production --strict
 *   npx tsx scripts/validate-prod-env.ts --sample
 *   npx tsx scripts/validate-prod-env.ts --json
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';

export type TargetEnvironment = 'production' | 'staging' | 'demo' | 'development';

export interface ValidationIssue {
  variable: string;
  level: 'ERROR' | 'WARN' | 'INFO';
  category: string;
  message: string;
  recommendation: string;
}

export interface VariableRule {
  name: string;
  category: string;
  requiredInProd: boolean;
  isSecret: boolean;
  clientSafe?: boolean;
  description: string;
  validate?: (value: string | undefined, env: Record<string, string>, targetEnv: TargetEnvironment) => string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

function isValidUrl(val: string, requireHttps = false): boolean {
  try {
    const url = new URL(val);
    if (requireHttps && url.protocol !== 'https:') return false;
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:';
  } catch {
    return false;
  }
}

function isValidEmail(val: string): boolean {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val);
}

function isValidJwt(val: string): boolean {
  const parts = val.split('.');
  return parts.length === 3 && parts[0].length > 10 && parts[1].length > 10;
}

function isNotLocalhost(val: string): boolean {
  return !val.includes('localhost') && !val.includes('127.0.0.1') && !val.includes('0.0.0.0');
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION RULES SPECIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export const ENVIRONMENT_RULES: VariableRule[] = [
  // 1. SUPABASE & CLIENT RUNTIME
  {
    name: 'VITE_SUPABASE_URL',
    category: 'Supabase & API',
    requiredInProd: true,
    isSecret: false,
    clientSafe: true,
    description: 'Supabase API / Kong Gateway endpoint for client requests',
    validate: (val, _, targetEnv) => {
      if (!val) return 'Missing VITE_SUPABASE_URL';
      if (!isValidUrl(val)) return 'Invalid URL format';
      if (targetEnv === 'production' && !val.startsWith('https://')) {
        return 'Production VITE_SUPABASE_URL must use HTTPS protocol';
      }
      if (targetEnv === 'production' && !isNotLocalhost(val)) {
        return 'Production VITE_SUPABASE_URL cannot point to localhost or loopback';
      }
      return null;
    },
  },
  {
    name: 'VITE_SUPABASE_ANON_KEY',
    category: 'Supabase & API',
    requiredInProd: true,
    isSecret: false,
    clientSafe: true,
    description: 'Supabase Anonymous Publishable JWT Key (RLS-Restricted)',
    validate: (val) => {
      if (!val) return 'Missing VITE_SUPABASE_ANON_KEY';
      if (!isValidJwt(val)) return 'VITE_SUPABASE_ANON_KEY must be a valid 3-part JWT';
      return null;
    },
  },
  {
    name: 'VITE_DEMO_MODE',
    category: 'Operating Mode',
    requiredInProd: true,
    isSecret: false,
    clientSafe: true,
    description: 'Demo mode toggle (disables test personas & stubs in production)',
    validate: (val, _, targetEnv) => {
      if (val === undefined || val === '') return 'Missing VITE_DEMO_MODE';
      if (val !== 'true' && val !== 'false') return 'VITE_DEMO_MODE must be boolean string ("true" or "false")';
      if (targetEnv === 'production' && val !== 'false') {
        return 'CRITICAL: VITE_DEMO_MODE must be set to "false" for Production Candidate deployments';
      }
      return null;
    },
  },
  {
    name: 'VITE_APP_URL',
    category: 'Domains & Routing',
    requiredInProd: true,
    isSecret: false,
    clientSafe: true,
    description: 'Canonical production URL for link generation and CORS verification',
    validate: (val, _, targetEnv) => {
      if (!val) return 'Missing VITE_APP_URL';
      if (!isValidUrl(val)) return 'Invalid URL format';
      if (targetEnv === 'production' && !val.startsWith('https://')) {
        return 'Production VITE_APP_URL must use HTTPS protocol';
      }
      if (targetEnv === 'production' && !isNotLocalhost(val)) {
        return 'Production VITE_APP_URL cannot point to localhost';
      }
      return null;
    },
  },
  {
    name: 'VITE_SENTRY_DSN',
    category: 'Telemetry & Observability',
    requiredInProd: false,
    isSecret: false,
    clientSafe: true,
    description: 'Sentry DSN for frontend exception monitoring (PII-sanitized)',
    validate: (val) => {
      if (!val) return null; // Optional
      if (!isValidUrl(val, true)) return 'Sentry DSN must be a valid HTTPS URL';
      return null;
    },
  },

  // 2. BACKEND & SUPABASE SERVICE SECRETS (SERVER ONLY)
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    category: 'Security & Backend Secrets',
    requiredInProd: true,
    isSecret: true,
    clientSafe: false,
    description: 'Supabase Service Role Key for Edge Functions & Admin RPCs',
    validate: (val) => {
      if (!val) return 'Missing SUPABASE_SERVICE_ROLE_KEY';
      if (!isValidJwt(val)) return 'SUPABASE_SERVICE_ROLE_KEY must be a valid 3-part JWT';
      return null;
    },
  },
  {
    name: 'DATABASE_URL',
    category: 'Database & Pooling',
    requiredInProd: false,
    isSecret: true,
    clientSafe: false,
    description: 'PostgreSQL direct (5432) or PgBouncer pooled (6543) connection string',
    validate: (val) => {
      if (!val) return null;
      if (!val.startsWith('postgresql://') && !val.startsWith('postgres://')) {
        return 'DATABASE_URL must start with postgresql:// or postgres://';
      }
      return null;
    },
  },
  {
    name: 'DATABASE_POOLER_URL',
    category: 'Database & Pooling',
    requiredInProd: false,
    isSecret: true,
    clientSafe: false,
    description: 'PgBouncer transaction-mode pooled connection string (port 6543)',
    validate: (val) => {
      if (!val) return null;
      if (!val.startsWith('postgresql://') && !val.startsWith('postgres://')) {
        return 'DATABASE_POOLER_URL must start with postgresql:// or postgres://';
      }
      return null;
    },
  },
  {
    name: 'GOTRUE_JWT_SECRET',
    category: 'Security & Backend Secrets',
    requiredInProd: false,
    isSecret: true,
    clientSafe: false,
    description: 'Supabase Auth / GoTrue JWT signing secret (min 32 chars)',
    validate: (val) => {
      if (!val) return null;
      if (val.length < 32) return 'GOTRUE_JWT_SECRET must be at least 32 characters long';
      return null;
    },
  },

  // 3. PAYMENT GATEWAY KEYS & WEBHOOKS
  {
    name: 'RAZORPAY_KEY_ID',
    category: 'Payment Integrations',
    requiredInProd: false,
    isSecret: false,
    clientSafe: true,
    description: 'Razorpay Client Key ID for Indian UPI/Netbanking payments',
    validate: (val, _, targetEnv) => {
      if (!val) return null;
      if (targetEnv === 'production' && val.startsWith('rzp_test_')) {
        return 'WARNING: Using Razorpay TEST Key ID in production environment';
      }
      return null;
    },
  },
  {
    name: 'RAZORPAY_KEY_SECRET',
    category: 'Payment Integrations',
    requiredInProd: false,
    isSecret: true,
    clientSafe: false,
    description: 'Razorpay Key Secret for order creation & signature validation',
  },
  {
    name: 'RAZORPAY_WEBHOOK_SECRET',
    category: 'Payment Integrations',
    requiredInProd: false,
    isSecret: true,
    clientSafe: false,
    description: 'Razorpay Webhook HMAC-SHA256 signing secret',
    validate: (val) => {
      if (!val) return null;
      if (val === 'otp_test_rzp_secret') return 'Cannot use default demo secret in production';
      return null;
    },
  },
  {
    name: 'STRIPE_PUBLISHABLE_KEY',
    category: 'Payment Integrations',
    requiredInProd: false,
    isSecret: false,
    clientSafe: true,
    description: 'Stripe Publishable Key for international cards',
    validate: (val, _, targetEnv) => {
      if (!val) return null;
      if (targetEnv === 'production' && val.startsWith('pk_test_')) {
        return 'WARNING: Using Stripe TEST Publishable Key in production environment';
      }
      return null;
    },
  },
  {
    name: 'STRIPE_SECRET_KEY',
    category: 'Payment Integrations',
    requiredInProd: false,
    isSecret: true,
    clientSafe: false,
    description: 'Stripe Secret Key for server-side charge verification',
    validate: (val, _, targetEnv) => {
      if (!val) return null;
      if (targetEnv === 'production' && val.startsWith('sk_test_')) {
        return 'WARNING: Using Stripe TEST Secret Key in production environment';
      }
      return null;
    },
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    category: 'Payment Integrations',
    requiredInProd: false,
    isSecret: true,
    clientSafe: false,
    description: 'Stripe Webhook signing secret (whsec_...)',
    validate: (val) => {
      if (!val) return null;
      if (val === 'whsec_test_stripe_secret') return 'Cannot use default demo secret in production';
      if (!val.startsWith('whsec_')) return 'Stripe webhook secret usually begins with whsec_';
      return null;
    },
  },

  // 4. MESSAGING & NOTIFICATION GATEWAYS
  {
    name: 'MESSAGING_PROVIDER',
    category: 'Messaging Gateways',
    requiredInProd: false,
    isSecret: false,
    clientSafe: false,
    description: 'Primary messaging provider adapter (TWILIO | META | WAHA | MOCK)',
    validate: (val) => {
      if (!val) return null;
      const valid = ['TWILIO', 'META', 'WAHA', 'MOCK'];
      if (!valid.includes(val.toUpperCase())) {
        return `Invalid MESSAGING_PROVIDER. Expected one of: ${valid.join(', ')}`;
      }
      return null;
    },
  },
  {
    name: 'TWILIO_ACCOUNT_SID',
    category: 'Messaging Gateways',
    requiredInProd: false,
    isSecret: true,
    clientSafe: false,
    description: 'Twilio Account SID for SMS & WhatsApp fallback',
    validate: (val) => {
      if (!val) return null;
      if (!val.startsWith('AC')) return 'Twilio Account SID must start with "AC"';
      return null;
    },
  },
  {
    name: 'TWILIO_AUTH_TOKEN',
    category: 'Messaging Gateways',
    requiredInProd: false,
    isSecret: true,
    clientSafe: false,
    description: 'Twilio Auth Token for webhook & API authentication',
  },
  {
    name: 'META_PHONE_NUMBER_ID',
    category: 'Messaging Gateways',
    requiredInProd: false,
    isSecret: false,
    clientSafe: false,
    description: 'Meta WhatsApp Cloud API Phone Number ID',
  },
  {
    name: 'META_ACCESS_TOKEN',
    category: 'Messaging Gateways',
    requiredInProd: false,
    isSecret: true,
    clientSafe: false,
    description: 'Meta WhatsApp Cloud API System User Access Token',
  },
  {
    name: 'META_APP_SECRET',
    category: 'Messaging Gateways',
    requiredInProd: false,
    isSecret: true,
    clientSafe: false,
    description: 'Meta App Secret for inbound webhook HMAC-SHA256 verification',
  },
  {
    name: 'META_VERIFY_TOKEN',
    category: 'Messaging Gateways',
    requiredInProd: false,
    isSecret: true,
    clientSafe: false,
    description: 'Meta Webhook hub.verify_token challenge secret',
  },
  {
    name: 'WAHA_BASE_URL',
    category: 'Messaging Gateways',
    requiredInProd: false,
    isSecret: false,
    clientSafe: false,
    description: 'Self-hosted WAHA (WhatsApp HTTP API) container endpoint',
    validate: (val) => {
      if (!val) return null;
      if (!isValidUrl(val)) return 'Invalid WAHA_BASE_URL';
      return null;
    },
  },

  // 5. TRANSACTIONAL EMAIL & SMTP
  {
    name: 'SMTP_HOST',
    category: 'Transactional Email',
    requiredInProd: true,
    isSecret: false,
    clientSafe: false,
    description: 'Production SMTP relay server hostname (e.g., smtp.resend.com, email-smtp.us-east-1.amazonaws.com)',
    validate: (val, _, targetEnv) => {
      if (!val) return 'Missing SMTP_HOST';
      if (targetEnv === 'production' && (val === '127.0.0.1' || val === 'localhost')) {
        return 'Production SMTP_HOST cannot be localhost';
      }
      return null;
    },
  },
  {
    name: 'SMTP_PORT',
    category: 'Transactional Email',
    requiredInProd: true,
    isSecret: false,
    clientSafe: false,
    description: 'Production SMTP port (587 for STARTTLS, 465 for SSL)',
    validate: (val) => {
      if (!val) return 'Missing SMTP_PORT';
      const port = parseInt(val, 10);
      if (isNaN(port) || port < 1 || port > 65535) return 'SMTP_PORT must be between 1 and 65535';
      if (![25, 465, 587, 2525, 1025].includes(port)) {
        return 'WARNING: SMTP_PORT is not a standard email port (465, 587, 25, 2525)';
      }
      return null;
    },
  },
  {
    name: 'SMTP_USER',
    category: 'Transactional Email',
    requiredInProd: true,
    isSecret: false,
    clientSafe: false,
    description: 'SMTP authentication username',
  },
  {
    name: 'SMTP_PASS',
    category: 'Transactional Email',
    requiredInProd: true,
    isSecret: true,
    clientSafe: false,
    description: 'SMTP authentication password or API key',
    validate: (val) => {
      if (!val || val.trim().length === 0) return 'Missing SMTP_PASS';
      return null;
    },
  },
  {
    name: 'SMTP_ADMIN_EMAIL',
    category: 'Transactional Email',
    requiredInProd: true,
    isSecret: false,
    clientSafe: false,
    description: 'Verified sender email address for transactional communications',
    validate: (val) => {
      if (!val) return 'Missing SMTP_ADMIN_EMAIL';
      if (!isValidEmail(val)) return 'SMTP_ADMIN_EMAIL must be a valid email address';
      return null;
    },
  },

  // 6. ONDC BECKN PROTOCOL INTEGRATIONS
  {
    name: 'ONDC_ENABLED',
    category: 'ONDC Network Adapter',
    requiredInProd: false,
    isSecret: false,
    clientSafe: false,
    description: 'Enable ONDC Beckn v1.2 discovery and quotation ingestion',
    validate: (val) => {
      if (!val) return null;
      if (val !== 'true' && val !== 'false') return 'ONDC_ENABLED must be "true" or "false"';
      return null;
    },
  },
  {
    name: 'ONDC_ENVIRONMENT',
    category: 'ONDC Network Adapter',
    requiredInProd: false,
    isSecret: false,
    clientSafe: false,
    description: 'ONDC environment target (STAGING | PREPROD | PROD | MOCK)',
    validate: (val) => {
      if (!val) return null;
      const valid = ['STAGING', 'PREPROD', 'PROD', 'MOCK'];
      if (!valid.includes(val.toUpperCase())) return `Expected one of: ${valid.join(', ')}`;
      return null;
    },
  },
  {
    name: 'ONDC_SUBSCRIBER_ID',
    category: 'ONDC Network Adapter',
    requiredInProd: false,
    isSecret: false,
    clientSafe: false,
    description: 'Registered ONDC BAP subscriber ID (e.g., bap.otp.in)',
  },
  {
    name: 'ONDC_SIGNING_PRIVATE_KEY_PEM',
    category: 'ONDC Network Adapter',
    requiredInProd: false,
    isSecret: true,
    clientSafe: false,
    description: 'Ed25519 32-byte Base64/PEM private key for Beckn request signatures',
  },
  {
    name: 'ONDC_GATEWAY_URL',
    category: 'ONDC Network Adapter',
    requiredInProd: false,
    isSecret: false,
    clientSafe: false,
    description: 'ONDC central gateway URL for broadcast searches',
    validate: (val) => {
      if (!val) return null;
      if (!isValidUrl(val, true)) return 'ONDC_GATEWAY_URL must be an HTTPS URL';
      return null;
    },
  },

  // 7. STATUTORY GST & CORPORATE VERIFICATION
  {
    name: 'GST_VERIFICATION_API_URL',
    category: 'Statutory GST Engine',
    requiredInProd: false,
    isSecret: false,
    clientSafe: false,
    description: 'Official GSTN / GSP API gateway endpoint for live taxpayer verification',
    validate: (val) => {
      if (!val) return null;
      if (!isValidUrl(val)) return 'GST_VERIFICATION_API_URL must be a valid URL';
      return null;
    },
  },
  {
    name: 'GST_VERIFICATION_API_KEY',
    category: 'Statutory GST Engine',
    requiredInProd: false,
    isSecret: true,
    clientSafe: false,
    description: 'GSP / GSTN API authorization key',
  },

  // 8. DISASTER RECOVERY & BACKUP ENCRYPTION
  {
    name: 'OTP_BACKUP_ENCRYPTION_KEY',
    category: 'Disaster Recovery & PITR',
    requiredInProd: true,
    isSecret: true,
    clientSafe: false,
    description: 'AES-256 PBKDF2 passphrase for automated database backup dumps',
    validate: (val) => {
      if (!val) return 'Missing OTP_BACKUP_ENCRYPTION_KEY';
      if (val.length < 16) return 'OTP_BACKUP_ENCRYPTION_KEY must be at least 16 characters for AES-256';
      return null;
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PARSER & VALIDATION RUNNER
// ─────────────────────────────────────────────────────────────────────────────

export function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (match) {
      let val = match[2].trim();
      // Strip outer quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[match[1]] = val;
    }
  }

  return result;
}

export function maskSecret(val: string): string {
  if (!val) return '[EMPTY]';
  if (val.length <= 8) return '****';
  return `${val.substring(0, 4)}...${val.substring(val.length - 4)}`;
}

export interface ValidationReport {
  targetEnv: TargetEnvironment;
  totalChecked: number;
  passCount: number;
  warnCount: number;
  errorCount: number;
  issues: ValidationIssue[];
  isProductionReady: boolean;
  scorePercent: number;
}

export function validateEnvironment(
  rawEnv: Record<string, string>,
  targetEnv: TargetEnvironment = 'production',
  strictMode = false
): ValidationReport {
  const issues: ValidationIssue[] = [];
  let passCount = 0;
  let warnCount = 0;
  let errorCount = 0;

  // 1. Check for illegal server secrets exposed with VITE_ prefix
  for (const key of Object.keys(rawEnv)) {
    if (key.startsWith('VITE_')) {
      const lower = key.toLowerCase();
      if (
        lower.includes('secret') ||
        lower.includes('service_role') ||
        lower.includes('password') ||
        lower.includes('private_key') ||
        lower.includes('auth_token')
      ) {
        issues.push({
          variable: key,
          level: 'ERROR',
          category: 'Secret Leakage Prevention',
          message: `CRITICAL LEAK RISK: Sensitive secret "${key}" is prefixed with "VITE_" and would be baked into the public client JavaScript bundle.`,
          recommendation: `Rename or move "${key}" to backend Edge functions/server environment variables without the "VITE_" prefix.`,
        });
        errorCount++;
      }
    }
  }

  // 2. Evaluate all defined rules
  for (const rule of ENVIRONMENT_RULES) {
    const val = rawEnv[rule.name];
    const isProvided = val !== undefined && val !== '';

    if (rule.requiredInProd && targetEnv === 'production' && !isProvided) {
      issues.push({
        variable: rule.name,
        level: 'ERROR',
        category: rule.category,
        message: `Mandatory production environment variable "${rule.name}" is missing or empty.`,
        recommendation: `Define ${rule.name} (${rule.description}).`,
      });
      errorCount++;
      continue;
    }

    if (isProvided && rule.validate) {
      const errorMsg = rule.validate(val, rawEnv, targetEnv);
      if (errorMsg) {
        const isWarning = errorMsg.startsWith('WARNING:');
        if (isWarning && !strictMode) {
          issues.push({
            variable: rule.name,
            level: 'WARN',
            category: rule.category,
            message: errorMsg.replace('WARNING: ', ''),
            recommendation: `Review ${rule.name} setting for ${targetEnv} safety.`,
          });
          warnCount++;
        } else {
          issues.push({
            variable: rule.name,
            level: 'ERROR',
            category: rule.category,
            message: errorMsg.replace('WARNING: ', ''),
            recommendation: `Fix ${rule.name} formatting or value.`,
          });
          errorCount++;
        }
        continue;
      }
    }

    if (isProvided) {
      passCount++;
    }
  }

  const totalEvaluated = ENVIRONMENT_RULES.length;
  const isProductionReady = errorCount === 0 && (strictMode ? warnCount === 0 : true);
  const score = Math.max(0, Math.round(((totalEvaluated - errorCount - (warnCount * 0.5)) / totalEvaluated) * 100));

  return {
    targetEnv,
    totalChecked: totalEvaluated,
    passCount,
    warnCount,
    errorCount,
    issues,
    isProductionReady,
    scorePercent: score,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI RUNNER & PRETTY PRINTER
// ─────────────────────────────────────────────────────────────────────────────

function printCliBanner() {
  console.log('\x1b[36m=================================================================\x1b[0m');
  console.log('\x1b[36m  OTP Platform — Production Environment Integrity Validator\x1b[0m');
  console.log('\x1b[36m=================================================================\x1b[0m');
}

function generateSampleEnv(): string {
  const lines: string[] = [
    '# =============================================================================',
    '# OTP Platform — Production Release Candidate Environment Template',
    '# Generated automatically via scripts/validate-prod-env.ts --sample',
    '# =============================================================================',
    '',
  ];

  let currentCat = '';
  for (const rule of ENVIRONMENT_RULES) {
    if (rule.category !== currentCat) {
      currentCat = rule.category;
      lines.push(`\n# --- ${currentCat.toUpperCase()} ---`);
    }
    lines.push(`# ${rule.description} (Required: ${rule.requiredInProd ? 'YES' : 'NO'}, Secret: ${rule.isSecret ? 'YES' : 'NO'})`);
    lines.push(`${rule.name}=`);
  }

  return lines.join('\n');
}

export function runCli() {
  const args = process.argv.slice(2);

  if (args.includes('--sample')) {
    console.log(generateSampleEnv());
    process.exit(0);
  }

  const isJson = args.includes('--json');
  const isStrict = args.includes('--strict');
  
  let targetEnv: TargetEnvironment = 'production';
  const envIdx = args.findIndex((a) => a === '--target-env' || a === '-e');
  if (envIdx !== -1 && args[envIdx + 1]) {
    targetEnv = args[envIdx + 1].toLowerCase() as TargetEnvironment;
  }

  let envFilePath: string | null = null;
  const fileIdx = args.findIndex((a) => a === '--env-file' || a === '-f');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    envFilePath = args[fileIdx + 1];
  }

  // Load environment variables
  let loadedEnv: Record<string, string> = { ...process.env as Record<string, string> };

  if (envFilePath) {
    const resolvedPath = path.resolve(process.cwd(), envFilePath);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`\x1b[31m[ERROR] Environment file not found: ${resolvedPath}\x1b[0m`);
      process.exit(1);
    }
    const content = fs.readFileSync(resolvedPath, 'utf8');
    const parsed = parseEnvContent(content);
    loadedEnv = { ...loadedEnv, ...parsed };
  } else {
    // Check standard files if no explicit file passed
    const defaultFiles = ['.env.production', '.env.prod', '.env'];
    for (const df of defaultFiles) {
      const p = path.resolve(process.cwd(), df);
      if (fs.existsSync(p)) {
        const parsed = parseEnvContent(fs.readFileSync(p, 'utf8'));
        loadedEnv = { ...parsed, ...loadedEnv };
        break;
      }
    }
  }

  const report = validateEnvironment(loadedEnv, targetEnv, isStrict);

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.isProductionReady ? 0 : 1);
  }

  printCliBanner();
  console.log(`Target Environment : \x1b[1m${report.targetEnv.toUpperCase()}\x1b[0m`);
  console.log(`Strict Policy Mode : ${isStrict ? '\x1b[33mENABLED\x1b[0m' : '\x1b[90mDISABLED\x1b[0m'}`);
  console.log(`Config Source      : ${envFilePath ? envFilePath : 'process.env & standard .env'}`);
  console.log('');

  // Grouped breakdown
  const categories = Array.from(new Set(ENVIRONMENT_RULES.map((r) => r.category)));

  for (const cat of categories) {
    console.log(`\x1b[1m[${cat}]\x1b[0m`);
    const catRules = ENVIRONMENT_RULES.filter((r) => r.category === cat);
    for (const rule of catRules) {
      const val = loadedEnv[rule.name];
      const issue = report.issues.find((i) => i.variable === rule.name);
      const isProvided = val !== undefined && val !== '';

      if (issue) {
        const color = issue.level === 'ERROR' ? '\x1b[31m' : '\x1b[33m';
        const symbol = issue.level === 'ERROR' ? 'FAIL' : 'WARN';
        console.log(`  ${color}[${symbol}]\x1b[0m ${rule.name.padEnd(28)} : ${issue.message}`);
        console.log(`         \x1b[90m↳ Action: ${issue.recommendation}\x1b[0m`);
      } else if (isProvided) {
        const displayVal = rule.isSecret ? maskSecret(val) : val;
        console.log(`  \x1b[32m[PASS]\x1b[0m ${rule.name.padEnd(28)} : \x1b[90m${displayVal}\x1b[0m`);
      } else {
        console.log(`  \x1b[90m[SKIP]\x1b[0m ${rule.name.padEnd(28)} : \x1b[90m(Unset optional)\x1b[0m`);
      }
    }
    console.log('');
  }

  // Summary Scorecard
  console.log('\x1b[36m=================================================================\x1b[0m');
  console.log(`  VALIDATION SCORE: ${report.scorePercent}% | Passed: ${report.passCount} | Warn: ${report.warnCount} | Errors: ${report.errorCount}`);
  if (report.isProductionReady) {
    console.log('  \x1b[32m[VERDICT: APPROVED] Environment is hardened and ready for Release Candidate deployment.\x1b[0m');
  } else {
    console.log('  \x1b[31m[VERDICT: REJECTED] Critical configuration issues detected. Resolve errors before promotion.\x1b[0m');
  }
  console.log('\x1b[36m=================================================================\x1b[0m\n');

  process.exit(report.isProductionReady ? 0 : 1);
}

// Auto-run if executed directly
if (process.argv[1] && (process.argv[1].endsWith('validate-prod-env.ts') || process.argv[1].endsWith('validate-prod-env.js'))) {
  runCli();
}
