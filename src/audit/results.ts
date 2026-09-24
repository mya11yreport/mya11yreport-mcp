export interface AxeNodeLike {
  target: unknown[];
  html?: string;
  failureSummary?: string;
}

export interface AxeRuleLike {
  id: string;
  impact?: string | null;
  help?: string;
  helpUrl?: string;
  tags?: string[];
  nodes?: AxeNodeLike[];
}

export interface AxeResultsLike {
  url?: string;
  timestamp?: string;
  testEngine?: { version?: string };
  violations?: AxeRuleLike[];
  passes?: AxeRuleLike[];
  incomplete?: AxeRuleLike[];
  inapplicable?: AxeRuleLike[];
}

export interface ViolationNodeView {
  target: string[];
  html: string;
  failureSummary?: string;
}

export interface ViolationView {
  id: string;
  impact: string;
  help: string;
  helpUrl?: string;
  tags: string[];
  nodeCount: number;
  nodes: ViolationNodeView[];
}

export interface AuditSummaryView {
  url: string;
  auditedAt: string;
  axeVersion?: string;
  requestedTags: string[];
  counts: {
    violations: number;
    passes: number;
    incomplete: number;
    inapplicable: number;
  };
  violationsByImpact: Record<string, number>;
  violationRules: string[];
  passRules: string[];
  incompleteRules: string[];
  violations: ViolationView[];
  raw?: unknown;
}

export interface SummarizeOptions {
  includeRaw?: boolean;
  maxNodesPerViolation?: number;
  tags?: string[];
}

const IMPACT_SEVERITY = ['critical', 'serious', 'moderate', 'minor'];
const MAX_HTML_LENGTH = 250;

function formatTarget(target: unknown): string {
  return typeof target === 'string' ? target : JSON.stringify(target);
}

function impactRank(impact: string | null | undefined): number {
  if (!impact) return IMPACT_SEVERITY.length;
  const index = IMPACT_SEVERITY.indexOf(impact);
  return index === -1 ? IMPACT_SEVERITY.length : index;
}

function orderImpactsBySeverity(counts: Record<string, number>): Record<string, number> {
  const ordered: Record<string, number> = {};
  for (const impact of IMPACT_SEVERITY) {
    if (counts[impact] !== undefined) ordered[impact] = counts[impact];
  }
  for (const [impact, count] of Object.entries(counts)) {
    if (!(impact in ordered)) ordered[impact] = count;
  }
  return ordered;
}

export function summarizeAxeResults(
  results: AxeResultsLike,
  options: SummarizeOptions = {},
): AuditSummaryView {
  const { includeRaw = false, maxNodesPerViolation = 5, tags = [] } = options;
  const violations = results.violations ?? [];
  const sorted = [...violations].sort((a, b) => {
    const rankDiff = impactRank(a.impact) - impactRank(b.impact);
    if (rankDiff !== 0) return rankDiff;
    return (b.nodes?.length ?? 0) - (a.nodes?.length ?? 0);
  });

  const impactCounts: Record<string, number> = {};
  for (const violation of violations) {
    const impact = violation.impact ?? 'unknown';
    impactCounts[impact] = (impactCounts[impact] ?? 0) + 1;
  }

  const summary: AuditSummaryView = {
    url: results.url ?? 'unknown',
    auditedAt: results.timestamp ?? new Date().toISOString(),
    axeVersion: results.testEngine?.version,
    requestedTags: tags,
    counts: {
      violations: violations.length,
      passes: (results.passes ?? []).length,
      incomplete: (results.incomplete ?? []).length,
      inapplicable: (results.inapplicable ?? []).length,
    },
    violationsByImpact: orderImpactsBySeverity(impactCounts),
    violationRules: sorted.map((v) => v.id),
    passRules: (results.passes ?? []).map((r) => r.id),
    incompleteRules: (results.incomplete ?? []).map((r) => r.id),
    violations: sorted.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? 'unknown',
      help: violation.help ?? violation.id,
      helpUrl: violation.helpUrl,
      tags: violation.tags ?? [],
      nodeCount: violation.nodes?.length ?? 0,
      nodes: (violation.nodes ?? []).slice(0, maxNodesPerViolation).map((node) => ({
        target: (node.target ?? []).map(formatTarget),
        html: (node.html ?? '').slice(0, MAX_HTML_LENGTH),
        failureSummary: node.failureSummary,
      })),
    })),
  };

  if (includeRaw) summary.raw = results;
  return summary;
}
