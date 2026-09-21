// ==UserScript==
// @name         Jira: учет времени в часах
// @namespace    yunis-local-jira
// @version      1.0.2
// @description  Локально показывает оценку, остаток и затраченное время в часах.
// @match        https://jira.biz.zdravcity.rocks/browse/*
// @run-at       document-idle
// @grant        none
// @homepageURL   https://github.com/Yunis1936/jira-time-hours
// @downloadURL   https://raw.githubusercontent.com/Yunis1936/jira-time-hours/main/jira-time-in-hours.user.js
// @updateURL     https://raw.githubusercontent.com/Yunis1936/jira-time-hours/main/jira-time-in-hours.user.js
// ==/UserScript==

(function jiraTimeInHours() {
  "use strict";

  const HOURS_PER_DAY = 8;
  const HOURS_PER_WEEK = 40;
  const TARGET_LABELS = new Set(["оценка", "осталось", "затрачено"]);
  const UNIT_HOURS = {
    w: HOURS_PER_WEEK,
    d: HOURS_PER_DAY,
    h: 1,
    m: 1 / 60,
    н: HOURS_PER_WEEK,
    д: HOURS_PER_DAY,
    ч: 1,
    м: 1 / 60,
  };
  const DURATION_TOKEN = /(\d+(?:[.,]\d+)?)\s*([wdhmнчдм])/giu;

  function textOf(node) {
    return (node?.textContent || "").replace(/\s+/gu, " ").trim();
  }

  function labelKey(value) {
    return String(value)
      .replace(/\s*:\s*$/u, "")
      .replace(/ё/giu, "е")
      .trim()
      .toLowerCase();
  }

  function parseJiraDuration(source) {
    if (typeof source !== "string" || source.trim() === "") {
      return null;
    }

    let totalHours = 0;
    let matched = false;
    let consumedUntil = 0;

    for (const match of source.matchAll(DURATION_TOKEN)) {
      const separator = source.slice(consumedUntil, match.index).trim();
      if (separator !== "" && !/^[,+;]+$/u.test(separator)) {
        return null;
      }

      const amount = Number(match[1].replace(",", "."));
      const unit = match[2].toLowerCase();
      if (!Number.isFinite(amount) || UNIT_HOURS[unit] === undefined) {
        return null;
      }

      totalHours += amount * UNIT_HOURS[unit];
      matched = true;
      consumedUntil = match.index + match[0].length;
    }

    if (!matched || source.slice(consumedUntil).trim() !== "") {
      return null;
    }

    return Number(totalHours.toFixed(4));
  }

  function formatHours(hours) {
    if (!Number.isFinite(hours)) {
      return null;
    }

    const rounded = Number(hours.toFixed(4));
    return `${String(rounded).replace(".", ",")} ч`;
  }

  function displayValue(mode, original, hours) {
    return mode === "original" ? original : hours;
  }

  function findTimeTrackingPanels(root) {
    const panels = [];
    const addPanel = (panel) => {
      if (panel && !panels.includes(panel)) {
        panels.push(panel);
      }
    };

    const directPanel = root.querySelector?.("#timetrackingmodule");
    addPanel(directPanel);

    const headings = [...(root.querySelectorAll?.("h1, h2, h3, h4") || [])].filter(
      (node) => labelKey(textOf(node)) === "учет времени",
    );
    for (const heading of headings) {
      addPanel(heading.closest(".module, section, [role='region']"));
    }

    return panels;
  }

  function durationNodeIn(container) {
    if (!container) {
      return null;
    }

    const candidates = [container, ...(container.querySelectorAll?.("*") || [])];
    return candidates.find(
      (node) => node.children.length === 0 && parseJiraDuration(textOf(node)) !== null,
    );
  }

  function durationNodeForLabel(label) {
    for (
      let sibling = label.nextElementSibling;
      sibling;
      sibling = sibling.nextElementSibling
    ) {
      if (TARGET_LABELS.has(labelKey(textOf(sibling)))) {
        return null;
      }

      const durationNode = durationNodeIn(sibling);
      if (durationNode) {
        return durationNode;
      }
    }

    return null;
  }

  function updateToggleLabel(button, mode) {
    const showOriginal = mode !== "original";
    button.title = showOriginal
      ? "Показать исходный формат Jira"
      : "Показать часы";
    button.setAttribute(
      "aria-label",
      showOriginal ? "Показать исходный формат Jira" : "Показать часы",
    );
  }

  function ensureToggle(node) {
    let button = node.nextElementSibling?.matches("button[data-jira-hours-toggle]")
      ? node.nextElementSibling
      : null;

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.textContent = "↺";
      button.dataset.jiraHoursToggle = "true";
      button.style.cssText = [
        "margin-left:4px",
        "padding:0",
        "border:0",
        "background:transparent",
        "color:#42526e",
        "cursor:pointer",
        "font-size:13px",
        "line-height:1",
        "vertical-align:middle",
      ].join(";");
      node.insertAdjacentElement("afterend", button);
    }

    button.onclick = () => {
      const original = node.dataset.jiraHoursOriginal;
      const hours = node.dataset.jiraHoursHours;
      if (!original || !hours) {
        return;
      }

      const nextMode = node.dataset.jiraHoursMode === "original"
        ? "hours"
        : "original";
      node.dataset.jiraHoursMode = nextMode;
      node.textContent = displayValue(nextMode, original, hours);
      updateToggleLabel(button, nextMode);
    };

    updateToggleLabel(button, node.dataset.jiraHoursMode || "hours");
  }

  function convertDurationNode(node) {
    const original = node.dataset.jiraHoursOriginal || textOf(node);
    const hours = parseJiraDuration(original);
    const replacement = hours === null ? null : formatHours(hours);

    if (replacement === null) {
      return;
    }

    node.dataset.jiraHoursOriginal = original;
    node.dataset.jiraHoursHours = replacement;
    node.dataset.jiraHoursMode ||= "hours";
    node.title = original;

    if (node.dataset.jiraHoursMode !== "original") {
      node.textContent = replacement;
    }

    ensureToggle(node);
  }

  function refreshTimeTracking(root) {
    for (const panel of findTimeTrackingPanels(root)) {
      const labels = [
        ...panel.querySelectorAll("dt, label, .item-label, .field-label, span, div"),
      ];
      for (const label of labels) {
        if (!TARGET_LABELS.has(labelKey(textOf(label)))) {
          continue;
        }

        const durationNode = durationNodeForLabel(label);
        if (durationNode) {
          convertDurationNode(durationNode);
        }
      }
    }
  }

  function observeTimeTracking() {
    let queued = false;
    const refreshSoon = () => {
      if (queued) {
        return;
      }
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        refreshTimeTracking(document);
      });
    };

    new MutationObserver(refreshSoon).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    refreshSoon();
  }

  const testHook = globalThis.__JIRA_TIME_HOURS_TEST__;
  if (testHook) {
    testHook.api = { displayValue, formatHours, parseJiraDuration };
    return;
  }

  observeTimeTracking();
})();
