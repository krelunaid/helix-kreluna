import type {
  BuildQualityEvidence,
  TwinBrowserReport,
} from "@/lib/server/quality/types";

export type TwinReport = TwinBrowserReport;

export const SCORE_METRIC_IDS = [
  "security",
  "performance",
  "scalability",
  "accessibility",
  "reliability",
  "quality",
  "cost",
  "coverage",
] as const;

export type ScoreMetricId = (typeof SCORE_METRIC_IDS)[number];
export type ScoreEvidenceKind = "measured" | "estimated" | "not_run";
export type ScoreMetricStatus =
  | "completed"
  | "not_run"
  | "failed"
  | "not_applicable";

export type ScoreMetric = {
  id: ScoreMetricId;
  value: number | null;
  evidence: ScoreEvidenceKind;
  status: ScoreMetricStatus;
  confidence: number;
  source: string;
  artifactSha256?: string;
  limitations: string[];
};

export type ReadinessEvidence = {
  value: number;
  evidence: "estimated";
  confidence: number;
  measuredWeight: number;
  estimatedWeight: number;
  notRunWeight: number;
  basis: string[];
  disclaimer: string;
};

export type Improvement = {
  id: string;
  metric: string;
  from: number;
  to: number;
  action: string;
  detail: string;
  evidence: "estimated";
  confidence: number;
};

export type CouncilSignal = {
  seat: string;
  score: number | null;
  evidence: ScoreEvidenceKind;
  confidence: number;
  source: string;
};

export type CapacityForecast =
  | {
      status: "not_run";
      evidence: "not_run";
      confidence: 0;
      range: null;
      missingEvidence: string[];
      verdict: string;
    }
  | {
      status: "completed";
      evidence: "estimated";
      confidence: number;
      range: { min: number; max: number; unit: string };
      missingEvidence: [];
      verdict: string;
    };

export type KrelunaScore = {
  schemaVersion: "2.0.0";
  formulaVersion: "kreluna-score-v2";
  artifactSha256: string;
  generatedAt: string;
  readiness: number;
  readinessEvidence: ReadinessEvidence;
  metrics: Record<ScoreMetricId, ScoreMetric>;
  security: number;
  performance: number;
  scalability: number;
  accessibility: number;
  reliability: number | null;
  quality: number;
  cost: number;
  coverage: number | null;
  costEur: number;
  costScenario: {
    evidence: "estimated";
    confidence: number;
    currency: "EUR";
    period: "month";
    selectedConfigId: string;
    assumptions: string[];
  };
  configs: { id: string; label: string; eur: number; note: string }[];
  critical: string[];
  watch: string[];
  improvements: Improvement[];
  council: {
    kind: "automated_formula";
    evidence: "estimated";
    confidence: number;
    pick: string;
    rejected: string;
    why: string;
    signals: CouncilSignal[];
  };
  capacityForecast: CapacityForecast;
};

type ImprovementDraft = Omit<Improvement, "evidence" | "confidence">;

const METRIC_WEIGHTS: Record<ScoreMetricId, number> = {
  security: 0.18,
  performance: 0.12,
  scalability: 0.12,
  accessibility: 0.1,
  reliability: 0.18,
  quality: 0.12,
  cost: 0.08,
  coverage: 0.1,
};

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function confidence(n: number) {
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function htmlSha256(html: string): Promise<string> {
  const bytes = new TextEncoder().encode(html);
  const digest = await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function metric(input: ScoreMetric): ScoreMetric {
  return {
    ...input,
    value: input.value === null ? null : clamp(input.value),
    confidence: confidence(input.confidence),
  };
}

function unavailableMetric(input: {
  id: ScoreMetricId;
  status: Exclude<ScoreMetricStatus, "completed">;
  source: string;
  evidence?: ScoreEvidenceKind;
  confidence?: number;
  artifactSha256?: string;
  limitations?: string[];
}): ScoreMetric {
  return metric({
    id: input.id,
    value: null,
    evidence: input.evidence ?? "not_run",
    status: input.status,
    confidence: input.confidence ?? 0,
    source: input.source,
    ...(input.artifactSha256
      ? { artifactSha256: input.artifactSha256 }
      : {}),
    limitations: input.limitations ?? [],
  });
}

function exactReport<T extends { artifactSha256: string }>(
  report: T | undefined,
  artifactSha256: string,
): T | undefined {
  return report?.artifactSha256 === artifactSha256 ? report : undefined;
}

function performanceScore(
  swift: Extract<NonNullable<BuildQualityEvidence["swift"]>, { status: "completed" }>,
) {
  const viewportScores = swift.metrics.map((entry) => {
    let value = 100;
    if (entry.loadMs !== null) {
      if (entry.loadMs > 5_000) value -= 20;
      else if (entry.loadMs > 3_000) value -= 10;
    }
    if (entry.lcpMs !== null) {
      if (entry.lcpMs > 4_000) value -= 30;
      else if (entry.lcpMs > 2_500) value -= 15;
    }
    if (entry.cls !== null) {
      if (entry.cls > 0.25) value -= 25;
      else if (entry.cls > 0.1) value -= 10;
    }
    if (entry.tbtMs !== null) {
      if (entry.tbtMs > 600) value -= 25;
      else if (entry.tbtMs > 200) value -= 10;
    }
    if (entry.transferBytes > 2_000_000) value -= 15;
    if (entry.requestCount > 100) value -= 10;
    return clamp(value);
  });
  return Math.min(...viewportScores);
}

function reportState(
  report:
    | BuildQualityEvidence["twin"]
    | BuildQualityEvidence["echo"]
    | BuildQualityEvidence["swift"],
  fallback: string,
) {
  if (!report) return fallback;
  if (report.status === "not_run") return report.detail;
  if (report.status === "failed") return report.detail;
  return fallback;
}

export async function computeScore(
  html: string,
  prompt: string,
  quality?: BuildQualityEvidence | null,
  locale: string = "en",
): Promise<KrelunaScore> {
  const it = locale.toLowerCase().startsWith("it");
  const p = prompt.toLowerCase();
  const artifactSha256 = await htmlSha256(html);
  const critical: string[] = [];
  const watch: string[] = [];
  const improvements: ImprovementDraft[] = [];

  let security = 96;
  if (/localStorage|sessionStorage|document\.cookie/.test(html)) {
    security -= 24;
    critical.push(
      it
        ? "Storage nel sandbox non regge. Tieni lo stato in memoria."
        : "Storage APIs will fail in the sandbox. Keep state in memory.",
    );
    improvements.push({
      id: "mem",
      metric: it ? "Sicurezza" : "Security",
      from: security,
      to: Math.min(96, security + 20),
      action: it
        ? "Sostituisci lo storage con stato in memoria"
        : "Replace storage with in-memory state",
      detail: it
        ? "L’anteprima a origine opaca non persiste. Usa stato in memoria."
        : "The opaque-origin preview cannot persist. Use in-memory state.",
    });
  }
  if (/\beval\(|innerHTML\s*=/.test(html)) {
    security -= 18;
    critical.push(
      it ? "Iniezione HTML / eval non sicuri." : "Unsafe HTML injection / eval.",
    );
  }
  if (/http:\/\//i.test(html) && !/localhost/.test(html)) {
    security -= 8;
    watch.push(
      it ? "URL http:// a contenuto misto." : "Mixed-content http:// URLs.",
    );
  }
  if (/<input[^>]+type=["']?email/i.test(html) && !/privacy|gdpr/i.test(html)) {
    security -= 8;
    watch.push(
      it
        ? "Raccoglie email senza nota privacy."
        : "Collects email without a privacy note.",
    );
    improvements.push({
      id: "privacy",
      metric: it ? "Sicurezza" : "Security",
      from: security,
      to: Math.min(96, security + 8),
      action: it
        ? "Aggiungi una riga di privacy vicino al form"
        : "Add a one-line privacy note near the form",
      detail: it
        ? "GDPR: di’ cosa salvi, anche in un prototipo."
        : "GDPR: say what you store, even in a prototype.",
    });
  }

  const exactAegis = exactReport(quality?.aegis, artifactSha256);
  if (quality?.aegis && !exactAegis) {
    critical.push(
      it
        ? "Le prove Aegis non corrispondono all’artefatto corrente."
        : "Aegis evidence does not match the current artifact.",
    );
  }
  const securityMetric = exactAegis
    ? metric({
        id: "security",
        value:
          100 -
          exactAegis.findings.reduce((total, finding) => {
            const penalty = {
              blocker: 40,
              high: 20,
              medium: 8,
              low: 3,
              info: 0,
            }[finding.severity];
            return total + penalty;
          }, 0),
        evidence: "measured",
        status: "completed",
        confidence: 0.65,
        source: it ? "Scansione statica Aegis misurata" : "Measured Aegis static scan",
        artifactSha256,
        limitations: exactAegis.limitations,
      })
    : metric({
        id: "security",
        value: security,
        evidence: "estimated",
        status: "completed",
        confidence: 0.3,
        source: it ? "Euristica statica del sorgente" : "Static source heuristic",
        limitations: [
          it
            ? "Aegis non ha prodotto prove per questo hash."
            : "Aegis did not produce evidence for this hash.",
        ],
      });
  for (const finding of exactAegis?.findings ?? []) {
    if (finding.severity === "blocker" || finding.severity === "high") {
      critical.push(`Aegis ${finding.severity}: ${finding.message}`);
    }
  }

  let sourcePerformance = 92;
  const kb = new TextEncoder().encode(html).byteLength / 1024;
  if (kb > 90) {
    sourcePerformance -= 18;
    watch.push(
      it ? `Il sorgente pesa ${Math.round(kb)} KB.` : `Source is ${Math.round(kb)} KB.`,
    );
    improvements.push({
      id: "slim",
      metric: it ? "Prestazioni" : "Performance",
      from: sourcePerformance,
      to: Math.min(94, sourcePerformance + 12),
      action: it ? "Taglia CSS e foto inutili" : "Trim unused CSS and extra photos",
      detail: it
        ? "Stima statica sul peso sorgente; non è una misura di produzione."
        : "Static source-weight estimate; this is not a production measurement.",
    });
  } else if (kb > 55) sourcePerformance -= 8;
  const photos = (html.match(/images\.unsplash\.com/g) ?? []).length;
  if (photos > 8) {
    sourcePerformance -= 10;
    watch.push(
      it
        ? "Troppe foto remote a piena risoluzione."
        : "Too many full-size remote photos.",
    );
  }
  const exactSwift = exactReport(quality?.swift, artifactSha256);
  const performanceMetric =
    exactSwift?.status === "completed"
      ? metric({
          id: "performance",
          value: performanceScore(exactSwift),
          evidence: "measured",
          status: "completed",
          confidence: 0.7,
          source: it
            ? "Metriche browser Swift misurate"
            : "Measured Swift browser metrics",
          artifactSha256,
          limitations: exactSwift.limitations,
        })
      : metric({
          id: "performance",
          value: sourcePerformance,
          evidence: "estimated",
          status: "completed",
          confidence: 0.25,
          source: it
            ? "Stima basata sul peso del sorgente"
            : "Source-size estimate",
          limitations: [
            reportState(
              quality?.swift,
              it
                ? "Swift browser non eseguito."
                : "Swift browser was not run.",
            ),
          ],
        });

  let scalability = /prenot|book|login|account|pay|stripe|lista|crud|dashboard/.test(
    p,
  )
    ? 72
    : 86;
  if (/pagament|stripe|abbon|subscription|auth|login/.test(p)) {
    scalability = 64;
    watch.push(
      it
        ? "Serve un backend vero prima di stimare la capacità."
        : "A real backend is required before capacity can be estimated.",
    );
    improvements.push({
      id: "api",
      metric: it ? "Scalabilità" : "Scalability",
      from: scalability,
      to: 84,
      action: it
        ? "Porta l’API in memoria su Postgres"
        : "Promote the in-memory API to Postgres",
      detail: it
        ? "Capacity forecast non eseguita: mancano benchmark e dati infrastrutturali."
        : "Capacity forecast not run: benchmark and infrastructure data are missing.",
    });
  }
  const scalabilityMetric = metric({
    id: "scalability",
    value: scalability,
    evidence: "estimated",
    status: "completed",
    confidence: 0.2,
    source: it
      ? "Euristica su brief e architettura del prototipo"
      : "Brief and prototype-architecture heuristic",
    limitations: [
      it
        ? "Nessun load test, profilo DB o limite di concorrenza misurato."
        : "No load test, DB profile or measured concurrency limit.",
    ],
  });

  let sourceAccessibility = 90;
  if (/<input/i.test(html) && !/<label/i.test(html)) {
    sourceAccessibility -= 18;
    critical.push(it ? "Campi senza etichetta." : "Inputs without labels.");
    improvements.push({
      id: "labels",
      metric: it ? "Accessibilità" : "Accessibility",
      from: sourceAccessibility,
      to: Math.min(94, sourceAccessibility + 16),
      action: it ? "Metti una label su ogni input" : "Wrap every input in a label",
      detail: it
        ? "Controllo statico: i lettori di schermo richiedono nomi accessibili."
        : "Static check: screen readers require accessible names.",
    });
  }
  if (!/<html[^>]*lang=/i.test(html)) {
    sourceAccessibility -= 8;
    watch.push(it ? "Manca html lang." : "Missing html lang.");
  }
  if (!/<button|<a /i.test(html)) {
    sourceAccessibility -= 20;
    critical.push(it ? "Nessuna azione cliccabile." : "No clickable actions.");
  }
  const exactEcho = exactReport(quality?.echo, artifactSha256);
  const accessibilityMetric =
    exactEcho?.status === "completed"
      ? metric({
          id: "accessibility",
          value:
            100 -
            exactEcho.findings.reduce((total, finding) => {
              const penalty = { high: 20, medium: 8, low: 3 }[
                finding.severity
              ];
              return total + penalty * finding.count;
            }, 0),
          evidence: "measured",
          status: "completed",
          confidence: 0.55,
          source: it
            ? "Controlli browser Echo misurati"
            : "Measured Echo browser checks",
          artifactSha256,
          limitations: exactEcho.limitations,
        })
      : metric({
          id: "accessibility",
          value: sourceAccessibility,
          evidence: "estimated",
          status: "completed",
          confidence: 0.25,
          source: it
            ? "Euristica statica di accessibilità"
            : "Static accessibility heuristic",
          limitations: [
            reportState(
              quality?.echo,
              it ? "Echo browser non eseguito." : "Echo browser was not run.",
            ),
          ],
        });
  for (const finding of exactEcho?.status === "completed"
    ? exactEcho.findings
    : []) {
    if (finding.severity === "high") critical.push(`Echo: ${finding.message}`);
  }

  const exactTwin = exactReport(quality?.twin, artifactSha256);
  let reliabilityMetric: ScoreMetric;
  let coverageMetric: ScoreMetric;
  if (quality?.twin && !exactTwin) {
    critical.push(
      it
        ? "Le prove Twin non corrispondono all’artefatto corrente."
        : "Twin evidence does not match the current artifact.",
    );
    reliabilityMetric = unavailableMetric({
      id: "reliability",
      status: "failed",
      source: it ? "Hash Twin non corrispondente" : "Twin artifact hash mismatch",
    });
    coverageMetric = unavailableMetric({
      id: "coverage",
      status: "failed",
      source: it ? "Hash Twin non corrispondente" : "Twin artifact hash mismatch",
    });
  } else if (exactTwin?.status === "completed") {
    const errors = [...exactTwin.consoleErrors, ...exactTwin.runtimeErrors];
    const deadClicks = exactTwin.actions.filter(
      (action) =>
        (action.type === "click" || action.type === "submit") &&
        (action.status === "no_change" || action.status === "failed"),
    ).length;
    reliabilityMetric = metric({
      id: "reliability",
      value: 100 - Math.min(50, errors.length * 15) - Math.min(40, deadClicks * 10),
      evidence: "measured",
      status: "completed",
      confidence: 0.7,
      source: it
        ? "Errori runtime e azioni Twin misurati"
        : "Measured Twin runtime errors and actions",
      artifactSha256,
      limitations: [
        it
          ? "Misura il percorso esplorato dal runner, non ogni flusso possibile."
          : "Covers the runner's explored path, not every possible flow.",
      ],
    });
    if (errors.length) critical.push(`Twin: ${errors[0].slice(0, 120)}`);
    if (deadClicks > 0) {
      critical.push(
        `${deadClicks} ${
          it
            ? "controlli non hanno prodotto un cambiamento nel test browser Twin."
            : "control(s) produced no change in the Twin browser run."
        }`,
      );
      improvements.push({
        id: "clicks",
        metric: it ? "Affidabilità" : "Reliability",
        from: reliabilityMetric.value ?? 0,
        to: Math.min(94, (reliabilityMetric.value ?? 0) + 16),
        action: it
          ? "I tasti principali devono cambiare la schermata"
          : "Make primary buttons change the UI",
        detail: it
          ? "Conferma, apri, aggiungi — Twin deve osservare un cambiamento."
          : "Confirm, open, add — Twin must observe a change.",
      });
    }
    coverageMetric =
      exactTwin.summary.controlsDiscovered > 0
        ? metric({
            id: "coverage",
            value:
              (exactTwin.summary.controlsExercised /
                exactTwin.summary.controlsDiscovered) *
              100,
            evidence: "measured",
            status: "completed",
            confidence: 0.9,
            source: it
              ? "Copertura azioni Twin misurata"
              : "Measured Twin action coverage",
            artifactSha256,
            limitations: [
              it
                ? "Copertura dei controlli scoperti, non copertura del codice."
                : "Coverage of discovered controls, not code coverage.",
            ],
          })
        : unavailableMetric({
            id: "coverage",
            status: "not_applicable",
            evidence: "measured",
            confidence: 0.9,
            artifactSha256,
            source: it
              ? "Twin non ha scoperto controlli interattivi."
              : "Twin discovered no interactive controls.",
          });
  } else {
    const twinStatus = exactTwin?.status ?? "not_run";
    const source = reportState(
      exactTwin,
      it ? "Twin browser non eseguito." : "Twin browser was not run.",
    );
    reliabilityMetric = unavailableMetric({
      id: "reliability",
      status: twinStatus === "failed" ? "failed" : "not_run",
      source,
      ...(exactTwin ? { artifactSha256 } : {}),
    });
    coverageMetric = unavailableMetric({
      id: "coverage",
      status: twinStatus === "failed" ? "failed" : "not_run",
      source,
      ...(exactTwin ? { artifactSha256 } : {}),
    });
  }

  let qualityValue = 88;
  if (/lorem ipsum|welcome to our app|your company/i.test(html)) {
    qualityValue -= 20;
    critical.push(
      it
        ? "Copia segnaposto ancora nel prodotto."
        : "Placeholder copy still in the product.",
    );
  }
  if (!/<\/style>/.test(html) || !/<\/script>/.test(html)) qualityValue -= 10;
  const qualityMetric = metric({
    id: "quality",
    value: qualityValue,
    evidence: "estimated",
    status: "completed",
    confidence: 0.3,
    source: it ? "Euristica statica del sorgente" : "Static source heuristic",
    limitations: [
      it
        ? "Non sostituisce compile, unit test o code review."
        : "Does not replace compilation, unit tests or code review.",
    ],
  });

  const heavy = /pagament|stripe|login|auth|account/.test(p);
  const data = /prenot|book|lista|dashboard|crud/.test(p);
  const configs = heavy
    ? [
        { id: "A", label: "A · full", eur: 160, note: "Auth + pay + API + Postgres" },
        { id: "B", label: "B · lean", eur: 90, note: "Small API, managed auth" },
        { id: "C", label: "C · preview", eur: 55, note: "Static preview only" },
      ]
    : data
      ? [
          { id: "A", label: "A · api", eur: 38, note: "Tiny backend + DB" },
          { id: "B", label: "B · plus", eur: 18, note: "PWA + analytics" },
          { id: "C", label: "C · static", eur: 8, note: "Static hosting scenario" },
        ]
      : [
          { id: "A", label: "A · brand", eur: 22, note: "CDN + forms service" },
          { id: "B", label: "B · site", eur: 12, note: "Static + domain" },
          { id: "C", label: "C · preview", eur: 8, note: "Static preview" },
        ];
  const selectedConfig = configs[1];
  const costEur = selectedConfig.eur;
  const costMetric = metric({
    id: "cost",
    value: 100 - costEur / 3,
    evidence: "estimated",
    status: "completed",
    confidence: 0.2,
    source: it ? "Scenario di costo statico" : "Static cost scenario",
    limitations: [
      it
        ? "Nessuna fattura provider, traffico o utilizzo misurato."
        : "No provider invoice, traffic or usage was measured.",
    ],
  });

  const metrics: Record<ScoreMetricId, ScoreMetric> = {
    security: securityMetric,
    performance: performanceMetric,
    scalability: scalabilityMetric,
    accessibility: accessibilityMetric,
    reliability: reliabilityMetric,
    quality: qualityMetric,
    cost: costMetric,
    coverage: coverageMetric,
  };

  let weightedScore = 0;
  let availableWeight = 0;
  let measuredWeight = 0;
  let estimatedWeight = 0;
  let evidenceConfidence = 0;
  for (const id of SCORE_METRIC_IDS) {
    const entry = metrics[id];
    const weight = METRIC_WEIGHTS[id];
    if (entry.status === "completed" && entry.value !== null) {
      weightedScore += entry.value * weight;
      availableWeight += weight;
      evidenceConfidence += weight * entry.confidence;
      if (entry.evidence === "measured") measuredWeight += weight;
      if (entry.evidence === "estimated") estimatedWeight += weight;
    }
  }
  const readiness = clamp(weightedScore / Math.max(availableWeight, 0.01));
  const measuredPercent = clamp(measuredWeight * 100);
  const estimatedPercent = clamp(estimatedWeight * 100);
  const notRunPercent = Math.max(0, 100 - measuredPercent - estimatedPercent);
  const readinessEvidence: ReadinessEvidence = {
    value: readiness,
    evidence: "estimated",
    confidence: confidence(evidenceConfidence),
    measuredWeight: measuredPercent,
    estimatedWeight: estimatedPercent,
    notRunWeight: notRunPercent,
    basis: SCORE_METRIC_IDS.map(
      (id) => `${id}:${metrics[id].evidence}/${metrics[id].status}`,
    ),
    disclaimer: it
      ? "Aggregato stimato, non autorizza il rilascio e non è una misura di capacità."
      : "Estimated aggregate; it does not authorize release and is not a capacity measurement.",
  };

  const signal = (seat: string, entry: ScoreMetric): CouncilSignal => ({
    seat,
    score: entry.value === null ? null : +(entry.value / 10).toFixed(1),
    evidence: entry.value === null ? "not_run" : entry.evidence,
    confidence: entry.value === null ? 0 : entry.confidence,
    source: entry.source,
  });
  const criticalItems = unique(critical).slice(0, 6);
  const council = {
    kind: "automated_formula" as const,
    evidence: "estimated" as const,
    confidence: readinessEvidence.confidence,
    pick: criticalItems.length
      ? it
        ? `Correggi ${criticalItems.length} blocchi, poi torna alla revisione umana`
        : `Fix ${criticalItems.length} blocker(s), then return to human review`
      : it
        ? "Rivedi il candidato; nessuna decisione automatica di rilascio"
        : "Review the candidate; no automatic release decision",
    rejected: it
      ? "Il rilascio automatico e gli store non sono valutati"
      : "Automatic release and store submission are not evaluated",
    why: it
      ? `Formula automatica: ${measuredPercent}% misurato, ${estimatedPercent}% stimato, ${notRunPercent}% non eseguito. Serve sempre l’approvazione umana.`
      : `Automated formula: ${measuredPercent}% measured, ${estimatedPercent}% estimated, ${notRunPercent}% not run. Human approval is always required.`,
    signals: [
      signal("Architecture heuristic", metrics.scalability),
      signal("Static security evidence", metrics.security),
      signal("Performance evidence", metrics.performance),
      signal("Cost scenario", metrics.cost),
      {
        seat: "Capacity forecast",
        score: null,
        evidence: "not_run" as const,
        confidence: 0,
        source: it
          ? "Load test e dati infrastrutturali mancanti"
          : "Load test and infrastructure evidence missing",
      },
    ],
  };

  const capacityForecast: CapacityForecast = {
    status: "not_run",
    evidence: "not_run",
    confidence: 0,
    range: null,
    missingEvidence: it
      ? [
          "load test di produzione",
          "profilo e capacità del database",
          "topologia del deploy",
          "telemetria dei costi",
          "limiti di concorrenza",
        ]
      : [
          "production load test",
          "database profile and capacity",
          "deployment topology",
          "cost telemetry",
          "concurrency limits",
        ],
    verdict: it
      ? "Capacity forecast NON ESEGUITA: mancano prove misurate sufficienti."
      : "Capacity forecast NOT RUN: sufficient measured evidence is missing.",
  };

  const result: KrelunaScore = {
    schemaVersion: "2.0.0",
    formulaVersion: "kreluna-score-v2",
    artifactSha256,
    generatedAt: new Date().toISOString(),
    readiness,
    readinessEvidence,
    metrics,
    security: metrics.security.value ?? 0,
    performance: metrics.performance.value ?? 0,
    scalability: metrics.scalability.value ?? 0,
    accessibility: metrics.accessibility.value ?? 0,
    reliability: metrics.reliability.value,
    quality: metrics.quality.value ?? 0,
    cost: metrics.cost.value ?? 0,
    coverage: metrics.coverage.value,
    costEur,
    costScenario: {
      evidence: "estimated",
      confidence: 0.2,
      currency: "EUR",
      period: "month",
      selectedConfigId: selectedConfig.id,
      assumptions: [selectedConfig.note],
    },
    configs,
    critical: criticalItems,
    watch: unique(watch).slice(0, 6),
    improvements: improvements.slice(0, 4).map((item) => ({
      ...item,
      evidence: "estimated",
      confidence: 0.3,
    })),
    council,
    capacityForecast,
  };
  const validated = normalizePersistedScore(result, artifactSha256);
  if (!validated) throw new Error("KRELUNA_SCORE_OUTPUT_INVALID");
  return validated;
}

export function getScoreMetric(
  score: KrelunaScore,
  id: ScoreMetricId,
): ScoreMetric {
  const current = score.metrics?.[id];
  if (current) return current;
  const legacyValue = score[id];
  if (
    legacyValue === null ||
    legacyValue === undefined ||
    (id === "coverage" && legacyValue === 0)
  ) {
    return unavailableMetric({
      id,
      status: "not_run",
      source: "Legacy score without evidence metadata",
    });
  }
  return metric({
    id,
    value: legacyValue,
    evidence: "estimated",
    status: "completed",
    confidence: 0.1,
    source: "Legacy heuristic score without evidence metadata",
    limitations: ["Rebuild the candidate to generate a v2 evidence contract."],
  });
}

export function getReadinessEvidence(score: KrelunaScore): ReadinessEvidence {
  if (score.readinessEvidence) return score.readinessEvidence;
  return {
    value: score.readiness,
    evidence: "estimated",
    confidence: 0.1,
    measuredWeight: 0,
    estimatedWeight: 80,
    notRunWeight: 20,
    basis: ["legacy:estimated"],
    disclaimer:
      "Legacy estimated aggregate; rebuild the candidate to generate evidence metadata.",
  };
}

export function getCapacityForecast(score: KrelunaScore): CapacityForecast {
  if (score.capacityForecast) return score.capacityForecast;
  return {
    status: "not_run",
    evidence: "not_run",
    confidence: 0,
    range: null,
    missingEvidence: [
      "production load test",
      "database profile and capacity",
      "deployment topology",
      "cost telemetry",
      "concurrency limits",
    ],
    verdict: "Capacity forecast NOT RUN: legacy score has no measured evidence.",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteRange(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isScoreMetric(value: unknown, id: ScoreMetricId): value is ScoreMetric {
  if (!isRecord(value) || value.id !== id) return false;
  if (
    !["measured", "estimated", "not_run"].includes(String(value.evidence)) ||
    !["completed", "not_run", "failed", "not_applicable"].includes(
      String(value.status),
    ) ||
    !isFiniteRange(value.confidence, 0, 1) ||
    typeof value.source !== "string" ||
    !Array.isArray(value.limitations) ||
    !value.limitations.every((item) => typeof item === "string")
  ) {
    return false;
  }
  if (value.status === "completed") {
    return (
      isFiniteRange(value.value, 0, 100) &&
      (value.evidence === "measured" || value.evidence === "estimated")
    );
  }
  return value.value === null;
}

/**
 * Scores are stored inside the durable job payload. New v2 scores are accepted
 * only when their evidence contract is structurally valid and bound to the
 * sealed database artifact. Legacy scores are exposed only for sealed jobs and
 * the UI labels every legacy value as a low-confidence estimate.
 */
export function normalizePersistedScore(
  value: unknown,
  sealedArtifactSha256?: string,
): KrelunaScore | undefined {
  if (!isRecord(value) || !sealedArtifactSha256) return undefined;
  if (value.schemaVersion !== "2.0.0") {
    return isFiniteRange(value.readiness, 0, 100) && isRecord(value.council)
      ? (value as unknown as KrelunaScore)
      : undefined;
  }
  if (!isRecord(value.metrics)) return undefined;
  const storedMetrics = value.metrics;
  if (
    value.formulaVersion !== "kreluna-score-v2" ||
    value.artifactSha256 !== sealedArtifactSha256 ||
    !/^[a-f0-9]{64}$/.test(String(value.artifactSha256)) ||
    typeof value.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    !isFiniteRange(value.readiness, 0, 100) ||
    !SCORE_METRIC_IDS.every((id) => isScoreMetric(storedMetrics[id], id)) ||
    !isRecord(value.readinessEvidence) ||
    value.readinessEvidence.evidence !== "estimated" ||
    !isFiniteRange(value.readinessEvidence.confidence, 0, 1) ||
    !isRecord(value.council) ||
    value.council.kind !== "automated_formula" ||
    !Array.isArray(value.council.signals) ||
    !isRecord(value.capacityForecast)
  ) {
    return undefined;
  }
  if (
    value.capacityForecast.status === "not_run" &&
    (value.capacityForecast.evidence !== "not_run" ||
      value.capacityForecast.confidence !== 0 ||
      value.capacityForecast.range !== null)
  ) {
    return undefined;
  }
  return value as unknown as KrelunaScore;
}

export function applyImprovement(html: string, id: string) {
  if (id === "labels") {
    return html.replace(/<input([^>]*?)>/gi, (full, attrs) => {
      if (/aria-label=/i.test(attrs)) return full;
      return `<label class="k-field">Field <input${attrs}></label>`;
    });
  }
  if (id === "privacy" && !/privacy|gdpr/i.test(html)) {
    return html.replace(
      /<\/body>/i,
      `<p style="font-size:12px;opacity:.7">We keep this in memory for the session. No sale of data. GDPR.</p></body>`,
    );
  }
  if (id === "mem") {
    return html.replace(/localStorage|sessionStorage/g, "_mem");
  }
  return html;
}
