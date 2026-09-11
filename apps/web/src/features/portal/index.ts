export { LoginPage } from './pages/LoginPage';
export { SignupPage } from './pages/SignupPage';
export { ResetPasswordPage } from './pages/ResetPasswordPage';
export { LegalPage } from './pages/LegalPage';
export { PortalFooter } from './components/PortalFooter';
export {
  BUYER_COPY,
  SUPPLIER_COPY,
  PORTALS,
  copyFor,
  otherSide,
  sideFromParam,
  sideParam,
} from './types/portal';
export type { PortalCopy, PortalSide } from './types/portal';
export {
  fetchServiceCategories,
  fetchServedCities,
  submitSignupRequest,
  sendVerificationCode,
  humanizeSignupError,
  normalizePhone,
} from './api/signup';
export type {
  ServiceCategory,
  SignupResult,
  SignupSubmission,
  VerificationChannel,
} from './api/signup';
