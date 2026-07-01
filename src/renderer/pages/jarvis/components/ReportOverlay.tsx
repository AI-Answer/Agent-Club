/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Report reveal overlay — renders a vault markdown deliverable inside the
// HUD (no app switch, stays cinematic). Animates out from the core. Esc or
// the × closes it (HUD owns the Esc handling). Zero-dep renderer: reports
// are runner-generated markdown — headings, bullets, bold, links, hr.
// ---------------------------------------------------------------------------

import React from 'react';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function mdToHtml(md: string): string {
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      closeList();
      const lvl = Math.min(h[1].length + 1, 5); // # → h2 (overlay title is h1)
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line)) {
      closeList();
      out.push('<hr/>');
      continue;
    }
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    closeList();
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join('\n');
}

// Obsidian vault name (folder basename) — the obsidian:// URI needs the exact
// name. Set to a non-empty string to surface an "open in Obsidian" deep link
// on vault notes; empty (default) hides it. Optional, no env coupling.
const OBSIDIAN_VAULT = '';

export default function ReportOverlay({
  report,
  onClose,
  action,
}: {
  report: { path: string; content: string };
  onClose: () => void;
  /** optional header action (e.g. the transcript's reset button) */
  action?: { label: string; onClick: () => void };
}) {
  const title = report.path.split('/').pop()?.replace(/\.md$/, '') ?? report.path;
  // synthetic docs (e.g. the voice transcript) aren't vault notes — no deep link
  const isVaultNote = report.path.endsWith('.md');
  const obsidianHref = `obsidian://open?vault=${encodeURIComponent(OBSIDIAN_VAULT)}&file=${encodeURIComponent(report.path.replace(/\.md$/, ''))}`;
  return (
    <div className="report-overlay" onClick={onClose}>
      <div className="report-panel" onClick={(e) => e.stopPropagation()}>
        <div className="report-head">
          <span className="report-title">{title}</span>
          <span className="report-path">{report.path}</span>
          {isVaultNote && OBSIDIAN_VAULT && (
            <a className="report-obsidian" href={obsidianHref}>
              open in Obsidian ↗
            </a>
          )}
          {action && (
            <button className="report-obsidian report-action" onClick={action.onClick}>
              {action.label}
            </button>
          )}
          <button className="report-close" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="report-body" dangerouslySetInnerHTML={{ __html: mdToHtml(report.content) }} />
      </div>
    </div>
  );
}
