import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EvaluationDecisionCockpit } from './components/EvaluationDecisionCockpit';
import { fetchAward, lockAndRevealAwardAtomic } from '@/features/award/api/awards';
import {
  fetchClarificationMessagesForBuyer,
  fetchInvitedLabels,
  fetchRfqStatus,
} from '@/features/clarification/api/clarification';
import { fetchPurchaseOrderByRfq } from '@/features/fulfillment/api/purchase-orders';
import { fetchMyVote, fetchVotingSummary } from '@/features/governance/api/committee-votes';
import { fetchRevealedQuotes } from '@/features/reveal/api/fetch-revealed-quotes';

const RFQ_ID = 'rfq-cockpit-branches-1';
const INDIVIDUAL_LINE = 'You decide directly. No committee vote and no quorum.';
const SOLO_LINE = 'Solo Buyer Direct Authorization — one assigned member';
const PO_LINE = 'Official Purchase Order generated.';
const PENDING_LINE =
  'The winning supplier is not yet verified, so identity reveal and the Purchase Order are pending.';
const SUPPLIER_NAME = 'Harbour Steel Works';

const harness = vi.hoisted(() => ({
  quotes: [] as Array<Record<string, unknown>>,
  refreshQuotes: async () => undefined,
  refreshScores: async () => undefined,
  recompute: async () => undefined,
}));

vi.mock('react-router-dom', () => {
  const ReactLib = require('react');
  return {
    Link: ({ children, to }: { children?: React.ReactNode; to?: string }) =>
      ReactLib.createElement('a', { href: typeof to === 'string' ? to : '#' }, children),
    useNavigate: () => () => {},
    useSearchParams: () => [new URLSearchParams(), () => {}],
  };
});

vi.mock('@/features/lifecycle', () => ({
  ProcurementStageNavigator: () => null,
}));

vi.mock('@/features/rfq/hooks/use-identity-protected-quotes', () => ({
  useIdentityProtectedQuotes: () => ({
    quotes: harness.quotes,
    isLoading: false,
    error: null,
    refresh: harness.refreshQuotes,
  }),
}));

vi.mock('./hooks/use-quote-evaluations', () => ({
  useQuoteEvaluations: () => ({
    evaluations: [],
    criteria: [],
    isLoading: false,
    isRecomputing: false,
    error: null,
    recompute: harness.recompute,
    refresh: harness.refreshScores,
  }),
}));

vi.mock('./components/CriterionBreakdownTable', () => ({
  CriterionBreakdownTable: () => null,
}));

vi.mock('./components/MobileVotingCard', () => ({
  MobileVotingCard: () => null,
}));

vi.mock('./components/EvaluationApprovalRouteBanner', () => ({
  EvaluationApprovalRouteBanner: () => null,
}));

vi.mock('@/features/reveal/components/DecisionReceipt', () => ({
  DecisionReceipt: () => null,
}));

vi.mock('@/features/rfq/components/QuoteComparisonSummaryHeader', () => ({
  QuoteComparisonSummaryHeader: () => null,
}));

vi.mock('@/features/rfq/components/IdentityProtectedQuoteComparisonTable', () => ({
  IdentityProtectedQuoteComparisonTable: () => null,
}));

vi.mock('@/features/rfq/components/QuoteBoqBottomSheet', () => ({
  QuoteBoqBottomSheet: () => null,
}));

vi.mock('@/features/procurement-os/components/MarketIntelligencePanel', () => ({
  MarketIntelligencePanel: () => null,
}));

vi.mock('@/features/procurement-os/api/fetch-market-intelligence', () => ({
  fetchMarketIntelligence: vi.fn().mockResolvedValue({ ok: true, intelligence: null }),
}));

vi.mock('@/features/clarification/components/ClarificationThread', () => ({
  ClarificationThread: () => null,
}));

vi.mock('@/features/clarification/api/clarification', () => ({
  closeClarificationForEvaluation: vi.fn(),
  fetchRfqStatus: vi.fn(),
  waiveMinQuotesAndEvaluate: vi.fn(),
  fetchInvitedLabels: vi.fn(),
  fetchClarificationMessagesForBuyer: vi.fn(),
}));

vi.mock('@/features/requirement/api/rfq-lifecycle', () => ({
  openRfq: vi.fn().mockResolvedValue({ ok: true }),
  discoverAndInvite: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/features/rfq/api/simulate-quotes', () => ({
  simulateQuotesForRfq: vi.fn(),
}));

vi.mock('@/features/award/api/awards', () => ({
  fetchAward: vi.fn(),
  lockAndRevealAwardAtomic: vi.fn(),
}));

vi.mock('@/features/governance/api/committee-votes', () => ({
  fetchMyVote: vi.fn(),
  fetchVotes: vi.fn(),
  fetchVoteTally: vi.fn(),
  fetchVotingSummary: vi.fn(),
}));

vi.mock('@/features/fulfillment/api/purchase-orders', () => ({
  fetchPurchaseOrderByRfq: vi.fn(),
}));

vi.mock('@/features/reveal/api/fetch-revealed-quotes', () => ({
  fetchRevealedQuotes: vi.fn(),
}));

function installClientDom(): void {
  if ((globalThis as { __OTP_CLIENT_DOM__?: boolean }).__OTP_CLIENT_DOM__) return;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const selection = () => ({
    anchorNode: null,
    anchorOffset: 0,
    focusNode: null,
    focusOffset: 0,
    rangeCount: 0,
    removeAllRanges() {},
    addRange() {},
  });

  function node(type: string): any {
    const el: any = {
      nodeType: type === '#text' ? 3 : type === '#comment' ? 8 : type === '#document' ? 9 : 1,
      nodeName: type === '#text' || type === '#comment' || type === '#document' ? type : String(type).toUpperCase(),
      tagName: type === '#text' || type === '#comment' || type === '#document' ? undefined : String(type).toUpperCase(),
      childNodes: [],
      attributes: new Map<string, string>(),
      className: '',
      id: '',
      value: '',
      checked: false,
      disabled: false,
      parentNode: null,
      ownerDocument: null,
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      nextSibling: null,
      previousSibling: null,
      nodeValue: null as string | null,
      _text: '',
      _listeners: new Map<string, Array<(event: any) => void>>(),
    };
    el.style = {
      setProperty(name: string, value: string) {
        el.style[name] = value;
      },
      getPropertyValue(name: string) {
        return el.style[name] ?? '';
      },
      removeProperty(name: string) {
        const previous = el.style[name] ?? '';
        delete el.style[name];
        return previous;
      },
    };
    el.setAttribute = (name: string, value: string) => {
      el.attributes.set(name, String(value));
      if (name === 'class') el.className = String(value);
      if (name === 'id') el.id = String(value);
      if (name === 'disabled') el.disabled = true;
    };
    el.getAttribute = (name: string) => (el.attributes.has(name) ? el.attributes.get(name) : null);
    el.removeAttribute = (name: string) => {
      el.attributes.delete(name);
      if (name === 'disabled') el.disabled = false;
    };
    el.hasAttribute = (name: string) => el.attributes.has(name);
    el.setAttributeNS = (_ns: string | null, name: string, value: string) => el.setAttribute(name, value);
    el.removeAttributeNS = (_ns: string | null, name: string) => el.removeAttribute(name);
    el.getAttributeNS = (_ns: string | null, name: string) => el.getAttribute(name);
    el._relink = () => {
      for (let i = 0; i < el.childNodes.length; i += 1) {
        el.childNodes[i].nextSibling = el.childNodes[i + 1] ?? null;
        el.childNodes[i].previousSibling = el.childNodes[i - 1] ?? null;
      }
    };
    el.appendChild = (child: any) => el.insertBefore(child, null);
    el.insertBefore = (child: any, ref: any) => {
      if (!child || child === el) return child;
      if (child.parentNode?.removeChild) child.parentNode.removeChild(child);
      child.parentNode = el;
      child.ownerDocument = el.nodeType === 9 ? el : el.ownerDocument;
      const index = ref ? el.childNodes.indexOf(ref) : -1;
      if (index >= 0) el.childNodes.splice(index, 0, child);
      else el.childNodes.push(child);
      el._relink();
      return child;
    };
    el.removeChild = (child: any) => {
      const index = el.childNodes.indexOf(child);
      if (index >= 0) el.childNodes.splice(index, 1);
      if (child) child.parentNode = null;
      el._relink();
      return child;
    };
    el.addEventListener = (type: string, listener: (event: any) => void, options?: boolean | { capture?: boolean }) => {
      const capture = options === true || (typeof options === 'object' && Boolean(options?.capture));
      const key = `${capture ? 'capture' : 'bubble'}:${type}`;
      const list = el._listeners.get(key) ?? [];
      list.push(listener);
      el._listeners.set(key, list);
    };
    el.removeEventListener = (type: string, listener: (event: any) => void, options?: boolean | { capture?: boolean }) => {
      const capture = options === true || (typeof options === 'object' && Boolean(options?.capture));
      const key = `${capture ? 'capture' : 'bubble'}:${type}`;
      const list = el._listeners.get(key) ?? [];
      el._listeners.set(
        key,
        list.filter((registered: (event: any) => void) => registered !== listener),
      );
    };
    el.dispatchEvent = (event: any) => {
      dispatchDomEvent(el, event?.type ?? 'click', event);
      return true;
    };
    el.focus = () => {};
    el.blur = () => {};
    el.contains = (target: any) => {
      if (target === el) return true;
      return el.childNodes.some((child: any) => child === target || (typeof child.contains === 'function' && child.contains(target)));
    };
    el.getRootNode = () => el.ownerDocument || el;
    el.compareDocumentPosition = () => 0;
    Object.defineProperty(el, 'parentElement', { get: () => el.parentNode });
    Object.defineProperty(el, 'firstChild', { get: () => el.childNodes[0] ?? null });
    Object.defineProperty(el, 'lastChild', { get: () => el.childNodes[el.childNodes.length - 1] ?? null });
    Object.defineProperty(el, 'textContent', {
      get() {
        if (el.nodeType === 3 || el.nodeType === 8) return el.nodeValue ?? '';
        if (!el.childNodes.length) return el._text;
        return el.childNodes.map((child: any) => child.textContent ?? '').join('');
      },
      set(value: string) {
        el._text = String(value ?? '');
        el.childNodes.length = 0;
      },
    });
    Object.defineProperty(el, 'innerHTML', {
      get: () => el.textContent,
      set(value: string) {
        el.textContent = String(value ?? '').replace(/<[^>]+>/g, '');
      },
    });
    return el;
  }

  const document = node('#document');
  document.nodeType = 9;
  document.defaultView = globalThis;
  document.createElement = (tag: string) => {
    const el = node(tag);
    el.ownerDocument = document;
    return el;
  };
  document.createElementNS = (_ns: string, tag: string) => document.createElement(tag);
  document.createTextNode = (text: string) => {
    const textNode = node('#text');
    textNode.nodeValue = String(text);
    textNode.ownerDocument = document;
    return textNode;
  };
  document.createComment = (text: string) => {
    const comment = node('#comment');
    comment.nodeValue = String(text);
    comment.ownerDocument = document;
    return comment;
  };
  document.getSelection = selection;
  document.querySelector = () => null;
  document.getElementById = () => null;
  document.documentElement = document.createElement('html');
  document.body = document.createElement('body');
  document.activeElement = document.body;
  document.documentElement.appendChild(document.body);

  const view = globalThis as any;
  view.document = document;
  view.window = view;
  view.getSelection = selection;
  view.HTMLElement = class HTMLElement {};
  view.Element = class Element {};
  view.Node = class Node {};
  view.HTMLIFrameElement = class HTMLIFrameElement {};
  view.SVGElement = class SVGElement {};
  (globalThis as { __OTP_CLIENT_DOM__?: boolean }).__OTP_CLIENT_DOM__ = true;
}

function dispatchDomEvent(target: any, type: string, nativeEvent?: any): void {
  const event = nativeEvent ?? {
    type,
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    cancelBubble: false,
    button: 0,
    buttons: 0,
    which: 1,
    detail: 1,
    clientX: 0,
    clientY: 0,
    screenX: 0,
    screenY: 0,
    pageX: 0,
    pageY: 0,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    relatedTarget: null,
    timeStamp: Date.now(),
    view: globalThis,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.cancelBubble = true;
    },
    stopImmediatePropagation() {
      this.cancelBubble = true;
    },
    persist() {},
    getModifierState() {
      return false;
    },
  };
  event.type = type;
  event.target = target;
  event.srcElement = target;
  const path: any[] = [];
  let current = target;
  while (current) {
    path.push(current);
    current = current.parentNode;
  }
  for (const host of path) {
    if (event.cancelBubble) break;
    event.currentTarget = host;
    event.eventPhase = 3;
    const listeners = host._listeners?.get(`bubble:${type}`) ?? [];
    for (const listener of [...listeners]) listener.call(host, event);
  }
}

function findByTestId(root: any, testId: string): any {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    if (typeof current.getAttribute === 'function' && current.getAttribute('data-testid') === testId) return current;
    const children = current.childNodes ?? [];
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
  return null;
}

function supplierQuote() {
  return {
    quoteId: 'quote-1',
    anonymousLabel: 'Supplier #01',
    version: 1,
    status: 'SUBMITTED',
    basePrice: 100000,
    gstAmount: 18000,
    transportCost: 0,
    totalCost: 118000,
    deliveryDays: 5,
    warrantyMonths: 12,
    evaluationScore: 80,
    supplierRatingAvg: 4,
    pastPerformanceScore: 70,
    experienceBand: '5-19',
    verificationStatus: 'VERIFIED',
    isGstVerified: true,
    paymentTermsDays: 30,
    submittedAt: '2026-10-01T00:00:00.000Z',
  };
}

function myVote(buyerType: 'INDIVIDUAL' | 'MSME') {
  return {
    ok: true as const,
    vote: {
      voteId: 'vote-1',
      recommendedQuoteId: 'quote-1',
      recommendedAlias: 'Supplier #01',
      choice: 'RECOMMEND',
      comment: null,
      votingPower: 1,
      buyerType,
      castAt: '2026-10-01T00:00:00.000Z',
    },
  };
}

function votingSummary(assignedMembers: number, membersVoted: number) {
  return {
    ok: true as const,
    summary: {
      assignedMembers,
      membersVoted,
      pendingMembers: Math.max(0, assignedMembers - membersVoted),
      weightCast: membersVoted,
      abstained: 0,
      opposed: 0,
      votesLockedAt: null,
      votingOpen: true,
      leader: null,
    },
  };
}

function awardResult(businessName: string | null, poId: string | null) {
  return {
    ok: true as const,
    result: {
      awardId: 'award-1',
      rfqId: RFQ_ID,
      quoteId: 'quote-1',
      status: 'REVEALED',
      revealed: true,
      poId,
      poNumber: poId ? 'PO-1001' : null,
      supplierId: businessName ? 'supplier-1' : null,
      businessName,
    },
  };
}

describe('EvaluationDecisionCockpit buyer and award branches', () => {
  let root: Root | null = null;
  let container: any;

  beforeAll(() => {
    installClientDom();
  });

  beforeEach(() => {
    harness.quotes = [];
    vi.clearAllMocks();
    vi.mocked(fetchRfqStatus).mockResolvedValue({ ok: true, status: 'EVALUATING', minQuotesRequired: 3 } as any);
    vi.mocked(fetchAward).mockResolvedValue({ ok: true, award: null } as any);
    vi.mocked(fetchPurchaseOrderByRfq).mockResolvedValue({ ok: true, poId: null } as any);
    vi.mocked(fetchInvitedLabels).mockResolvedValue({ ok: true, labels: [] } as any);
    vi.mocked(fetchClarificationMessagesForBuyer).mockResolvedValue({ ok: true, messages: [] } as any);
    vi.mocked(fetchRevealedQuotes).mockResolvedValue({ ok: true, quotes: [] } as any);
    vi.mocked(fetchMyVote).mockResolvedValue({ ok: true, vote: null } as any);
    vi.mocked(fetchVotingSummary).mockResolvedValue(votingSummary(3, 0) as any);
    vi.mocked(lockAndRevealAwardAtomic).mockResolvedValue({ ok: false, error: 'not configured' } as any);
    container = (globalThis as any).document.createElement('div');
    (globalThis as any).document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    if (container?.parentNode?.removeChild) container.parentNode.removeChild(container);
    container = null;
  });

  async function renderOnAwardTab() {
    await act(async () => {
      root?.render(React.createElement(EvaluationDecisionCockpit, { rfqId: RFQ_ID, initialTab: 'award' }));
    });
  }

  async function waitForText(snippet: string) {
    for (let i = 0; i < 40; i += 1) {
      if (String(container?.textContent ?? '').includes(snippet)) return;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    throw new Error(`Timed out waiting for ${JSON.stringify(snippet)}. Visible: ${container?.textContent}`);
  }

  async function clickTestId(testId: string) {
    let target: any = null;
    for (let i = 0; i < 40 && !target; i += 1) {
      target = findByTestId(container, testId);
      if (!target) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
      }
    }
    expect(target, `missing ${testId}. Visible: ${container?.textContent}`).toBeTruthy();
    expect(target.disabled, `${testId} is disabled`).not.toBe(true);
    await act(async () => {
      dispatchDomEvent(target, 'click');
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function awardPanelText(): string {
    return String(findByTestId(container, 'cockpit-panel-award')?.textContent ?? '');
  }

  it('shows the individual buyer line on the award tab and hides the committee quorum line', async () => {
    vi.mocked(fetchMyVote).mockResolvedValue(myVote('INDIVIDUAL') as any);
    vi.mocked(fetchVotingSummary).mockResolvedValue(votingSummary(4, 1) as any);

    await renderOnAwardTab();
    await waitForText(INDIVIDUAL_LINE);

    expect(findByTestId(container, 'cockpit-tab-award')?.getAttribute('aria-selected')).toBe('true');
    expect(findByTestId(container, 'cockpit-panel-award')).toBeTruthy();
    expect(fetchMyVote).toHaveBeenCalledWith(RFQ_ID);
    expect(awardPanelText()).toContain(INDIVIDUAL_LINE);
    expect(awardPanelText()).not.toContain('Committee Quorum Met');
    expect(awardPanelText()).not.toContain('Committee Quorum Pending');
    expect(awardPanelText()).not.toContain(SOLO_LINE);
  });

  it('shows solo authorization for a non-individual buyer with one assigned member', async () => {
    vi.mocked(fetchMyVote).mockResolvedValue(myVote('MSME') as any);
    vi.mocked(fetchVotingSummary).mockResolvedValue(votingSummary(1, 1) as any);

    await renderOnAwardTab();
    await waitForText(SOLO_LINE);

    expect(fetchMyVote).toHaveBeenCalledWith(RFQ_ID);
    expect(awardPanelText()).toContain(SOLO_LINE);
    expect(awardPanelText()).not.toContain(INDIVIDUAL_LINE);
  });

  it('shows the official purchase order sentence when the award result has a supplier name and poId', async () => {
    harness.quotes = [supplierQuote()];
    vi.mocked(lockAndRevealAwardAtomic).mockResolvedValue(awardResult(SUPPLIER_NAME, 'po-real-1') as any);

    await renderOnAwardTab();
    await clickTestId('lock-award-button');
    await clickTestId('modal-confirm-atomic-award');
    await waitForText(PO_LINE);

    expect(lockAndRevealAwardAtomic).toHaveBeenCalledWith(
      RFQ_ID,
      'quote-1',
      expect.any(String),
      true,
    );
    expect(container.textContent).toContain(SUPPLIER_NAME);
    expect(container.textContent).toContain(PO_LINE);
  });

  it('shows the pending verification sentence when the award result has no supplier name and no poId', async () => {
    harness.quotes = [supplierQuote()];
    vi.mocked(lockAndRevealAwardAtomic).mockResolvedValue(awardResult(null, null) as any);

    await renderOnAwardTab();
    await clickTestId('lock-award-button');
    await clickTestId('modal-confirm-atomic-award');
    await waitForText(PENDING_LINE);

    expect(container.textContent).toContain(PENDING_LINE);
    expect(container.textContent).not.toContain(PO_LINE);
  });

  it('shows the supplier name without claiming a purchase order when poId is absent', async () => {
    harness.quotes = [supplierQuote()];
    vi.mocked(lockAndRevealAwardAtomic).mockResolvedValue(awardResult(SUPPLIER_NAME, null) as any);

    await renderOnAwardTab();
    await clickTestId('lock-award-button');
    await clickTestId('modal-confirm-atomic-award');
    await waitForText(SUPPLIER_NAME);

    expect(container.textContent).toContain(
      `Tender awarded successfully! Winning supplier is unmasked: ${SUPPLIER_NAME}.`,
    );
    expect(container.textContent).not.toContain(PO_LINE);
  });
});
