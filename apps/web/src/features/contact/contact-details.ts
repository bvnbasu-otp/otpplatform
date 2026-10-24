/**
 * Confirmed public contact details and Contact Us copy. Nothing here may be
 * extended with an address, extra phone numbers, hours or response-time
 * promises without a confirmed source.
 *
 * The categories and limits mirror the server allowlist in
 * supabase/functions/_shared/contact/enquiry.ts; a test keeps them in step.
 */

export const CONTACT_EMAIL = 'bvnbasu+otp.demo.otp.support@gmail.com';
export const CONTACT_WHATSAPP_DISPLAY = '+91 9972967530';
export const CONTACT_WHATSAPP_HREF = 'https://wa.me/919972967530';

export const CONTACT_COPY = {
  heading: 'Contact Us',
  intro:
    'Have a question about procurement, supplier onboarding, or using OTP? Choose the enquiry type that best describes your question and send us a message.',
  whatsappLabel: 'Contact us on WhatsApp',
  response: 'We’ll review your enquiry and respond as soon as we can.',
  sensitiveDataGuidance:
    'Please do not include passwords, one-time codes, payment card details or government ID numbers.',
} as const;

export const CONTACT_CATEGORIES = [
  { code: 'BUYER', label: 'Buyer enquiry — Individual, RWA or MSME' },
  { code: 'SUPPLIER_ONBOARDING', label: 'Supplier onboarding' },
  { code: 'BUSINESS_PARTNERSHIP', label: 'Business or partnership enquiry' },
  { code: 'TECHNICAL_SUPPORT', label: 'Technical support' },
  { code: 'OTHER', label: 'Other' },
] as const;

export type ContactCategoryCode = (typeof CONTACT_CATEGORIES)[number]['code'];

export const CONTACT_LIMITS = {
  name: 120,
  email: 254,
  phone: 20,
  organisation: 160,
  subject: 160,
  messageMin: 10,
  message: 4000,
} as const;
