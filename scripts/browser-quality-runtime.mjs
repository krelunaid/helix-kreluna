export async function installPerformanceObservers(context) {
  await context.addInitScript(() => {
    const state = { lcpMs: null, cls: 0, longTasks: [], unsupported: [] };
    Object.defineProperty(globalThis, "__helixQualityPerformance", {
      value: state,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) state.lcpMs = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      state.unsupported.push("largest-contentful-paint");
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) state.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      state.unsupported.push("layout-shift");
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.longTasks.push(entry.duration);
      }).observe({ type: "longtask", buffered: true });
    } catch {
      state.unsupported.push("longtask");
    }
  });
}

export async function readPerformanceMetrics(frame, viewport, sourceBytes) {
  return frame.evaluate(
    ({ viewportName, artifactBytes }) => {
      const navigation = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource");
      const paints = performance.getEntriesByType("paint");
      const fcp = paints.find((entry) => entry.name === "first-contentful-paint");
      const observer = globalThis.__helixQualityPerformance;
      const loadMs = navigation?.loadEventEnd
        ? navigation.loadEventEnd - navigation.startTime
        : null;
      const domContentLoadedMs = navigation?.domContentLoadedEventEnd
        ? navigation.domContentLoadedEventEnd - navigation.startTime
        : null;
      const transferBytes = resources.reduce(
        (total, entry) => total + (entry.transferSize || 0),
        navigation?.transferSize || 0,
      );
      const decodedBytes = resources.reduce(
        (total, entry) => total + (entry.decodedBodySize || 0),
        navigation?.decodedBodySize || 0,
      );
      const longTasks = Array.isArray(observer?.longTasks)
        ? observer.longTasks
        : null;
      return {
        viewport: viewportName,
        loadMs: Number.isFinite(loadMs) ? Math.max(0, loadMs) : null,
        domContentLoadedMs: Number.isFinite(domContentLoadedMs)
          ? Math.max(0, domContentLoadedMs)
          : null,
        fcpMs: Number.isFinite(fcp?.startTime) ? Math.max(0, fcp.startTime) : null,
        lcpMs: Number.isFinite(observer?.lcpMs) ? Math.max(0, observer.lcpMs) : null,
        cls: Number.isFinite(observer?.cls) ? Math.max(0, observer.cls) : null,
        tbtMs: longTasks
          ? longTasks.reduce(
              (total, duration) => total + Math.max(0, duration - 50),
              0,
            )
          : null,
        requestCount: resources.length + (navigation ? 1 : 0),
        transferBytes: Math.max(0, Math.round(transferBytes)),
        decodedBytes: Math.max(0, Math.round(decodedBytes)),
        sourceBytes: artifactBytes,
      };
    },
    { viewportName: viewport.name, artifactBytes: sourceBytes },
  );
}

export async function auditAccessibility(frame, page, viewport) {
  const dom = await frame.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const describe = (element) => {
      const id = element.id ? `#${CSS.escape(element.id).slice(0, 80)}` : "";
      const classes = [...element.classList]
        .slice(0, 2)
        .map((name) => `.${CSS.escape(name).slice(0, 60)}`)
        .join("");
      return `${element.tagName.toLowerCase()}${id}${classes}`.slice(0, 220);
    };
    const rgb = (value) => {
      const values = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return values.length >= 3
        ? { r: values[0], g: values[1], b: values[2], a: values[3] ?? 1 }
        : null;
    };
    const luminance = (color) => {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * channel(color.r) +
        0.7152 * channel(color.g) +
        0.0722 * channel(color.b)
      );
    };
    const background = (element) => {
      let current = element;
      while (current) {
        const parsed = rgb(getComputedStyle(current).backgroundColor);
        if (parsed && parsed.a >= 0.95) return parsed;
        current = current.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const labelFor = (field) =>
      Boolean(
        field.getAttribute("aria-label") ||
          field.getAttribute("aria-labelledby") ||
          field.closest("label") ||
          (field.id && document.querySelector(`label[for="${CSS.escape(field.id)}"]`)),
      );
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled]):not([type=hidden])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
      "[contenteditable=true]",
    ].join(",");
    const fields = [...document.querySelectorAll("input,select,textarea")].filter(
      (element) => visible(element) && element.type !== "hidden",
    );
    const unlabeled = fields.filter((field) => !labelFor(field));
    const images = [...document.querySelectorAll("img")].filter(visible);
    const missingAlt = images.filter((image) => !image.hasAttribute("alt"));
    const invalidRoles = [...document.querySelectorAll("[role]")].filter((element) => {
      const role = element.getAttribute("role")?.trim().toLowerCase() ?? "";
      return ![
        "alert",
        "alertdialog",
        "application",
        "article",
        "banner",
        "button",
        "cell",
        "checkbox",
        "columnheader",
        "combobox",
        "complementary",
        "contentinfo",
        "dialog",
        "document",
        "feed",
        "figure",
        "form",
        "grid",
        "gridcell",
        "group",
        "heading",
        "img",
        "link",
        "list",
        "listbox",
        "listitem",
        "log",
        "main",
        "marquee",
        "math",
        "menu",
        "menubar",
        "menuitem",
        "menuitemcheckbox",
        "menuitemradio",
        "meter",
        "navigation",
        "none",
        "note",
        "option",
        "presentation",
        "progressbar",
        "radio",
        "radiogroup",
        "region",
        "row",
        "rowgroup",
        "rowheader",
        "scrollbar",
        "search",
        "searchbox",
        "separator",
        "slider",
        "spinbutton",
        "status",
        "switch",
        "tab",
        "table",
        "tablist",
        "tabpanel",
        "term",
        "textbox",
        "timer",
        "toolbar",
        "tooltip",
        "tree",
        "treegrid",
        "treeitem",
      ].includes(role);
    });
    const contrastFailures = [];
    const candidates = [...document.querySelectorAll("body *")]
      .filter(
        (element) =>
          visible(element) &&
          [...element.childNodes].some(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          ),
      )
      .slice(0, 500);
    for (const element of candidates) {
      const style = getComputedStyle(element);
      const foreground = rgb(style.color);
      if (!foreground) continue;
      const back = background(element);
      const lighter = Math.max(luminance(foreground), luminance(back));
      const darker = Math.min(luminance(foreground), luminance(back));
      const ratio = (lighter + 0.05) / (darker + 0.05);
      const size = Number.parseFloat(style.fontSize);
      const bold = Number.parseInt(style.fontWeight, 10) >= 700;
      const threshold = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      if (ratio < threshold) contrastFailures.push(describe(element));
    }
    const focusable = [...document.querySelectorAll(focusableSelector)].filter(visible);
    return {
      htmlLang: document.documentElement.lang.trim(),
      mainLandmarks: document.querySelectorAll('main,[role="main"]').length,
      unlabeled: unlabeled.map(describe).slice(0, 12),
      missingAlt: missingAlt.map(describe).slice(0, 12),
      invalidRoles: invalidRoles.map(describe).slice(0, 12),
      contrastFailures: contrastFailures.slice(0, 12),
      unlabeledCount: unlabeled.length,
      missingAltCount: missingAlt.length,
      invalidRoleCount: invalidRoles.length,
      contrastFailureCount: contrastFailures.length,
      focusableCount: focusable.length,
    };
  });

  await page.locator("#helix-generated-app").focus();
  const keyboardTargets = new Set();
  const focusIndicatorFailures = [];
  const tabAttempts = Math.min(16, Math.max(2, dom.focusableCount + 1));
  for (let index = 0; index < tabAttempts; index += 1) {
    await page.keyboard.press("Tab");
    const focused = await frame.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body || element === document.documentElement) {
        return null;
      }
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        key: `${element.tagName.toLowerCase()}#${element.id || ""}[${element.getAttribute("name") || ""}]`.slice(0, 220),
        visible: rect.width > 0 && rect.height > 0,
        indicator:
          (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== "none",
      };
    });
    if (focused?.visible) {
      keyboardTargets.add(focused.key);
      if (!focused.indicator) focusIndicatorFailures.push(focused.key);
    }
  }

  const findings = [];
  const add = (ruleId, category, severity, message, count, samples) => {
    if (count > 0) findings.push({ ruleId, category, severity, message, count, samples });
  };
  add(
    "form-control-name",
    "labels",
    "high",
    "Visible form controls need an accessible name.",
    dom.unlabeledCount,
    dom.unlabeled,
  );
  add(
    "text-contrast",
    "contrast",
    "high",
    "Visible text does not meet the WCAG contrast threshold in computed styles.",
    dom.contrastFailureCount,
    dom.contrastFailures,
  );
  add(
    "image-alt",
    "images",
    "medium",
    "Visible images need an alt attribute, including an empty alt for decorative images.",
    dom.missingAltCount,
    dom.missingAlt,
  );
  add(
    "aria-role-valid",
    "aria",
    "medium",
    "Elements contain an unrecognized ARIA role.",
    dom.invalidRoleCount,
    dom.invalidRoles,
  );
  add(
    "document-language",
    "language",
    "medium",
    "The document must declare a non-empty html lang.",
    dom.htmlLang ? 0 : 1,
    dom.htmlLang ? [] : ["html"],
  );
  add(
    "main-landmark",
    "landmarks",
    "medium",
    "The document needs exactly one main landmark.",
    dom.mainLandmarks === 1 ? 0 : 1,
    dom.mainLandmarks === 1 ? [] : [`main landmarks: ${dom.mainLandmarks}`],
  );
  add(
    "keyboard-reachability",
    "keyboard",
    "high",
    "No interactive control was reached through a real Tab sequence.",
    dom.focusableCount > 0 && keyboardTargets.size === 0 ? 1 : 0,
    dom.focusableCount > 0 && keyboardTargets.size === 0
      ? [`${dom.focusableCount} visible focusable element(s)`]
      : [],
  );
  add(
    "focus-visible",
    "focus",
    "medium",
    "Keyboard focus was reached without a computed outline or box-shadow indicator.",
    focusIndicatorFailures.length,
    [...new Set(focusIndicatorFailures)].slice(0, 12),
  );
  return {
    viewport: viewport.name,
    findings,
    checksRun: 8,
    focusableElements: dom.focusableCount,
    keyboardTargetsReached: keyboardTargets.size,
  };
}

export function mergeAccessibilityResults(results) {
  const merged = new Map();
  for (const result of results) {
    for (const finding of result.findings) {
      const current = merged.get(finding.ruleId);
      if (!current) {
        merged.set(finding.ruleId, { ...finding });
      } else {
        current.count += finding.count;
        current.samples = [...new Set([...current.samples, ...finding.samples])].slice(
          0,
          12,
        );
      }
    }
  }
  return [...merged.values()];
}
