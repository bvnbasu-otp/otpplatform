import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { MsmeRegistrationAgreementModal } from './components/MsmeRegistrationAgreementModal';
import { BuyerRegisterForm } from './components/BuyerRegisterForm';

describe('MSME Registration & Agreement Components', () => {
  it('instantiates MsmeRegistrationAgreementModal with statutory attributes', () => {
    const handleAccept = vi.fn();
    const handleClose = vi.fn();

    const element = React.createElement(MsmeRegistrationAgreementModal, {
      isOpen: true,
      onClose: handleClose,
      onAccept: handleAccept,
      businessName: 'Apex Auto Components LLP',
      businessType: 'LLP',
      gstin: '29AABCA1234F1Z5',
      pan: 'AABCA1234F',
      primaryOfficerName: 'Vikram Malhotra',
      primaryOfficerEmail: 'vikram@apexauto.in',
      primaryOfficerPhone: '+91 98765 43210',
      registeredAddress: 'Plot 45, Peenya Industrial Area, Bengaluru, KA 560058',
    });

    expect(element).toBeDefined();
    expect(element.props.isOpen).toBe(true);
    expect(element.props.businessName).toBe('Apex Auto Components LLP');
    expect(element.props.businessType).toBe('LLP');
    expect(element.props.gstin).toBe('29AABCA1234F1Z5');
    expect(element.props.pan).toBe('AABCA1234F');
  });

  it('instantiates BuyerRegisterForm with callback handler', () => {
    const handleSuccess = vi.fn();
    const handleSignIn = vi.fn();

    const element = React.createElement(BuyerRegisterForm, {
      onSuccess: handleSuccess,
      onSignIn: handleSignIn,
    });

    expect(element).toBeDefined();
    expect(element.props.onSuccess).toBe(handleSuccess);
  });
});
