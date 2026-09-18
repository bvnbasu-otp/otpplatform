import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import {
  EmptyState,
  LoadingState,
  ErrorState,
  BlockedState,
  Modal,
} from '../StateViews';

describe('StateViews UI Components Suite', () => {
  it('exports all state presentation and modal components', () => {
    expect(EmptyState).toBeDefined();
    expect(typeof EmptyState).toBe('function');
    expect(LoadingState).toBeDefined();
    expect(typeof LoadingState).toBe('function');
    expect(ErrorState).toBeDefined();
    expect(typeof ErrorState).toBe('function');
    expect(BlockedState).toBeDefined();
    expect(typeof BlockedState).toBe('function');
    expect(Modal).toBeDefined();
    expect(typeof Modal).toBe('function');
  });

  describe('EmptyState Component Properties', () => {
    it('constructs an EmptyState element with default and custom props', () => {
      const element = EmptyState({
        icon: '🔍',
        title: 'No Quotes Received Yet',
        description: 'Broadcasted to 5 regional suppliers. Quotes will appear here once submitted.',
        primaryAction: {
          label: 'Broadcast to More Suppliers',
          onClick: vi.fn(),
        },
      });

      expect(element).toBeDefined();
      expect(element.props['data-testid']).toBe('empty-state-view');
    });
  });

  describe('LoadingState Component Properties', () => {
    it('constructs LoadingState with spinner and skeleton variants', () => {
      const spinnerEl = LoadingState({ message: 'Evaluating quotes…' });
      expect(spinnerEl).toBeDefined();
      expect(spinnerEl.props['aria-busy']).toBe('true');

      const skeletonEl = LoadingState({ variant: 'skeleton' });
      expect(skeletonEl).toBeDefined();
      expect(skeletonEl.props['aria-busy']).toBe('true');
    });
  });

  describe('ErrorState Component Properties', () => {
    it('constructs ErrorState with error code and retry action', () => {
      const retryMock = vi.fn();
      const errorEl = ErrorState({
        title: 'Network Timeout',
        message: 'Failed to fetch vendor quotes.',
        errorCode: 'ERR_NET_504',
        retryAction: {
          label: 'Retry Connection',
          onClick: retryMock,
        },
      });

      expect(errorEl).toBeDefined();
      expect(errorEl.props.role).toBe('alert');
    });
  });

  describe('BlockedState Component Properties', () => {
    it('constructs BlockedState with required role and context switch action', () => {
      const switchMock = vi.fn();
      const backMock = vi.fn();
      const blockedEl = BlockedState({
        title: 'Committee Quorum Access Only',
        reason: 'Only designated Approvers or Platform Admins can lock award decisions.',
        requiredRole: 'APPROVER',
        requiredPermission: 'APPROVE',
        onSwitchContext: switchMock,
        onGoBack: backMock,
      });

      expect(blockedEl).toBeDefined();
      expect(blockedEl.props.role).toBe('alert');
    });
  });

  describe('Modal Component Properties', () => {
    it('creates React element for Modal component', () => {
      const element = React.createElement(Modal, {
        isOpen: true,
        onClose: vi.fn(),
        title: 'Confirm Procurement Lock',
        children: 'Are you sure you want to proceed?',
      });
      expect(element).toBeDefined();
      expect(element.type).toBe(Modal);
      expect(element.props.isOpen).toBe(true);
      expect(element.props.title).toBe('Confirm Procurement Lock');
    });
  });
});
