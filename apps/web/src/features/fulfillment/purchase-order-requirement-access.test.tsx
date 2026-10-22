import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { RoleContext } from '@/features/roles/api/roles';
import { PurchaseOrderList } from './components/PurchaseOrderList';
import { PurchaseOrdersPage } from './pages/PurchaseOrdersPage';
import type { PurchaseOrderSummary } from './types/fulfillment';

const harness = vi.hoisted(() => ({
  context: null as RoleContext | null,
}));

vi.mock('@/features/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'buyer@example.com' },
    isLoading: false,
  }),
}));

vi.mock('@/features/roles', () => ({
  useRoleContext: () => ({
    context: harness.context,
    isLoading: false,
    refresh: async () => {},
    switchTo: async () => ({ ok: true }),
    switchOrg: async () => ({ ok: true }),
  }),
}));

vi.mock('./api/purchase-orders', () => ({
  fetchPurchaseOrders: vi.fn(async () => ({ ok: true, orders: [] })),
}));

vi.mock('@/features/reporting', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/features/reporting');
  return {
    ...actual,
    PeriodFilterBar: () => null,
    AnalyticsCards: () => null,
    CategorySpendChart: () => null,
    DrillDownSection: () => null,
    PrintableProcurementReport: () => null,
  };
});

function context(overrides: Partial<RoleContext> = {}): RoleContext {
  return {
    signedIn: true,
    profileId: 'profile-1',
    side: 'BUYER',
    isPlatformAdmin: false,
    isFounder: false,
    needsOnboarding: false,
    activeRole: {
      code: 'OWNER',
      side: 'BUYER',
      label: 'Buyer',
      description: 'Customer buyer',
      permissions: ['READ', 'WRITE', 'AWARD'],
    },
    roles: [],
    organizations: [],
    orgRole: 'OWNER',
    organizationId: null,
    organizationName: null,
    buyerType: 'INDIVIDUAL',
    committeeRfqCount: 0,
    supplierId: null,
    fullName: 'Asha Buyer',
    title: null,
    avatarUrl: null,
    email: 'asha@example.com',
    phone: null,
    ...overrides,
  };
}

function issuedOrder(): PurchaseOrderSummary {
  return {
    id: 'po-1',
    poNumber: 'PO-1001',
    status: 'ISSUED',
    totalAmount: 1500,
    currency: 'INR',
    supplierId: 'supplier-1',
    rfqId: 'rfq-1',
    issuedAt: '2026-10-01T00:00:00.000Z',
    acknowledgedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    supplierName: 'Acme Supplies',
  };
}

function renderList(props: React.ComponentProps<typeof PurchaseOrderList>): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <PurchaseOrderList {...props} />
    </MemoryRouter>,
  );
}

function installDocument() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if ((globalThis as { __OTP_PO_DOM__?: boolean }).__OTP_PO_DOM__) return;
  const selection = () => ({
    removeAllRanges() {},
    addRange() {},
  });

  function node(type: string): any {
    const el: any = {
      nodeType: type === '#text' ? 3 : type === '#comment' ? 8 : type === '#document' ? 9 : 1,
      nodeName: type.startsWith('#') ? type : String(type).toUpperCase(),
      tagName: type.startsWith('#') ? undefined : String(type).toUpperCase(),
      childNodes: [],
      attributes: new Map<string, string>(),
      className: '',
      id: '',
      parentNode: null,
      ownerDocument: null,
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      nextSibling: null,
      previousSibling: null,
      nodeValue: null as string | null,
      style: {},
    };
    el.setAttribute = (name: string, value: string) => {
      el.attributes.set(name, String(value));
      if (name === 'class') el.className = String(value);
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
    el.focus = () => {};
    el.contains = (target: any) => target === el || el.childNodes.some((child: any) => child === target || child.contains?.(target));
    Object.defineProperty(el, 'firstChild', { get: () => el.childNodes[0] ?? null });
    Object.defineProperty(el, 'lastChild', { get: () => el.childNodes[el.childNodes.length - 1] ?? null });
    Object.defineProperty(el, 'textContent', {
      get() {
        if (el.nodeType === 3 || el.nodeType === 8) return el.nodeValue ?? '';
        return el.childNodes.map((child: any) => child.textContent ?? '').join('');
      },
      set(value: string) {
        el.childNodes.length = 0;
        el.nodeValue = String(value ?? '');
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
  document.querySelectorAll = () => [];
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
  view.HTMLIFrameElement = class HTMLIFrameElement {};
  view.SVGElement = class SVGElement {};
  view.Element = class Element {};
  view.Node = class Node {};
  (globalThis as { __OTP_PO_DOM__?: boolean }).__OTP_PO_DOM__ = true;
}

function findHtml(root: any): string {
  const parts: string[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (node.nodeType === 3) {
      parts.push(node.nodeValue ?? '');
      return;
    }
    if (node.nodeValue) parts.push(String(node.nodeValue));
    if (typeof node.getAttribute === 'function') {
      const testId = node.getAttribute('data-testid');
      const href = node.getAttribute('href');
      if (testId) parts.push(` data-testid="${testId}"`);
      if (href) parts.push(` href="${href}"`);
    }
    for (const child of node.childNodes ?? []) walk(child);
  };
  walk(root);
  return parts.join(' ');
}

async function renderPage(role: 'buyer' | 'supplier', roleContext: RoleContext): Promise<string> {
  installDocument();
  harness.context = roleContext;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <PurchaseOrdersPage role={role} />
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  const html = findHtml(container);
  await act(async () => {
    root.unmount();
  });
  return html;
}

describe('purchase order requirement access', () => {
  beforeAll(() => {
    installDocument();
  });

  it('shows an intake link only when creation is explicitly allowed, and marks order identity as canonical', () => {
    const hidden = renderList({ orders: [], role: 'buyer', allowCreateRequirement: false });
    expect(hidden).toContain('No Purchase Orders Found');
    expect(hidden).not.toContain('data-testid="po-empty-create-requirement"');
    expect(hidden).not.toContain('href="/intake"');
    expect(hidden).not.toContain('href="/requirements/new"');

    const offered = renderList({ orders: [], role: 'buyer', allowCreateRequirement: true });
    expect(offered).toContain('data-testid="po-empty-create-requirement"');
    expect(offered).toContain('href="/intake"');
    expect(offered).toContain('+ Create New Requirement');

    const supplier = renderList({ orders: [], role: 'supplier', allowCreateRequirement: false });
    expect(supplier).not.toContain('data-testid="po-empty-create-requirement"');

    const populated = renderList({ orders: [issuedOrder()], role: 'buyer', allowCreateRequirement: true });
    expect(populated).toContain('data-otp-canonical="true"');
    expect(populated).toContain('PO-1001');
    expect(populated).toContain('Acme Supplies');
    expect(populated).not.toContain('data-testid="po-empty-create-requirement"');
  });

  it('passes creation through from a customer buyer page and withholds it from internal operators and suppliers', async () => {
    const buyer = await renderPage('buyer', context({ buyerType: 'MSME', organizationId: 'org-msme' }));
    expect(buyer).toContain('data-testid="po-empty-create-requirement"');
    expect(buyer).toContain('href="/intake"');

    const internal = await renderPage('buyer', context({
      side: 'CONSOLE',
      isPlatformAdmin: true,
      buyerType: null,
      activeRole: {
        code: 'SUPER_ADMIN',
        side: 'CONSOLE',
        label: 'Super Admin',
        description: 'Internal',
        permissions: ['READ', 'AWARD'],
      },
    }));
    expect(buyer).toContain('Orders you placed');
    expect(buyer).toContain('does not hold the payment or file GST returns');
    expect(buyer).not.toContain('GST Compliance');
    expect(internal).toContain('Ledger');
    expect(internal).not.toContain('data-testid="po-empty-create-requirement"');
    expect(internal).not.toContain('href="/intake"');

    const supplier = await renderPage('supplier', context({
      side: 'SUPPLIER',
      buyerType: null,
      supplierId: 'supplier-1',
    }));
    expect(supplier).toContain('Awarded orders');
    expect(supplier).toContain('does not hold the payment');
    expect(supplier).not.toContain('GST Compliance');
    expect(supplier).toContain('Ledger');
    expect(supplier).not.toContain('data-testid="po-empty-create-requirement"');
    expect(supplier).not.toContain('href="/intake"');
  });
});
