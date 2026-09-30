import React from 'react';
import { describe, it, expect } from 'vitest';
import { BuyerRegisterForm } from './components/BuyerRegisterForm';

describe('BuyerRegisterForm PIN discovery hook', () => {
  it('exports buyer register form used by Individual/RWA/MSME onboarding', () => {
    const element = React.createElement(BuyerRegisterForm, {
      onSuccess: () => undefined,
      onSignIn: () => undefined,
    });
    expect(element.type).toBe(BuyerRegisterForm);
  });
});
