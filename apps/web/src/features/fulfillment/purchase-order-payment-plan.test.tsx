import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PurchaseOrderSummary } from './types/fulfillment';
import { PurchaseOrderDetailPage } from './pages/PurchaseOrderDetailPage';
import { fetchPoInvoicingSummary, fetchPoLineItems, fetchPurchaseOrder } from './api/purchase-orders';
import {
  fetchCreditDebitNotesByPo,
  fetchPaymentsByPo,
  fetchPoChangeOrdersApi,
  getPoSettlementSummary,
} from './api/payments';
import { fetchWorkOrderByPo } from './api/work-orders';

vi.mock('react-router-dom', () => {
  const ReactLib = require('react');
  return {
    Link: ({ children, to }: { children?: React.ReactNode; to?: string }) =>
      ReactLib.createElement('a', { href: typeof to === 'string' ? to : '#' }, children),
    useNavigate: () => () => {},
    useLocation: () => ({ pathname: '/purchase-orders/po-1', search: '', hash: '', state: null, key: 'k' }),
    useSearchParams: () => [new URLSearchParams(), () => {}],
  };
});

vi.mock('@/features/lifecycle', () => ({
  ProcurementStageNavigator: () => null,
}));

vi.mock('./components/FivePointMilestoneStepper', () => ({
  FivePointMilestoneStepper: () => null,
}));

vi.mock('./components/SupplierMilestoneStepper', () => ({
  SupplierMilestoneStepper: () => null,
}));

vi.mock('./components/DeliveryInspectionPanel', () => ({
  DeliveryInspectionPanel: () => null,
}));

vi.mock('./components/InvoicePaymentPanel', () => ({
  InvoicePaymentPanel: () => null,
}));

vi.mock('./components/SettlementCta', () => ({
  CompletionBlockersNotice: () => null,
  SettlementCta: () => null,
}));

vi.mock('./components/ChangeOrderModal', () => ({
  ChangeOrderModal: () => null,
}));

vi.mock('@/features/documents/components/IssuedProcurementPrintDocument', () => ({
  IssuedProcurementPrintDocument: () => null,
}));

vi.mock('./api/purchase-orders', () => ({
  cancelPurchaseOrder: vi.fn(),
  fetchPoInvoicingSummary: vi.fn(),
  fetchPoLineItems: vi.fn(),
  fetchPurchaseOrder: vi.fn(),
  updatePurchaseOrderStatus: vi.fn(),
}));

vi.mock('./api/payments', () => ({
  getPoSettlementSummary: vi.fn(),
  generatePoSettlementCertificate: vi.fn(),
  exportTallyPaymentVoucherXml: vi.fn(),
  exportZohoPaymentReceiptJson: vi.fn(),
  reversePaymentAllocation: vi.fn(),
  issueCreditDebitNote: vi.fn(),
  fetchCreditDebitNotesByPo: vi.fn(),
  fetchVendorSettlementStatement: vi.fn(),
  fetchPaymentsByPo: vi.fn(),
  fetchPoChangeOrdersApi: vi.fn(),
}));

vi.mock('./api/work-orders', () => ({
  createWorkOrder: vi.fn(),
  fetchWorkOrderByPo: vi.fn(),
  updateWorkOrderProgress: vi.fn(),
}));

vi.mock('./api/invoices', () => ({
  fetchInvoicesByWorkOrder: vi.fn(),
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
    el.removeAttribute = (name: string) => el.attributes.delete(name);
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

function order(schedule: PurchaseOrderSummary['paymentSchedule']): PurchaseOrderSummary {
  return {
    id: 'po-1',
    poNumber: 'PO-100',
    status: 'ISSUED',
    totalAmount: 118000,
    currency: 'INR',
    supplierId: 'sup-1',
    rfqId: 'rfq-1',
    organizationId: 'org-1',
    issuedAt: '2026-09-01T00:00:00.000Z',
    acknowledgedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    rfqTitle: 'Commercial pump supply',
    supplierName: 'FluidTech',
    buyerOrgName: 'AeroTech Components',
    paymentStructure: 'MILESTONE',
    paymentTermsText: '40/60 milestone',
    paymentSchedule: schedule,
  };
}

async function flush(times = 1) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe('PurchaseOrderDetailPage payment plan', () => {
  let root: Root | null = null;
  let container: any;

  beforeAll(() => {
    installClientDom();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWorkOrderByPo).mockResolvedValue({ ok: false, error: 'none' });
    vi.mocked(fetchPoLineItems).mockResolvedValue({ ok: true, lineItems: [] });
    vi.mocked(fetchPoInvoicingSummary).mockResolvedValue({ ok: false, error: 'none' });
    vi.mocked(getPoSettlementSummary).mockResolvedValue({ ok: false, error: 'none' });
    vi.mocked(fetchPaymentsByPo).mockResolvedValue({ ok: true, payments: [] });
    vi.mocked(fetchCreditDebitNotesByPo).mockResolvedValue({ ok: true, notes: [] });
    vi.mocked(fetchPoChangeOrdersApi).mockResolvedValue({ ok: true, changeOrders: [] });
    container = (globalThis as any).document.createElement('div');
    (globalThis as any).document.body.appendChild(container);
    root = createRoot(container);
  });

  async function renderWith(schedule: PurchaseOrderSummary['paymentSchedule']) {
    vi.mocked(fetchPurchaseOrder).mockResolvedValue({ ok: true, order: order(schedule) });
    await act(async () => {
      root!.render(React.createElement(PurchaseOrderDetailPage, { poId: 'po-1', role: 'buyer' }));
    });
    for (let i = 0; i < 15; i += 1) {
      if (findByTestId(container, 'purchase-order-detail')) return;
      await flush();
    }
    throw new Error(`Purchase order page did not render. text=${container.textContent}`);
  }

  it('renders the payment-plan block when the schedule is populated', async () => {
    await renderWith([
      { index: 1, label: 'Advance', percentage: 40, amount: 47200 },
      { index: 2, label: 'On delivery', percentage: 60, amount: 70800 },
    ]);

    const plan = findByTestId(container, 'po-payment-plan');
    expect(plan).toBeTruthy();
    expect(plan.textContent).toContain('Payment Plan');
    expect(plan.textContent).toContain('40/60 milestone');
    expect(plan.textContent).toContain('Advance');
    expect(plan.textContent).toContain('40%');
    expect(plan.textContent).toContain('On delivery');
    expect(plan.textContent).toContain('60%');
  });

  it('omits the payment-plan block when the schedule is null', async () => {
    await renderWith(null);
    expect(findByTestId(container, 'purchase-order-detail')).toBeTruthy();
    expect(container.textContent).toContain('PO-100');
    expect(findByTestId(container, 'po-payment-plan')).toBeNull();
  });

  it('omits the payment-plan block when the schedule is empty', async () => {
    await renderWith([]);
    expect(findByTestId(container, 'purchase-order-detail')).toBeTruthy();
    expect(container.textContent).toContain('PO-100');
    expect(findByTestId(container, 'po-payment-plan')).toBeNull();
  });
});
