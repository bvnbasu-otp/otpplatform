import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RfqApprovalStage } from '@otp/domain';
import { AwardPage } from './pages/AwardPage';
import {
  evaluateApprovalRoute,
  fetchApproval,
  fetchRfqApprovalStages,
  fetchUserActiveDelegations,
} from './api/approval';
import { fetchAward } from './api/awards';
import { fetchIdentityProtectedQuotesForVote } from '@/features/governance/api/rfq-governance';
import { fetchVoteTally, fetchVotes, fetchVotingSummary } from '@/features/governance/api/committee-votes';
import { supabase } from '@/lib/supabase';

const RFQ_ID = 'rfq-approval-route-1';

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { id: 'buyer-1', org_role: 'OWNER' } }),
}));

vi.mock('react-router-dom', () => {
  const ReactLib = require('react');
  return {
    Link: ({ children, to }: { children?: React.ReactNode; to?: string }) =>
      ReactLib.createElement('a', { href: typeof to === 'string' ? to : '#' }, children),
    useNavigate: () => () => {},
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'k' }),
    useSearchParams: () => [new URLSearchParams(), () => {}],
  };
});

vi.mock('@/features/lifecycle', () => ({
  ProcurementStageNavigator: () => null,
}));

vi.mock('@/features/rfq/components', () => ({
  CancelRfqModal: () => null,
}));

vi.mock('@/features/reveal/components/DecisionReceipt', () => ({
  DecisionReceipt: () => null,
}));

vi.mock('@/features/documents/components/IssuedProcurementPrintDocument', () => ({
  IssuedProcurementPrintDocument: () => null,
}));

vi.mock('@/features/documents/components/IssuedDecisionReceiptFromSnapshot', () => ({
  IssuedDecisionReceiptFromSnapshot: () => null,
}));

vi.mock('@/features/governance/components/MultiTierApprovalGatePanel', () => {
  const ReactLib = require('react');
  return {
    MultiTierApprovalGatePanel: ({ stages }: { stages?: Array<{ id: string }> }) =>
      ReactLib.createElement(
        'div',
        { 'data-testid': 'approval-stages' },
        (stages ?? []).map((stage) => stage.id).join(','),
      ),
  };
});

vi.mock('@/features/governance/components/WeightedTallyTable', () => ({
  WeightedTallyTable: () => null,
}));

vi.mock('@/features/fulfillment/api/purchase-orders', () => ({
  fetchPurchaseOrderByRfq: vi.fn().mockResolvedValue({ ok: true, poId: null }),
}));

vi.mock('@/features/reveal/api/reveal', () => ({
  revealSupplier: vi.fn(),
}));

vi.mock('@/features/reveal/api/fetch-revealed-quotes', () => ({
  fetchRevealedQuotes: vi.fn().mockResolvedValue({ ok: true, quotes: [] }),
}));

vi.mock('./api/approval', () => ({
  approve: vi.fn(),
  evaluateApprovalRoute: vi.fn(),
  fetchApproval: vi.fn(),
  requestApproval: vi.fn(),
  fetchRfqApprovalStages: vi.fn(),
  fetchUserActiveDelegations: vi.fn(),
  submitTierApprovalAtomic: vi.fn(),
}));

vi.mock('./api/awards', () => ({
  fetchAward: vi.fn(),
  lockAward: vi.fn(),
  unlockAwardDecision: vi.fn(),
}));

vi.mock('@/features/governance/api/rfq-governance', () => ({
  fetchIdentityProtectedQuotesForVote: vi.fn(),
}));

vi.mock('@/features/governance/api/committee-votes', () => ({
  fetchVotes: vi.fn(),
  fetchVoteTally: vi.fn(),
  fetchVotingSummary: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
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
    };
    el.getAttribute = (name: string) => (el.attributes.has(name) ? el.attributes.get(name) : null);
    el.removeAttribute = (name: string) => {
      el.attributes.delete(name);
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
    el.addEventListener = () => {};
    el.removeEventListener = () => {};
    el.dispatchEvent = () => true;
    el.focus = () => {};
    el.blur = () => {};
    el.contains = (target: any) => {
      if (target === el) return true;
      return el.childNodes.some((child: any) => child === target || (typeof child.contains === 'function' && child.contains(target)));
    };
    el.getRootNode = () => el.ownerDocument || el;
    el.compareDocumentPosition = () => 0;
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

function quote(overrides: Partial<{ quoteId: string; totalCost: number; anonymousLabel: string }> = {}) {
  return {
    quoteId: 'quote-win-1',
    anonymousLabel: 'Supplier A',
    totalCost: 125000,
    evaluationScore: 92,
    deliveryDays: 7,
    warrantyMonths: 12,
    ...overrides,
  };
}

function stage(id: string): RfqApprovalStage {
  return {
    id,
    rfqId: RFQ_ID,
    organizationId: 'org-1',
    tierLevel: 'TIER_1_MANAGER',
    stageOrder: 1,
    status: 'PENDING',
    thresholdMinAmount: 0,
    thresholdMaxAmount: 500000,
    procurementAmount: 125000,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

async function flush(times = 1) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe('AwardPage approval-route effect', () => {
  let root: Root | null = null;
  let container: any;
  let stageCount = 0;

  beforeAll(() => {
    installClientDom();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    stageCount = 0;
    vi.mocked(fetchAward).mockResolvedValue({ ok: true, award: null });
    vi.mocked(fetchApproval).mockResolvedValue({ ok: true, approval: null });
    vi.mocked(fetchIdentityProtectedQuotesForVote).mockResolvedValue({ ok: true, quotes: [quote()] });
    vi.mocked(fetchVotes).mockResolvedValue({ ok: true, votes: [] });
    vi.mocked(fetchVoteTally).mockResolvedValue({ ok: true, tally: [] });
    vi.mocked(fetchVotingSummary).mockResolvedValue({ ok: true, summary: null });
    vi.mocked(fetchUserActiveDelegations).mockResolvedValue({ ok: true, delegations: [] });
    vi.mocked(fetchRfqApprovalStages).mockImplementation(async () => {
      stageCount += 1;
      return { ok: true, stages: [stage(`stage-${stageCount}`)] };
    });
    vi.mocked(supabase.from).mockImplementation(() => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data: { id: RFQ_ID, organization_id: 'org-1', created_by: 'creator-1' },
            error: null,
          }),
      };
      return chain;
    });
    container = (globalThis as any).document.createElement('div');
    (globalThis as any).document.body.appendChild(container);
    root = createRoot(container);
  });

  async function renderPage() {
    await act(async () => {
      root!.render(React.createElement(AwardPage, { rfqId: RFQ_ID }));
    });
  }

  async function settleLoaded() {
    for (let i = 0; i < 20; i += 1) {
      if (findByTestId(container, 'award-page')) return;
      await flush();
    }
    throw new Error('Award page did not finish loading');
  }

  it('evaluates the winning quote once after loading and refreshes stages on success', async () => {
    let releaseEvaluation: (value: { ok: true; result: Record<string, unknown> }) => void = () => {};
    const evaluation = new Promise<{ ok: true; result: Record<string, unknown> }>((resolve) => {
      releaseEvaluation = resolve;
    });
    vi.mocked(evaluateApprovalRoute).mockImplementation(() => evaluation);
    let releaseQuotes: (value: { ok: true; quotes: Array<ReturnType<typeof quote>> }) => void = () => {};
    const quotesGate = new Promise<{ ok: true; quotes: Array<ReturnType<typeof quote>> }>((resolve) => {
      releaseQuotes = resolve;
    });
    vi.mocked(fetchIdentityProtectedQuotesForVote).mockImplementation(() => quotesGate);

    await renderPage();
    await flush(2);
    expect(findByTestId(container, 'award-page')).toBeNull();
    expect(evaluateApprovalRoute).not.toHaveBeenCalled();

    await act(async () => {
      releaseQuotes({ ok: true, quotes: [quote()] });
    });
    await settleLoaded();
    await flush(4);

    expect(findByTestId(container, 'award-page')).toBeTruthy();
    expect(evaluateApprovalRoute).toHaveBeenCalledTimes(1);
    expect(evaluateApprovalRoute).toHaveBeenCalledWith(RFQ_ID, 125000);
    expect(fetchRfqApprovalStages.mock.calls.length).toBeGreaterThanOrEqual(2);

    const stagesBeforeRefresh = findByTestId(container, 'approval-stages')?.textContent;
    const stageCallsBeforeRefresh = fetchRfqApprovalStages.mock.calls.length;
    expect(stagesBeforeRefresh).toBe(`stage-${stageCallsBeforeRefresh}`);

    releaseEvaluation({ ok: true, result: { stamped: true } });
    await flush(4);

    expect(evaluateApprovalRoute).toHaveBeenCalledTimes(1);
    expect(fetchRfqApprovalStages.mock.calls.length).toBe(stageCallsBeforeRefresh + 1);
    expect(findByTestId(container, 'approval-stages')?.textContent).toBe(`stage-${stageCallsBeforeRefresh + 1}`);

    await act(async () => {
      root!.render(React.createElement(AwardPage, { rfqId: RFQ_ID }));
    });
    await flush(3);
    expect(evaluateApprovalRoute).toHaveBeenCalledTimes(1);
  });

  it('keeps the loaded stages when approval-route evaluation fails', async () => {
    vi.mocked(evaluateApprovalRoute).mockResolvedValue({ ok: false, error: 'buyer authority required' });

    await renderPage();
    await settleLoaded();
    await flush(6);

    const stageCallsAfterFailure = fetchRfqApprovalStages.mock.calls.length;
    expect(evaluateApprovalRoute).toHaveBeenCalledTimes(1);
    expect(evaluateApprovalRoute).toHaveBeenCalledWith(RFQ_ID, 125000);
    expect(findByTestId(container, 'approval-stages')?.textContent).toBe(`stage-${stageCallsAfterFailure}`);

    await flush(4);
    expect(fetchRfqApprovalStages.mock.calls.length).toBe(stageCallsAfterFailure);
    expect(findByTestId(container, 'approval-stages')?.textContent).toBe(`stage-${stageCallsAfterFailure}`);
  });

  it('does not evaluate when an award already exists', async () => {
    vi.mocked(fetchAward).mockResolvedValue({
      ok: true,
      award: {
        id: 'award-1',
        rfqId: RFQ_ID,
        quoteId: 'quote-win-1',
        awardedBy: 'buyer-1',
        justificationText: 'Locked on merit.',
        status: 'LOCKED',
        awardedAt: '2026-09-25T09:30:00.000Z',
        revealedAt: null,
        votesLockedAt: null,
      },
    });

    await renderPage();
    await settleLoaded();
    await flush(4);

    expect(findByTestId(container, 'award-locked')).toBeTruthy();
    expect(evaluateApprovalRoute).not.toHaveBeenCalled();
  });

  it('does not evaluate a winning quote that has no id or a non-positive total', async () => {
    vi.mocked(fetchIdentityProtectedQuotesForVote).mockResolvedValue({
      ok: true,
      quotes: [quote({ quoteId: '', totalCost: 125000 })],
    });
    await renderPage();
    await settleLoaded();
    await flush(4);
    expect(findByTestId(container, 'award-form')).toBeTruthy();
    expect(container.textContent).toContain(`₹${(125000).toLocaleString('en-IN')}`);
    expect(evaluateApprovalRoute).not.toHaveBeenCalled();

    vi.mocked(fetchIdentityProtectedQuotesForVote).mockResolvedValue({
      ok: true,
      quotes: [quote({ quoteId: 'quote-zero', totalCost: 0, anonymousLabel: 'Zero Cost Supplier' })],
    });
    await act(async () => {
      root!.render(React.createElement(AwardPage, { rfqId: 'rfq-zero-cost' }));
    });
    for (let i = 0; i < 12 && !String(container.textContent).includes('Zero Cost Supplier'); i += 1) {
      await flush();
    }
    expect(container.textContent).toContain('Zero Cost Supplier');
    expect(container.textContent).toContain(`₹${(0).toLocaleString('en-IN')}`);
    expect(fetchIdentityProtectedQuotesForVote).toHaveBeenCalledWith('rfq-zero-cost');
    expect(evaluateApprovalRoute).not.toHaveBeenCalled();
  });
});
