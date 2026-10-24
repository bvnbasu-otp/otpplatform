import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemoUserDeletionPreview } from './api/demo-user-deletion';
import type { AdminUserItem } from './types/admin';

// Minimal DOM with real capture/bubble dispatch and focus tracking. It must be
// installed before react-dom loads because react-dom probes the DOM at import.
const dom = vi.hoisted(() => {
  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  type ListenerFn = ((event: FakeEvent) => void) | { handleEvent: (event: FakeEvent) => void };
  type Listener = { type: string; fn: ListenerFn; capture: boolean };

  class FakeEvent {
    readonly type: string;
    readonly bubbles: boolean;
    readonly cancelable = true;
    readonly isTrusted = true;
    readonly timeStamp = Date.now();
    readonly key: string | undefined;
    readonly shiftKey: boolean;
    readonly button = 0;
    defaultPrevented = false;
    target: FakeNode | null = null;
    currentTarget: FakeNode | null = null;
    stopped = false;
    constructor(type: string, init: { bubbles?: boolean; key?: string; shiftKey?: boolean } = {}) {
      this.type = type;
      this.bubbles = init.bubbles ?? false;
      this.key = init.key;
      this.shiftKey = init.shiftKey ?? false;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
    stopPropagation() {
      this.stopped = true;
    }
    stopImmediatePropagation() {
      this.stopped = true;
    }
  }

  class FakeNode {
    readonly nodeType: number;
    readonly nodeName: string;
    parentNode: FakeNode | null = null;
    childNodes: FakeNode[] = [];
    nodeValue: string | null = null;
    ownerDocument: FakeDocument | null = null;
    listeners: Listener[] = [];
    constructor(nodeType: number, nodeName: string) {
      this.nodeType = nodeType;
      this.nodeName = nodeName;
    }
    get firstChild(): FakeNode | null {
      return this.childNodes[0] ?? null;
    }
    get lastChild(): FakeNode | null {
      return this.childNodes[this.childNodes.length - 1] ?? null;
    }
    get nextSibling(): FakeNode | null {
      const siblings = this.parentNode?.childNodes ?? [];
      return siblings[siblings.indexOf(this) + 1] ?? null;
    }
    get parentElement(): FakeElement | null {
      return this.parentNode instanceof FakeElement ? this.parentNode : null;
    }
    get isConnected(): boolean {
      for (let node: FakeNode | null = this; node; node = node.parentNode) {
        if (node === doc) return true;
      }
      return false;
    }
    get data() {
      return this.nodeValue ?? '';
    }
    set data(value: string) {
      this.nodeValue = value;
    }
    get textContent(): string {
      if (this.nodeType === 3) return this.nodeValue ?? '';
      if (this.nodeType === 8) return '';
      return this.childNodes.map((child) => child.textContent).join('');
    }
    set textContent(value: string | null) {
      if (this.nodeType === 3 || this.nodeType === 8) {
        this.nodeValue = value ?? '';
        return;
      }
      for (const child of [...this.childNodes]) this.removeChild(child);
      if (value) this.appendChild(doc.createTextNode(value));
    }
    appendChild(child: FakeNode) {
      child.parentNode?.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    insertBefore(child: FakeNode, reference: FakeNode | null) {
      if (!reference) return this.appendChild(child);
      child.parentNode?.removeChild(child);
      child.parentNode = this;
      this.childNodes.splice(this.childNodes.indexOf(reference), 0, child);
      return child;
    }
    removeChild(child: FakeNode) {
      const index = this.childNodes.indexOf(child);
      if (index >= 0) this.childNodes.splice(index, 1);
      child.parentNode = null;
      if (doc.activeElement && child.contains(doc.activeElement)) doc.activeElement = doc.body;
      return child;
    }
    remove() {
      this.parentNode?.removeChild(this);
    }
    contains(node: FakeNode | null): boolean {
      for (let current = node; current; current = current.parentNode) {
        if (current === this) return true;
      }
      return false;
    }
    addEventListener(type: string, fn: ListenerFn | null, options?: boolean | { capture?: boolean }) {
      if (!fn) return;
      const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
      if (this.listeners.some((l) => l.type === type && l.fn === fn && l.capture === capture)) return;
      this.listeners.push({ type, fn, capture });
    }
    removeEventListener(type: string, fn: ListenerFn | null, options?: boolean | { capture?: boolean }) {
      const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
      this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === capture));
    }
    dispatchEvent(event: FakeEvent) {
      return dispatch(this, event);
    }
  }

  function descendants(node: FakeNode): FakeElement[] {
    return node.childNodes.flatMap((child) =>
      child instanceof FakeElement ? [child, ...descendants(child)] : descendants(child),
    );
  }

  function querySelectorAll(node: FakeNode, selectors: string): FakeElement[] {
    const parsed = selectors.split(',').map((raw) => {
      const match = /^([a-z]*)(?:\[([a-z-]+)\])?$/.exec(raw.trim());
      if (!match) throw new Error(`Unsupported selector in test DOM: ${raw}`);
      return { tag: match[1], attribute: match[2] };
    });
    return descendants(node).filter((element) =>
      parsed.some(
        ({ tag, attribute }) =>
          (!tag || element.nodeName.toLowerCase() === tag) && (!attribute || element.hasAttribute(attribute)),
      ),
    );
  }

  class FakeElement extends FakeNode {
    readonly tagName: string;
    readonly namespaceURI: string;
    attributes = new Map<string, string>();
    style: Record<string, unknown> = { setProperty() {}, removeProperty() {} };
    selectionStart = 0;
    selectionEnd = 0;
    scrollTop = 0;
    scrollLeft = 0;
    declare value: string;
    declare type: string;
    constructor(tag: string, namespaceURI = HTML_NS) {
      super(1, namespaceURI === HTML_NS ? tag.toUpperCase() : tag);
      this.tagName = this.nodeName;
      this.namespaceURI = namespaceURI;
      if (this.nodeName === 'INPUT') {
        this.type = 'text';
        this.value = '';
      } else if (this.nodeName === 'TEXTAREA') {
        this.value = '';
      } else if (this.nodeName === 'OPTION') {
        Object.defineProperty(this, 'value', {
          configurable: true,
          get: () => this.getAttribute('value') ?? this.textContent,
          set: (value: string) => this.setAttribute('value', String(value)),
        });
      }
    }
    get options() {
      return descendants(this).filter((element) => element.nodeName === 'OPTION');
    }
    setAttribute(name: string, value: string) {
      this.attributes.set(name.toLowerCase(), String(value));
    }
    getAttribute(name: string) {
      return this.attributes.get(name.toLowerCase()) ?? null;
    }
    hasAttribute(name: string) {
      return this.attributes.has(name.toLowerCase());
    }
    removeAttribute(name: string) {
      this.attributes.delete(name.toLowerCase());
    }
    setAttributeNS(_ns: string | null, name: string, value: string) {
      this.setAttribute(name, value);
    }
    getAttributeNS(_ns: string | null, name: string) {
      return this.getAttribute(name);
    }
    removeAttributeNS(_ns: string | null, name: string) {
      this.removeAttribute(name);
    }
    querySelectorAll(selectors: string) {
      return querySelectorAll(this, selectors);
    }
    focus() {
      if (this.hasAttribute('disabled') || !this.isConnected) return;
      doc.activeElement = this;
    }
    blur() {
      if (doc.activeElement === this) doc.activeElement = doc.body;
    }
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    }
    scrollBy() {}
    scrollTo() {}
    scrollIntoView() {}
  }

  class FakeIFrameElement extends FakeElement {}

  class FakeDocument extends FakeNode {
    activeElement: FakeElement | null = null;
    oninput: null = null;
    documentElement!: FakeElement;
    head!: FakeElement;
    body!: FakeElement;
    constructor() {
      super(9, '#document');
    }
    createElement(tag: string) {
      const element = new FakeElement(tag);
      element.ownerDocument = this;
      return element;
    }
    createElementNS(namespaceURI: string, tag: string) {
      const element = new FakeElement(tag, namespaceURI);
      element.ownerDocument = this;
      return element;
    }
    createTextNode(text: string) {
      const node = new FakeNode(3, '#text');
      node.nodeValue = String(text);
      node.ownerDocument = this;
      return node;
    }
    createComment(text: string) {
      const node = new FakeNode(8, '#comment');
      node.nodeValue = String(text);
      node.ownerDocument = this;
      return node;
    }
    getSelection() {
      return { rangeCount: 0, removeAllRanges() {}, addRange() {} };
    }
    querySelectorAll(selectors: string) {
      return querySelectorAll(this, selectors);
    }
  }

  function dispatch(target: FakeNode, event: FakeEvent): boolean {
    event.target = target;
    const path: FakeNode[] = [];
    for (let node: FakeNode | null = target; node; node = node.parentNode) path.push(node);
    const invoke = (node: FakeNode, capture: boolean) => {
      event.currentTarget = node;
      for (const listener of [...node.listeners]) {
        if (event.stopped) break;
        if (listener.type !== event.type || listener.capture !== capture) continue;
        if (typeof listener.fn === 'function') listener.fn.call(node, event);
        else listener.fn.handleEvent(event);
      }
    };
    for (const node of [...path].reverse()) {
      if (event.stopped) break;
      invoke(node, true);
    }
    if (!event.stopped) invoke(target, false);
    if (event.bubbles) {
      for (const node of path.slice(1)) {
        if (event.stopped) break;
        invoke(node, false);
      }
    }
    event.currentTarget = null;
    return !event.defaultPrevented;
  }

  const doc = new FakeDocument();
  doc.documentElement = doc.createElement('html');
  doc.head = doc.createElement('head');
  doc.body = doc.createElement('body');
  doc.appendChild(doc.documentElement);
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  doc.activeElement = doc.body;

  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    document: doc,
    window: {
      document: doc,
      location: { origin: 'http://localhost' },
      addEventListener() {},
      removeEventListener() {},
      getSelection: () => doc.getSelection(),
      HTMLElement: FakeElement,
      HTMLIFrameElement: FakeIFrameElement,
    },
    HTMLElement: FakeElement,
    HTMLIFrameElement: FakeIFrameElement,
    SVGElement: FakeElement,
    Element: FakeElement,
    Node: FakeNode,
  });

  return { FakeEvent, dispatch };
});

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  execute: vi.fn(),
  demoIds: vi.fn(),
  fetchUsers: vi.fn(),
  fetchRequests: vi.fn(),
}));
const roleState = vi.hoisted(() => ({ superAdmin: true }));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), auth: { resetPasswordForEmail: vi.fn() } },
}));
vi.mock('./api/demo-user-deletion', () => ({
  previewDemoUserDeletion: mocks.preview,
  executeDemoUserDeletion: mocks.execute,
  fetchDemoQaAccountIds: mocks.demoIds,
}));
vi.mock('./api/admin-ops', () => ({
  fetchUsersAndOrganizations: mocks.fetchUsers,
  fetchSignupRequests: mocks.fetchRequests,
  reviewSignupRequest: vi.fn(),
}));
vi.mock('@/features/roles', () => ({
  useRoleContext: () => ({
    context: {
      isPlatformAdmin: true,
      activeRole: { code: roleState.superAdmin ? 'SUPER_ADMIN' : 'PLATFORM_OPS' },
    },
    isLoading: false,
    refresh: vi.fn(),
    switchTo: vi.fn(),
    switchOrg: vi.fn(),
  }),
}));
vi.mock('./components/PersonaAuditStatementModal', () => ({ PersonaAuditStatementModal: () => null }));
vi.mock('./lib/bulk-lifecycle-actions', () => ({
  executeBulkDeactivation: vi.fn(),
  executeBulkReactivation: vi.fn(),
}));
vi.mock('@/features/notifications/lib/edge-dispatch', () => ({ invokeEdgeFunction: vi.fn() }));
vi.mock('@/features/notifications/lib/outbound-dispatch', () => ({ resolveSupabaseEmailDispatch: vi.fn() }));

import {
  DemoUserDeletionModal,
  demoDeletionErrorRequiresFreshPreview,
  focusableWithin,
  isDemoDeletionPreviewExpired,
} from './components/DemoUserDeletionModal';
import { AdminUsersActivityPanel } from './components/AdminUsersActivityPanel';

const modalSource = readFileSync(
  resolve(__dirname, 'components/DemoUserDeletionModal.tsx'),
  'utf8',
);
const panelSource = readFileSync(
  resolve(__dirname, 'components/AdminUsersActivityPanel.tsx'),
  'utf8',
);

const TARGET_EMAIL = 'demo.qa@example.test';
const target: AdminUserItem = {
  id: '00000000-0000-4000-8000-000000000001',
  email: TARGET_EMAIL,
  fullName: 'Demo QA',
  isDemo: true,
  status: 'ACTIVE',
  side: 'BUYER',
  role: null,
  createdAt: '2026-01-01T00:00:00Z',
};
const otherUser: AdminUserItem = {
  ...target,
  id: '00000000-0000-4000-8000-000000000002',
  email: 'real.buyer@example.test',
  fullName: 'Real Buyer',
  isDemo: false,
};

function eligiblePreview(overrides: Partial<DemoUserDeletionPreview> = {}): DemoUserDeletionPreview {
  return {
    targetProfileId: target.id,
    targetAuthUserId: target.id,
    trustedDemoQa: true,
    eligible: true,
    blockerCount: 0,
    fingerprint: 'fp-1',
    policyBlockers: [],
    dependencies: [],
    confirmationToken: 'one-time-token',
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolveFn) => {
    resolvePromise = resolveFn;
  });
  return { promise, resolve: resolvePromise };
}

let root: Root | null = null;
let container: HTMLElement | null = null;
const extraNodes: HTMLElement[] = [];

function render(ui: ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const created = createRoot(container);
  root = created;
  act(() => created.render(ui));
}

function unmount() {
  const current = root;
  root = null;
  if (current) act(() => current.unmount());
}

async function settle() {
  await act(async () => {
    await new Promise((resolveFn) => setTimeout(resolveFn, 0));
  });
}

function allElements(node: Node = document.body): HTMLElement[] {
  return Array.from(node.childNodes).flatMap((child) =>
    child instanceof HTMLElement ? [child, ...allElements(child)] : [],
  );
}
const byLabel = (label: string) => {
  const found = allElements().find((element) => element.getAttribute('aria-label') === label);
  if (!found) throw new Error(`No element labelled ${label}`);
  return found;
};
const queryByLabel = (label: string) =>
  allElements().find((element) => element.getAttribute('aria-label') === label) ?? null;
const buttonsNamed = (name: string) =>
  allElements().filter((element) => element.nodeName === 'BUTTON' && element.textContent?.trim() === name);
const buttonNamed = (name: string) => {
  const [found] = buttonsNamed(name);
  if (!found) throw new Error(`No button named ${name}`);
  return found;
};
const byTestId = (id: string) => allElements().find((element) => element.getAttribute('data-testid') === id) ?? null;
const dialog = () => allElements().find((element) => element.getAttribute('role') === 'dialog') ?? null;
const alertsText = () =>
  allElements()
    .filter((element) => element.getAttribute('role') === 'alert')
    .map((element) => element.textContent ?? '')
    .join(' | ');
const isDisabled = (element: HTMLElement) => element.hasAttribute('disabled');
const deleteButton = () => {
  const found = allElements().find(
    (element) =>
      element.nodeName === 'BUTTON' &&
      ['Permanently delete account', 'Deleting…'].includes(element.textContent?.trim() ?? ''),
  );
  if (!found) throw new Error('No permanent delete button');
  return found;
};

function fire(element: Element, event: InstanceType<typeof dom.FakeEvent>) {
  act(() => {
    dom.dispatch(element as unknown as Parameters<typeof dom.dispatch>[0], event);
  });
}
const click = (element: Element) => fire(element, new dom.FakeEvent('click', { bubbles: true }));
const mouseDown = (element: Element) => fire(element, new dom.FakeEvent('mousedown', { bubbles: true }));
function pressKey(key: string, shiftKey = false) {
  const active = document.activeElement;
  if (!active) throw new Error('Nothing is focused');
  fire(active, new dom.FakeEvent('keydown', { bubbles: true, key, shiftKey }));
}
function typeInto(element: HTMLElement, value: string) {
  act(() => {
    (element as HTMLInputElement).value = value;
    dom.dispatch(
      element as unknown as Parameters<typeof dom.dispatch>[0],
      new dom.FakeEvent('input', { bubbles: true }),
    );
  });
}
function fillForm(confirmation = TARGET_EMAIL, reason = 'Retire QA fixture', outcome = 'Fixture removed') {
  typeInto(byLabel('Deletion confirmation email'), confirmation);
  typeInto(byLabel('Permanent deletion reason'), reason);
  typeInto(byLabel('Permanent deletion outcome'), outcome);
}

async function renderModal(props: { onClose?: () => void; onDeleted?: (auditEventId: string) => void } = {}) {
  const onClose = vi.fn(props.onClose);
  const onDeleted = vi.fn(props.onDeleted);
  render(<DemoUserDeletionModal target={target} onClose={onClose} onDeleted={onDeleted} />);
  await settle();
  return { onClose, onDeleted };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  roleState.superAdmin = true;
  mocks.preview.mockImplementation(async () => ({ ok: true, preview: eligiblePreview() }));
  mocks.demoIds.mockResolvedValue({ ok: true, ids: [target.id] });
  mocks.fetchRequests.mockResolvedValue({ ok: true, count: 0, requests: [] });
});

afterEach(() => {
  unmount();
  container?.remove();
  container = null;
  for (const node of extraNodes.splice(0)) node.remove();
  (document.body as HTMLElement).focus();
  vi.restoreAllMocks();
});

describe('SuperAdmin demo/QA hard-deletion UI helpers', () => {
  it('treats absent, malformed, and elapsed expiries as expired', () => {
    const now = Date.parse('2026-10-23T12:00:00Z');
    expect(isDemoDeletionPreviewExpired(null, now)).toBe(true);
    expect(isDemoDeletionPreviewExpired('not-a-date', now)).toBe(true);
    expect(isDemoDeletionPreviewExpired('2026-10-23T11:59:59Z', now)).toBe(true);
    expect(isDemoDeletionPreviewExpired('2026-10-23T12:00:01Z', now)).toBe(false);
  });

  it('forces a fresh preview after stale, expired, mismatched, or newly blocked server state', () => {
    for (const error of [
      'DEMO_USER_DELETE_STALE_PREVIEW',
      'DEMO_USER_DELETE_CONFIRMATION_EXPIRED',
      'DEMO_USER_DELETE_CONFIRMATION_MISMATCH',
      'DEMO_USER_DELETE_BLOCKED: current preview is not eligible',
    ]) {
      expect(demoDeletionErrorRequiresFreshPreview(error)).toBe(true);
    }
    expect(demoDeletionErrorRequiresFreshPreview('DEMO_USER_DELETE_DENIED')).toBe(false);
    expect(demoDeletionErrorRequiresFreshPreview('network unavailable')).toBe(false);
  });

  it('excludes disabled, untabbable, hidden, and aria-hidden controls and tolerates an empty dialog', () => {
    const container = document.createElement('section');
    expect(focusableWithin(container)).toEqual([]);

    const disabled = document.createElement('button');
    disabled.setAttribute('disabled', '');
    const untabbable = document.createElement('button');
    untabbable.setAttribute('tabindex', '-1');
    const hiddenWrapper = document.createElement('div');
    hiddenWrapper.setAttribute('hidden', '');
    hiddenWrapper.appendChild(document.createElement('input'));
    const ariaHiddenWrapper = document.createElement('div');
    ariaHiddenWrapper.setAttribute('aria-hidden', 'true');
    ariaHiddenWrapper.appendChild(document.createElement('textarea'));
    for (const node of [disabled, untabbable, hiddenWrapper, ariaHiddenWrapper]) container.appendChild(node);
    expect(focusableWithin(container)).toEqual([]);

    const enabled = document.createElement('button');
    const link = document.createElement('a');
    link.setAttribute('href', '#x');
    const unlinked = document.createElement('a');
    container.appendChild(enabled);
    container.appendChild(link);
    container.appendChild(unlinked);
    expect(focusableWithin(container)).toEqual([enabled, link]);
  });
});

describe('DemoUserDeletionModal (rendered)', () => {
  it('renders the server preview and requires an exact, untrimmed email match', async () => {
    await renderModal();
    expect(mocks.preview).toHaveBeenCalledWith(target.id);
    expect(dialog()?.textContent).toContain('Eligible');

    for (const near of [` ${TARGET_EMAIL}`, `${TARGET_EMAIL} `, `\t${TARGET_EMAIL}\n`, TARGET_EMAIL.toUpperCase()]) {
      fillForm(near);
      expect(isDisabled(deleteButton())).toBe(true);
      click(deleteButton());
    }
    fillForm(TARGET_EMAIL, '   ', 'Fixture removed');
    expect(isDisabled(deleteButton())).toBe(true);
    fillForm(TARGET_EMAIL, 'Retire QA fixture', '  ');
    expect(isDisabled(deleteButton())).toBe(true);
    expect(mocks.execute).not.toHaveBeenCalled();

    mocks.execute.mockResolvedValue({
      ok: true,
      result: { targetProfileId: target.id, auditEventId: 'audit-1', outcome: 'done' },
    });
    fillForm(TARGET_EMAIL, '  Retire QA fixture  ', ' Fixture removed ');
    expect(isDisabled(deleteButton())).toBe(false);
    click(deleteButton());
    await settle();
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledWith({
      targetProfileId: target.id,
      confirmationToken: 'one-time-token',
      reason: '  Retire QA fixture  ',
      outcome: ' Fixture removed ',
    });
  });

  it('blocks submission for ineligible previews and for any reported blocker', async () => {
    mocks.preview.mockResolvedValueOnce({
      ok: true,
      preview: eligiblePreview({
        eligible: false,
        blockerCount: 2,
        confirmationToken: null,
        expiresAt: null,
        policyBlockers: [{ code: 'TRUSTED_DEMO_QA_REQUIRED', category: 'policy' }],
        dependencies: [
          {
            schema: 'public',
            table: 'purchase_orders',
            column: 'created_by',
            constraint: 'purchase_orders_created_by_fkey',
            target: 'public.profiles',
            deleteAction: 'NO ACTION',
            category: 'retained_business_record',
            count: 3,
            disposition: 'block',
            blocks: true,
          },
        ],
      }),
    });
    await renderModal();
    const text = dialog()?.textContent ?? '';
    expect(text).toContain('Ineligible');
    expect(text).toContain('TRUSTED_DEMO_QA_REQUIRED');
    expect(text).toContain('public.purchase_orders.created_by');
    fillForm();
    expect(isDisabled(deleteButton())).toBe(true);
    click(deleteButton());
    unmount();

    mocks.preview.mockResolvedValueOnce({ ok: true, preview: eligiblePreview({ blockerCount: 1 }) });
    await renderModal();
    fillForm();
    expect(isDisabled(deleteButton())).toBe(true);
    click(deleteButton());
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('executes at most once for rapid duplicate clicks and reports the verified audit id once', async () => {
    const pending = deferred<unknown>();
    mocks.execute.mockReturnValue(pending.promise);
    const { onDeleted } = await renderModal();
    fillForm();
    const button = deleteButton();
    act(() => {
      for (let i = 0; i < 3; i += 1) {
        dom.dispatch(
          button as unknown as Parameters<typeof dom.dispatch>[0],
          new dom.FakeEvent('click', { bubbles: true }),
        );
      }
    });
    click(button);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(deleteButton().textContent).toContain('Deleting');
    expect(isDisabled(deleteButton())).toBe(true);

    await act(async () => {
      pending.resolve({ ok: true, result: { targetProfileId: target.id, auditEventId: 'audit-42', outcome: 'done' } });
    });
    await settle();
    click(deleteButton());
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledWith('audit-42');
  });

  it('refuses a preview whose client-side expiry has passed and requires a new preview', async () => {
    mocks.preview.mockResolvedValueOnce({
      ok: true,
      preview: eligiblePreview({ expiresAt: new Date(Date.now() - 1_000).toISOString() }),
    });
    await renderModal();
    expect(alertsText()).toContain('This preview has expired');
    fillForm();
    expect(isDisabled(deleteButton())).toBe(true);
    unmount();

    await renderModal();
    fillForm();
    expect(isDisabled(deleteButton())).toBe(false);
    const realNow = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(realNow + 60 * 60_000);
    click(deleteButton());
    vi.mocked(Date.now).mockRestore();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(alertsText()).toContain('This preview expired');
    expect(queryByLabel('Deletion confirmation email')).toBeNull();
    expect(isDisabled(deleteButton())).toBe(true);

    click(buttonNamed('Request fresh preview'));
    await settle();
    expect(mocks.preview).toHaveBeenCalledTimes(3);
    expect((byLabel('Deletion confirmation email') as HTMLInputElement).value).toBe('');
  });

  it.each([
    ['DEMO_USER_DELETE_STALE_PREVIEW', 'The account changed after this preview'],
    ['DEMO_USER_DELETE_CONFIRMATION_EXPIRED', 'This preview expired'],
  ])('discards the preview after server error %s and requires a new preview', async (code, message) => {
    mocks.execute.mockResolvedValue({ ok: false, error: code });
    const { onDeleted } = await renderModal();
    fillForm();
    click(deleteButton());
    await settle();
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(alertsText()).toContain(message);
    expect(queryByLabel('Deletion confirmation email')).toBeNull();
    expect(isDisabled(deleteButton())).toBe(true);
    click(deleteButton());
    expect(mocks.execute).toHaveBeenCalledTimes(1);

    click(buttonNamed('Request fresh preview'));
    await settle();
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect((byLabel('Deletion confirmation email') as HTMLInputElement).value).toBe('');
    expect(isDisabled(deleteButton())).toBe(true);
  });

  it('contains Tab and Shift+Tab, closes on Escape, and restores focus to the opener', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    extraNodes.push(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { onClose } = await renderModal();
    const closeButton = byLabel('Close permanent deletion dialog');
    const confirmation = byLabel('Deletion confirmation email');
    const reason = byLabel('Permanent deletion reason');
    const outcome = byLabel('Permanent deletion outcome');
    const refresh = buttonNamed('Request fresh preview');
    expect(document.activeElement).toBe(closeButton);

    pressKey('Tab', true);
    expect(document.activeElement).toBe(refresh);
    for (const expected of [closeButton, confirmation, reason, outcome, refresh, closeButton]) {
      pressKey('Tab');
      expect(document.activeElement).toBe(expected);
    }

    fillForm();
    closeButton.focus();
    pressKey('Tab', true);
    expect(document.activeElement).toBe(deleteButton());
    pressKey('Tab');
    expect(document.activeElement).toBe(closeButton);

    pressKey('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.activeElement).toBe(opener);
  });

  it('does not throw or refocus a detached opener when the dialog closes', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    await renderModal();
    opener.remove();
    expect(() => unmount()).not.toThrow();
    expect(document.activeElement).not.toBe(opener);
  });

  it('ignores Escape and backdrop dismissal while a deletion is in flight', async () => {
    const pending = deferred<unknown>();
    mocks.execute.mockReturnValue(pending.promise);
    const { onClose, onDeleted } = await renderModal();
    fillForm();
    click(deleteButton());
    expect(mocks.execute).toHaveBeenCalledTimes(1);

    byLabel('Deletion confirmation email').focus();
    pressKey('Escape');
    const overlay = dialog()?.parentElement;
    if (!overlay) throw new Error('missing overlay');
    mouseDown(overlay);
    click(byLabel('Close permanent deletion dialog'));
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();

    pressKey('Tab');
    expect(dialog()?.contains(document.activeElement)).toBe(true);

    await act(async () => {
      pending.resolve({ ok: true, result: { targetProfileId: target.id, auditEventId: 'audit-7', outcome: 'done' } });
    });
    await settle();
    expect(onDeleted).toHaveBeenCalledWith('audit-7');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('AdminUsersActivityPanel demo deletion success flow (rendered)', () => {
  const secondDemo: AdminUserItem = {
    ...target,
    id: '00000000-0000-4000-8000-000000000003',
    email: 'second.demo@example.test',
    fullName: 'Second Demo',
    isDemo: false,
  };

  function rowOf(element: HTMLElement): HTMLElement | null {
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      if (node.nodeName === 'TR') return node;
    }
    return null;
  }
  const deleteActionFor = (email: string) =>
    buttonsNamed('Delete demo/QA').find((button) => rowOf(button)?.textContent?.includes(email)) ?? null;
  const rosterEmails = () =>
    allElements()
      .filter((element) => element.nodeName === 'TR')
      .map((row) => row.textContent ?? '');

  async function deleteFromPanel() {
    render(<AdminUsersActivityPanel />);
    await settle();
    const trigger = deleteActionFor(TARGET_EMAIL);
    if (!trigger) throw new Error('demo deletion action not rendered');
    click(trigger);
    await settle();
    expect(dialog()).not.toBeNull();
    fillForm();
    click(deleteButton());
    await settle();
    await settle();
  }

  beforeEach(() => {
    mocks.execute.mockResolvedValue({
      ok: true,
      result: { targetProfileId: target.id, auditEventId: 'audit-123', outcome: 'Fixture removed' },
    });
  });

  it('keeps the verified success and audit id visible when the roster refresh rejects', async () => {
    mocks.fetchUsers
      .mockResolvedValueOnce({ ok: true, users: [target, otherUser], organizations: [] })
      .mockRejectedValueOnce(new Error('network down'));
    await deleteFromPanel();

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.fetchUsers).toHaveBeenCalledTimes(2);
    expect(dialog()).toBeNull();
    const success = byTestId('demo-deletion-success')?.textContent ?? '';
    expect(success).toContain(`Permanently deleted demo/QA account ${TARGET_EMAIL}`);
    expect(success).toContain('audit-123');
    const warning = byTestId('demo-deletion-refresh-warning');
    expect(warning?.getAttribute('role')).toBe('alert');
    expect(warning?.textContent).toContain('The deletion succeeded, but the user roster could not be refreshed');
    expect(alertsText()).not.toMatch(/deletion request failed|network down/i);
    expect(buttonsNamed('Delete demo/QA')).toHaveLength(0);

    await settle();
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('shows the same distinct warning when the refresh reports ok:false', async () => {
    mocks.fetchUsers
      .mockResolvedValueOnce({ ok: true, users: [target, otherUser], organizations: [] })
      .mockResolvedValueOnce({ ok: false, users: [], organizations: [], error: 'boom' });
    await deleteFromPanel();
    expect(byTestId('demo-deletion-success')?.textContent).toContain('audit-123');
    expect(byTestId('demo-deletion-refresh-warning')).not.toBeNull();
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('treats a signup-request ok:false as a refresh failure even when users/orgs succeed', async () => {
    mocks.fetchUsers
      .mockResolvedValueOnce({ ok: true, users: [target, otherUser], organizations: [] })
      .mockResolvedValueOnce({ ok: true, users: [otherUser], organizations: [] });
    mocks.fetchRequests
      .mockResolvedValueOnce({ ok: true, count: 0, requests: [] })
      .mockResolvedValueOnce({ ok: false, count: 0, requests: [], error: 'signup lookup failed' });
    await deleteFromPanel();
    expect(mocks.fetchRequests).toHaveBeenCalledTimes(2);
    expect(mocks.fetchRequests).toHaveBeenLastCalledWith('ALL');
    expect(byTestId('demo-deletion-success')?.textContent).toContain('audit-123');
    expect(byTestId('demo-deletion-refresh-warning')).not.toBeNull();
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('treats a failed demo-ID lookup as a refresh failure and keeps the prior demo classification', async () => {
    mocks.fetchUsers
      .mockResolvedValueOnce({ ok: true, users: [target, secondDemo, otherUser], organizations: [] })
      .mockResolvedValueOnce({ ok: true, users: [secondDemo, otherUser], organizations: [] });
    mocks.demoIds
      .mockResolvedValueOnce({ ok: true, ids: [target.id, secondDemo.id] })
      .mockResolvedValueOnce({ ok: false, error: 'demo lookup failed' });
    await deleteFromPanel();

    expect(mocks.demoIds).toHaveBeenCalledTimes(2);
    expect(byTestId('demo-deletion-success')?.textContent).toContain('audit-123');
    expect(byTestId('demo-deletion-refresh-warning')).not.toBeNull();
    expect(deleteActionFor(secondDemo.email)).not.toBeNull();
    expect(deleteActionFor(otherUser.email)).toBeNull();
    expect(buttonsNamed('Delete demo/QA')).toHaveLength(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('shows success without a warning only when every required refresh request succeeds', async () => {
    mocks.fetchUsers
      .mockResolvedValueOnce({ ok: true, users: [target, secondDemo, otherUser], organizations: [] })
      .mockResolvedValueOnce({ ok: true, users: [secondDemo, otherUser], organizations: [] });
    mocks.demoIds
      .mockResolvedValueOnce({ ok: true, ids: [target.id, secondDemo.id] })
      .mockResolvedValueOnce({ ok: true, ids: [secondDemo.id] });
    await deleteFromPanel();
    expect(mocks.fetchUsers).toHaveBeenCalledTimes(2);
    expect(mocks.fetchRequests).toHaveBeenCalledTimes(2);
    expect(mocks.demoIds).toHaveBeenCalledTimes(2);
    expect(byTestId('demo-deletion-success')?.textContent).toContain('audit-123');
    expect(byTestId('demo-deletion-refresh-warning')).toBeNull();
    expect(rosterEmails().some((row) => row.includes(TARGET_EMAIL))).toBe(false);
    expect(deleteActionFor(secondDemo.email)).not.toBeNull();
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('does not call the demo lookup for non-SuperAdmin personas and exposes no delete action', async () => {
    roleState.superAdmin = false;
    mocks.fetchUsers.mockResolvedValueOnce({ ok: true, users: [target, otherUser], organizations: [] });
    render(<AdminUsersActivityPanel />);
    await settle();
    expect(mocks.fetchUsers).toHaveBeenCalledTimes(1);
    expect(mocks.fetchRequests).toHaveBeenCalledTimes(1);
    expect(mocks.demoIds).not.toHaveBeenCalled();
    expect(rosterEmails().some((row) => row.includes(otherUser.email))).toBe(true);
    expect(buttonsNamed('Delete demo/QA')).toHaveLength(0);
    expect(dialog()).toBeNull();
  });
});

describe('SuperAdmin demo/QA hard-deletion UI source guards', () => {
  it('renders server preview identity, expiry, policy and dependency blockers', () => {
    expect(modalSource).toContain('previewDemoUserDeletion(target.id)');
    expect(modalSource).toContain('Server eligibility');
    expect(modalSource).toContain('Preview expiry');
    expect(modalSource).toContain('preview.policyBlockers');
    expect(modalSource).toMatch(/preview\?\.dependencies\.filter\(\(dependency\) => dependency\.blocks\)/);
    expect(modalSource).toContain('dependency.category');
    expect(modalSource).toContain('dependency.count');
    expect(modalSource).toContain('dependency.disposition');
  });

  it('requires exact target confirmation, nonblank reason/outcome, eligibility, zero blockers, and a live server token', () => {
    expect(modalSource).toContain('confirmation === target.email');
    expect(modalSource).not.toContain('confirmation.trim()');
    expect(modalSource).toContain('reason.trim().length > 0');
    expect(modalSource).toContain('outcome.trim().length > 0');
    expect(modalSource).toContain('preview?.eligible === true');
    expect(modalSource).toContain('preview.blockerCount === 0');
    expect(modalSource).toContain('Boolean(preview.confirmationToken)');
    expect(modalSource).toContain('confirmationToken: preview.confirmationToken');
    expect(modalSource).not.toMatch(/randomUUID|crypto|getRandomValues/);
  });

  it('prevents repeated execution and keeps roster refresh out of the deletion error path', () => {
    expect(modalSource).toContain('if (!canDelete || !preview?.confirmationToken || submittingRef.current) return');
    expect(modalSource).toContain('submittingRef.current = true');
    expect(modalSource).toContain('disabled={!canDelete}');
    expect(modalSource).toContain('if (deletedAuditEventId !== null) onDeleted(deletedAuditEventId)');
    expect(modalSource).not.toContain('await onDeleted');
    expect(panelSource).toContain('handleDemoUserDeleted(demoDeletionTarget, auditEventId)');
    expect(panelSource).toContain('the user roster could not be refreshed');
  });

  it('clears preview state for freshness errors and remounts cleanly when the target changes', () => {
    expect(modalSource).toContain('demoDeletionErrorRequiresFreshPreview(result.error)');
    expect(modalSource).toContain('setPreview(null)');
    expect(modalSource).toContain("setConfirmation('')");
    expect(panelSource).toContain('key={demoDeletionTarget.id}');
    expect(panelSource).toContain('onClose={() => setDemoDeletionTarget(null)}');
  });

  it('is keyboard accessible, focus-managed, responsive, and explicitly irreversible', () => {
    expect(modalSource).toContain('aria-modal="true"');
    expect(modalSource).toContain("event.key === 'Escape'");
    expect(modalSource).toContain('tabIndex={-1}');
    expect(modalSource).toContain('onKeyDown={handleDialogKeyDown}');
    expect(modalSource).toContain('previous.isConnected');
    expect(modalSource).toContain('Irreversible:');
    expect(modalSource).toContain('max-h-[calc(100vh-1.5rem)]');
    expect(modalSource).toContain('sm:grid-cols-');
    expect(modalSource).toContain('aria-label="Deletion confirmation email"');
    expect(modalSource).toContain('aria-label="Permanent deletion reason"');
    expect(modalSource).toContain('aria-label="Permanent deletion outcome"');
  });

  it('shows the action only for known demo accounts in the effective SUPER_ADMIN persona', () => {
    expect(panelSource).toContain(
      "roleContext.isPlatformAdmin === true && roleContext.activeRole?.code === 'SUPER_ADMIN'",
    );
    expect(panelSource).toContain('isEffectiveSuperAdmin && u.isDemo === true');
    expect(panelSource).toContain('fetchDemoQaAccountIds()');
    expect(panelSource).toContain('demoIds.has(user.id)');
    expect(panelSource).not.toContain('setDemoDeletionTarget({');
  });

  it('preserves the existing deactivate/reactivate and audit-statement workflows as separate actions', () => {
    expect(panelSource).toContain('openBlockModal');
    expect(panelSource).toContain('handleConfirmUnblock');
    expect(panelSource).toContain('executeBulkDeactivation');
    expect(panelSource).toContain('executeBulkReactivation');
    expect(panelSource).toContain('handleOpenUserAudit');
    expect(modalSource).toContain('Existing lifecycle actions remain separate.');
  });
});
