import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(process.cwd());
const DOCS_DIR = resolve(ROOT, 'docs');
const OUTPUT_HTML = resolve(ROOT, 'tmp_otp_docs_complete.html');
const OUTPUT_PDF = resolve(DOCS_DIR, 'OTP_PLATFORM_COMPLETE_DOCUMENTATION.pdf');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const ORDERED_FILES = [
  '00-DOCUMENTATION-INDEX.md',
  '01-PLATFORM-OVERVIEW.md',
  '02-ARCHITECTURE.md',
  '03-DOMAIN-MODEL-AND-STATE-MACHINES.md',
  '04-WORKFLOWS-AND-CALLFLOWS.md',
  '05-UI-UX-DESIGN-SYSTEM.md',
  '06-DATABASE-AND-RLS-POLICIES.md',
  '07-SECURITY-PRIVACY-BACKUP.md',
  '08-DEMO-PILOT-VS-PRODUCTION.md',
  '09-MODULE-FEATURE-SPECIFICATIONS.md',
  '10-DEPLOYMENT-AND-TUNNEL-OPERATIONS.md',
  '11-TESTING-AND-REGRESSION-SUITE.md',
  '12-MAINTENANCE-AND-ALERTS-PIPELINE.md',
  '13-GO-LIVE-AND-PILOT-READINESS-CHECKLIST.md',
  '14-SECURITY-CLEARANCES-AND-PRE-PROD-AUDIT-CHECKLIST.md',
  '15-PRODUCTION-READINESS-AND-CTO-CLEARANCE-REPORT.md',
  'RECONSTRUCT-PRODUCT-CONSTITUTION-v1.0.md',
  '00-governance/DOCUMENTATION_PRINCIPLES.md',
  '00-governance/SOURCE_OF_TRUTH_POLICY.md',
  '00-governance/DOCUMENTATION_STATUS.md',
  '01-product/PRODUCT_OVERVIEW.md',
  '01-product/PILOT_SCOPE.md',
  '01-product/CUSTOMER_TYPES.md',
  '01-product/CUSTOMER_JOURNEYS.md',
  '01-product/PRICING_AND_ENTITLEMENTS.md',
  '01-product/BUSINESS_MODEL.md',
  '02-design/SCREEN_INVENTORY.md',
  '03-domains/PROCUREMENT.md',
  '03-domains/GOVERNANCE.md',
  '03-domains/AWARDS_AND_REVEAL.md',
  '03-domains/SUPPLIER_NETWORK.md',
  '03-domains/PURCHASE_ORDERS.md',
  '03-domains/PAYMENTS.md',
  '04-features/FEATURE_CATALOG.md',
  '05-architecture/SYSTEM_ARCHITECTURE.md',
  '05-architecture/SECURITY_ARCHITECTURE.md',
  '06-wiring/END_TO_END_WIRING.md',
  '06-wiring/RPC_CATALOG.md',
  '07-database/DATABASE_OVERVIEW.md',
  '07-database/MIGRATION_HISTORY.md',
  '08-security/ROLE_PERMISSION_MATRIX.md',
  '08-security/WRITE_BOUNDARIES.md',
  '09-integrations/INTEGRATION_CATALOG.md',
  '09-integrations/GOOGLE_PLACES.md',
  '09-integrations/WHATSAPP.md',
  '09-integrations/ONDC.md',
  '09-integrations/EMAIL.md',
  '09-integrations/SMS.md',
  '09-integrations/PAYMENTS.md',
  '10-platform/TECHNOLOGY_STACK.md',
  '10-platform/VERCEL.md',
  '10-platform/SUPABASE.md',
  '10-platform/CI_CD.md',
  '10-platform/ENVIRONMENTS.md',
  '10-platform/GIT_AND_GITHUB.md',
  '11-testing/TEST_STRATEGY.md',
  '11-testing/PRODUCTION_GATES.md',
  '11-testing/COVERAGE_POLICY.md',
  '11-testing/BLACK_BOX_TESTING.md',
  '12-operations/DEPLOYMENT_RUNBOOK.md',
  '12-operations/RELEASE_RUNBOOK.md',
  '12-operations/PILOT_RUNBOOK.md',
  '12-operations/ROLLBACK.md',
  '12-operations/INCIDENT_RESPONSE.md',
  '13-truth/PUBLIC_PILOT_TRUTH.md',
  '13-truth/CAPABILITY_STATUS.md',
  '13-truth/KNOWN_LIMITATIONS.md',
  '13-truth/LIVE_VS_PLANNED.md',
  '14-mobile-contract/MOBILE_PRODUCT_CONTRACT.md',
  '15-change-management/RELEASE_DOCUMENTATION_PROTOCOL.md',
  '15-change-management/OTP_PILOT_FINAL_QUALITY_GATE_AND_RELEASE_CERTIFICATE.md',
  'OTP_PILOT_AMBER_GREEN_MASTER_REGISTER.md',
  'README.md',
];

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseMarkdownToHtml(md) {
  let html = '';
  const lines = md.split('\n');
  let inCodeBlock = false;
  let codeLang = '';
  let codeContent = '';
  let inTable = false;
  let tableHeaderParsed = false;
  let inList = false;
  let listType = 'ul';

  const closeListIfNeeded = () => {
    if (inList) {
      html += `</${listType}>\n`;
      inList = false;
    }
  };

  const closeTableIfNeeded = () => {
    if (inTable) {
      html += '</tbody></table>\n';
      inTable = false;
      tableHeaderParsed = false;
    }
  };

  const formatInline = (text) => {
    let out = text;
    // Code tags
    out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
    // Bold
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Links
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return out;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code blocks
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        html += `<pre><code class="language-${codeLang}">${escapeHtml(codeContent.trimEnd())}</code></pre>\n`;
        inCodeBlock = false;
        codeContent = '';
      } else {
        closeListIfNeeded();
        closeTableIfNeeded();
        inCodeBlock = true;
        codeLang = trimmed.slice(3).trim();
        codeContent = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += rawLine + '\n';
      continue;
    }

    // Tables
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      closeListIfNeeded();
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());

      // Check if it's separator row
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableHeaderParsed = true;
        html += '<table class="doc-table">\n<thead><tr>';
        cells.forEach((c) => {
          html += `<th>${formatInline(c)}</th>`;
        });
        html += '</tr></thead>\n<tbody>\n';
      } else {
        html += '<tr>';
        cells.forEach((c) => {
          html += `<td>${formatInline(c)}</td>`;
        });
        html += '</tr>\n';
      }
      continue;
    } else {
      closeTableIfNeeded();
    }

    // Horizontal Rule
    if (/^(\*\*\*|---|___)$/.test(trimmed)) {
      closeListIfNeeded();
      html += '<hr />\n';
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeListIfNeeded();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      html += `<h${level} id="${id}">${formatInline(text)}</h${level}>\n`;
      continue;
    }

    // Blockquotes & Callouts
    if (trimmed.startsWith('>')) {
      closeListIfNeeded();
      const quoteText = trimmed.replace(/^>\s*/, '');
      let alertClass = 'callout-note';
      let displayText = quoteText;

      if (quoteText.startsWith('[!NOTE]')) {
        alertClass = 'callout-note';
        displayText = quoteText.slice(7).trim();
      } else if (quoteText.startsWith('[!WARNING]') || quoteText.startsWith('[!CAUTION]')) {
        alertClass = 'callout-warning';
        displayText = quoteText.replace(/^\[!(WARNING|CAUTION)\]/, '').trim();
      } else if (quoteText.startsWith('[!IMPORTANT]')) {
        alertClass = 'callout-important';
        displayText = quoteText.slice(12).trim();
      } else if (quoteText.startsWith('[!TIP]')) {
        alertClass = 'callout-tip';
        displayText = quoteText.slice(6).trim();
      }

      html += `<div class="callout ${alertClass}"><p>${formatInline(displayText)}</p></div>\n`;
      continue;
    }

    // Unordered List
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList || listType !== 'ul') {
        closeListIfNeeded();
        inList = true;
        listType = 'ul';
        html += '<ul>\n';
      }
      const itemText = trimmed.replace(/^[-*]\s+/, '');
      html += `<li>${formatInline(itemText)}</li>\n`;
      continue;
    }

    // Ordered List
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inList || listType !== 'ol') {
        closeListIfNeeded();
        inList = true;
        listType = 'ol';
        html += '<ol>\n';
      }
      const itemText = trimmed.replace(/^\d+\.\s+/, '');
      html += `<li>${formatInline(itemText)}</li>\n`;
      continue;
    }

    // Empty line
    if (!trimmed) {
      closeListIfNeeded();
      continue;
    }

    // Paragraph
    closeListIfNeeded();
    html += `<p>${formatInline(trimmed)}</p>\n`;
  }

  closeListIfNeeded();
  closeTableIfNeeded();

  return html;
}

function buildHtmlDocument() {
  console.log('Building full HTML compilation from docs...');
  let sectionsHtml = '';
  const tocEntries = [];

  for (const relPath of ORDERED_FILES) {
    const fullPath = join(DOCS_DIR, relPath);
    if (!existsSync(fullPath)) {
      console.warn(`File not found: ${relPath}`);
      continue;
    }

    const content = readFileSync(fullPath, 'utf8');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : relPath;
    const sectionId = 'doc-' + relPath.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

    tocEntries.push({
      path: relPath,
      title: title,
      id: sectionId,
    });

    const parsed = parseMarkdownToHtml(content);

    sectionsHtml += `
      <section class="doc-chapter" id="${sectionId}">
        <div class="chapter-meta">
          <span class="chapter-path">${escapeHtml(relPath)}</span>
        </div>
        ${parsed}
      </section>
      <div class="page-break"></div>
    `;
  }

  let tocHtml = '<nav class="table-of-contents">\n<h2>Table of Contents</h2>\n<ol>\n';
  tocEntries.forEach((entry, idx) => {
    tocHtml += `<li><a href="#${entry.id}"><span class="toc-num">${idx + 1}.</span> ${escapeHtml(entry.title)} <span class="toc-path">(${escapeHtml(entry.path)})</span></a></li>\n`;
  });
  tocHtml += '</ol>\n</nav>\n';

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OTP Platform — Canonical Documentation & Specification</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 15mm 20mm 15mm;
      @bottom-right {
        content: counter(page);
        font-family: 'Inter', sans-serif;
        font-size: 8pt;
        color: #64748b;
      }
      @bottom-left {
        content: "OTP Platform — Identity-Protected B2B Procurement";
        font-family: 'Inter', sans-serif;
        font-size: 8pt;
        color: #64748b;
      }
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.5;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }

    .cover-page {
      height: 90vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      padding: 40px 20px;
      page-break-after: always;
    }

    .cover-badge {
      display: inline-block;
      background: #0f172a;
      color: #ffffff;
      font-weight: 700;
      font-size: 11pt;
      padding: 6px 14px;
      border-radius: 4px;
      letter-spacing: 1.5px;
      margin-bottom: 24px;
    }

    .cover-title {
      font-size: 28pt;
      font-weight: 800;
      line-height: 1.15;
      color: #0f172a;
      margin: 0 0 16px 0;
    }

    .cover-subtitle {
      font-size: 14pt;
      font-weight: 400;
      color: #475569;
      margin: 0 0 40px 0;
      max-width: 650px;
    }

    .cover-metadata {
      border-top: 2px solid #e2e8f0;
      padding-top: 24px;
      margin-top: 40px;
      display: grid;
      grid-template-columns: 140px 1fr;
      row-gap: 10px;
      font-size: 10pt;
    }

    .meta-label {
      font-weight: 600;
      color: #64748b;
    }

    .meta-value {
      font-weight: 500;
      color: #0f172a;
    }

    .page-break {
      page-break-before: always;
      break-before: page;
    }

    .table-of-contents {
      padding: 20px 0;
      page-break-after: always;
    }

    .table-of-contents h2 {
      font-size: 18pt;
      font-weight: 700;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 20px;
    }

    .table-of-contents ol {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .table-of-contents li {
      margin-bottom: 8px;
      font-size: 9pt;
      line-height: 1.4;
    }

    .table-of-contents a {
      color: #0f172a;
      text-decoration: none;
    }

    .toc-num {
      font-weight: 700;
      color: #2563eb;
      display: inline-block;
      width: 28px;
    }

    .toc-path {
      color: #64748b;
      font-size: 8pt;
      margin-left: 6px;
    }

    .doc-chapter {
      padding-top: 15px;
      margin-bottom: 30px;
    }

    .chapter-meta {
      background: #f8fafc;
      border-left: 3px solid #2563eb;
      padding: 4px 10px;
      font-size: 8pt;
      font-family: monospace;
      color: #64748b;
      margin-bottom: 15px;
    }

    h1 {
      font-size: 18pt;
      font-weight: 800;
      color: #0f172a;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 6px;
      margin-top: 20px;
      margin-bottom: 14px;
      page-break-after: avoid;
    }

    h2 {
      font-size: 14pt;
      font-weight: 700;
      color: #1e293b;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 4px;
      margin-top: 18px;
      margin-bottom: 10px;
      page-break-after: avoid;
    }

    h3 {
      font-size: 11pt;
      font-weight: 600;
      color: #334155;
      margin-top: 14px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }

    p {
      margin: 0 0 10px 0;
      text-align: justify;
    }

    code {
      font-family: "JetBrains Mono", Consolas, "Liberation Mono", Menlo, Courier, monospace;
      font-size: 8pt;
      background: #f1f5f9;
      color: #0f172a;
      padding: 1.5px 4px;
      border-radius: 3px;
    }

    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 12px 14px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 7.5pt;
      line-height: 1.45;
      margin: 12px 0;
      page-break-inside: avoid;
    }

    pre code {
      background: transparent;
      color: #f8fafc;
      padding: 0;
      border-radius: 0;
    }

    .doc-table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
      font-size: 8pt;
      page-break-inside: avoid;
    }

    .doc-table th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      text-align: left;
      padding: 6px 8px;
      border: 1px solid #cbd5e1;
    }

    .doc-table td {
      padding: 5px 8px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }

    .doc-table tr:nth-child(even) td {
      background: #f8fafc;
    }

    ul, ol {
      margin: 0 0 10px 0;
      padding-left: 20px;
    }

    li {
      margin-bottom: 4px;
    }

    .callout {
      border-left: 4px solid;
      padding: 10px 14px;
      margin: 12px 0;
      border-radius: 0 4px 4px 0;
      font-size: 8.5pt;
      page-break-inside: avoid;
    }

    .callout p {
      margin: 0;
    }

    .callout-note {
      border-color: #3b82f6;
      background: #eff6ff;
      color: #1e3a8a;
    }

    .callout-warning {
      border-color: #f59e0b;
      background: #fffbeb;
      color: #78350f;
    }

    .callout-important {
      border-color: #ef4444;
      background: #fef2f2;
      color: #7f1d1d;
    }

    .callout-tip {
      border-color: #10b981;
      background: #ecfdf5;
      color: #064e3b;
    }

    hr {
      border: 0;
      border-top: 1px solid #e2e8f0;
      margin: 20px 0;
    }
  </style>
</head>
<body>

  <!-- COVER PAGE -->
  <div class="cover-page">
    <div class="cover-badge">OFFICIAL SYSTEM SPECIFICATION</div>
    <h1 class="cover-title">OTP — Open Trade &amp; Procurement</h1>
    <div class="cover-subtitle">
      Canonical Platform Architecture, System Blueprint, Domain Models, Governance Boundaries, Security Protocols &amp; Live Pilot Production Runbook
    </div>

    <div class="cover-metadata">
      <div class="meta-label">Release Decision:</div>
      <div class="meta-value">GREEN — EVIDENCE-BACKED PILOT RELEASE CERTIFIED</div>

      <div class="meta-label">Certificate ID:</div>
      <div class="meta-value">OTP-REL-CERT-20261015-002</div>

      <div class="meta-label">Database Ceiling:</div>
      <div class="meta-value">Migration 00271 (Synchronized on Hosted Supabase ap-south-1)</div>

      <div class="meta-label">Build Target:</div>
      <div class="meta-value">Production Vercel &amp; Supabase Cloud Platform</div>

      <div class="meta-label">Release Date:</div>
      <div class="meta-value">October 15, 2026</div>

      <div class="meta-label">Attestation:</div>
      <div class="meta-value">Product Owner &amp; Platform Architecture Group</div>
    </div>
  </div>

  <!-- TABLE OF CONTENTS -->
  ${tocHtml}

  <!-- CHAPTER CONTENTS -->
  ${sectionsHtml}

</body>
</html>`;

  writeFileSync(OUTPUT_HTML, fullHtml, 'utf8');
  console.log(`Saved compiled HTML to ${OUTPUT_HTML} (${statSync(OUTPUT_HTML).size} bytes)`);
}

function convertHtmlToPdf() {
  console.log('Invoking Chrome Headless to generate PDF...');
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--run-all-compositor-stages-before-draw',
    `--print-to-pdf=${OUTPUT_PDF}`,
    `file:///${OUTPUT_HTML.replace(/\\/g, '/')}`,
  ];

  try {
    execFileSync(CHROME_PATH, args, { stdio: 'inherit' });
    if (existsSync(OUTPUT_PDF)) {
      const stats = statSync(OUTPUT_PDF);
      console.log(`✅ SUCCESS: PDF Generated cleanly at:`);
      console.log(`   ${OUTPUT_PDF}`);
      console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB (${stats.size} bytes)`);
    } else {
      console.error('❌ Error: PDF file was not created.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Failed to run Chrome headless:', err);
    process.exit(1);
  }
}

try {
  buildHtmlDocument();
  convertHtmlToPdf();
} catch (e) {
  console.error(e);
  process.exit(1);
}
