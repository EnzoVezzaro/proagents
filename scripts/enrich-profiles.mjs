// One-shot enrichment: bring every profile up to the full-tree contract
// (Expertise / Knowledge / Methods / Skills / Rules / Policies / Tools /
// Verification + reference URLs). Skills are REFERENCED from real skill
// repositories (anthropics/skills, obra/superpowers,
// wesleyegberto/software-engineering-skills) — never duplicated.
import fs from "node:fs";

const SP = "github:obra/superpowers";
const WES = "github:wesleyegberto/software-engineering-skills";
const ANT = "github:anthropics/skills";
const addSP = (s) => `npx skills add obra/superpowers --skill ${s}`;
const addWES = (s) => `npx skills add wesleyegberto/software-engineering-skills --skill ${s}`;
const addANT = (s) => `npx skills add anthropics/skills --skill ${s}`;

const CONFIG = {
  "developer-experience-engineer": {
    skills: [SP, WES],
    skillsDetail: {
      [SP]: { skills: ["writing-plans", "executing-plans"], install: addSP("writing-plans"), note: "plan-driven DX improvements" },
      [WES]: { skills: ["workflow-implement", "clean-code"], install: addWES("workflow-implement"), note: "friction fixes land as normal reviewed work" },
    },
    policies: [
      "Publish before/after measurements for every developer-facing change.",
      "Survey and friction data is anonymized; never used to rank individuals.",
      "Automate setup steps before documenting them as manual.",
      "Developer telemetry collects the minimum needed; no per-developer surveillance.",
    ],
    references: {
      "DORA four keys": { url: "https://dora.dev/", note: "flow metrics used with survey data" },
      "SPACE framework": { url: "https://dl.acm.org/doi/10.1145/3454122.3459138", note: "satisfaction + performance + activity + communication + efficiency" },
    },
  },
  "code-reviewer": {
    skills: [SP, WES],
    skillsDetail: {
      [SP]: { skills: ["requesting-code-review", "receiving-code-review", "verification-before-completion"], install: addSP("verification-before-completion"), note: "review loops and completion honesty" },
      [WES]: { skills: ["code-review-expert", "anti-duplication", "clean-code"], install: addWES("code-review-expert") },
    },
    policies: [
      "Findings are about code, never about people; reviews stay professional and kind.",
      "Pre-release code seen in review is confidential.",
      "Security findings follow responsible disclosure — details to the team, not public issues.",
      "Blocking findings require evidence; no blocking on taste.",
    ],
    references: {
      "Conventional Comments": { url: "https://conventionalcomments.org/", note: "severity-labeled review comments" },
    },
  },
  "api-designer": {
    skills: [WES],
    skillsDetail: {
      [WES]: { skills: ["api-designer", "breaking-change-detector", "clean-architecture"], install: addWES("api-designer") },
    },
    policies: [
      "Breaking changes require deprecation windows, migration notes, and consumer notification.",
      "APIs collect the minimum data needed; PII in payloads is justified field by field.",
      "Error messages never leak internals (stacks, SQL, infrastructure).",
      "Contract is the source of truth; undocumented endpoints do not ship.",
    ],
    references: {
      "OpenAPI Specification": { url: "https://spec.openapis.org/oas/latest.html" },
      "RFC 9457 Problem Details": { url: "https://www.rfc-editor.org/rfc/rfc9457" },
      "GraphQL Specification": { url: "https://spec.graphql.org/" },
      "Semantic Versioning": { url: "https://semver.org/" },
    },
  },
  "test-automator": {
    skills: [SP, WES],
    skillsDetail: {
      [SP]: { skills: ["test-driven-development", "verification-before-completion", "systematic-debugging"], install: addSP("test-driven-development") },
      [WES]: { skills: ["e2e-testing-patterns", "javascript-testing-patterns"], install: addWES("e2e-testing-patterns") },
    },
    policies: [
      "Flake rates and quarantines are published, never hidden.",
      "Test fixtures contain synthetic data only — never production PII.",
      "A quarantined test always carries a ticket ID and a review date.",
      "Retries report a metric; they never substitute for diagnosis.",
    ],
    references: {
      "Google flaky-test approach": { url: "https://research.google/pubs/pub49162/", note: "systematic vs stochastic flake taxonomy" },
      "Arrange-Act-Assert": { url: "https://wiki.c2.com/?ArrangeActAssert.html", note: "test structure convention" },
    },
  },
  "platform-engineer": {
    skills: [WES, SP],
    skillsDetail: {
      [WES]: { skills: ["deployment-pipeline-design", "github-actions-templates", "helm-chart-scaffolding", "cost-optimization"], install: addWES("deployment-pipeline-design") },
      [SP]: { skills: ["writing-plans"], install: addSP("writing-plans"), note: "paved-road rollouts are planned work" },
    },
    policies: [
      "Platform changes are communicated with migration notes and timelines; tenants are never surprised.",
      "Access follows least privilege; platform credentials are scoped and rotated.",
      "Cost per capability is measured and published.",
      "Adoption is earned; mandates are last resort with an expiry review.",
    ],
    references: {
      "The Twelve-Factor App": { url: "https://12factor.net/" },
      "OpenTelemetry": { url: "https://opentelemetry.io/", note: "standard telemetry pipeline" },
    },
  },
  "data-engineer": {
    skills: [WES, SP],
    skillsDetail: {
      [WES]: { skills: ["architecture-data-system-design", "clean-code"], install: addWES("architecture-data-system-design") },
      [SP]: { skills: ["systematic-debugging"], install: addSP("systematic-debugging"), note: "pipeline incidents debugged to root cause" },
    },
    policies: [
      "PII is classified before collection and minimized at the boundary.",
      "Every dataset has a named owner, retention rule, and access policy.",
      "Data fixes are reviewed pipeline changes — never out-of-band scripts.",
      "Consumer notification precedes breaking schema changes.",
    ],
    references: {
      "Kimball dimensional modeling techniques": { url: "https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/", note: "grain-first warehouse modeling" },
    },
  },
  "ml-engineer": {
    skills: [SP, WES],
    skillsDetail: {
      [SP]: { skills: ["systematic-debugging", "verification-before-completion"], install: addSP("systematic-debugging") },
      [WES]: { skills: ["python-design-patterns", "python-error-handling"], install: addWES("python-design-patterns"), note: "ML engineering is Python engineering" },
    },
    policies: [
      "Training data is privacy-reviewed; PII is minimized or excluded.",
      "Deployed models ship model cards documenting intended use and limits.",
      "Evaluation datasets are access-controlled; test sets are touched once.",
      "Model behavior on out-of-distribution inputs is defined, not accidental.",
    ],
    references: {
      "Model Cards": { url: "https://modelcards.withgoogle.com/", note: "model reporting template" },
      "Datasheets for Datasets": { url: "https://arxiv.org/abs/1803.09010", note: "dataset documentation" },
    },
  },
  "mobile-engineer": {
    skills: [SP, WES],
    skillsDetail: {
      [SP]: { skills: ["systematic-debugging", "verification-before-completion"], install: addSP("verification-before-completion") },
      [WES]: { skills: ["e2e-testing-patterns"], install: addWES("e2e-testing-patterns") },
    },
    policies: [
      "On-device data collection is minimized; crash reports are PII-redacted.",
      "Every permission request has a user-visible justification.",
      "Released binaries keep working against new backends (expand/contract).",
      "Battery and memory budgets are release gates with recorded waivers.",
    ],
    references: {
      "Apple Human Interface Guidelines": { url: "https://developer.apple.com/design/human-interface-guidelines/" },
      "Material Design 3": { url: "https://m3.material.io/" },
    },
  },
  "legacy-modernizer": {
    skills: [SP, WES],
    skillsDetail: {
      [SP]: { skills: ["writing-plans", "executing-plans", "systematic-debugging"], install: addSP("writing-plans"), note: "migrations run as reviewed plans" },
      [WES]: { skills: ["breaking-change-detector", "anti-duplication"], install: addWES("breaking-change-detector") },
    },
    policies: [
      "Strangler-fig increments only; big-bang rewrites require explicit sign-off.",
      "Every migration step is reversible or has a documented forward-fix.",
      "Characterization tests precede behavior changes on untested legacy paths.",
      "Dependency retirement checks the installed base before removal.",
    ],
    references: {
      "Strangler Fig Application": { url: "https://martinfowler.com/bliki/StranglerFigApplication.html", note: "incremental replacement pattern" },
    },
  },
  "technical-writer": {
    skills: [ANT, WES],
    skillsDetail: {
      [ANT]: { skills: ["doc-coauthoring", "internal-comms", "brand-guidelines"], install: addANT("doc-coauthoring") },
      [WES]: { skills: ["code-documenter"], install: addWES("code-documenter") },
    },
    policies: [
      "Docs are verified against the product; unverified steps are marked as such.",
      "Inclusive, plain language; jargon is defined at first use.",
      "Every documented claim is runnable or demonstrable.",
      "Docs ship in the same change as the feature they describe.",
    ],
    references: {
      "Diátaxis framework": { url: "https://diataxis.fr/", note: "tutorials / how-to / reference / explanation" },
      "Google Developer Documentation Style Guide": { url: "https://developers.google.com/style" },
      "Microsoft Writing Style Guide": { url: "https://learn.microsoft.com/en-us/style-guide/welcome/" },
    },
  },
  "privacy-engineer": {
    skills: [SP],
    skillsDetail: {
      [SP]: { skills: ["verification-before-completion"], install: addSP("verification-before-completion") },
    },
    policies: [
      "Data minimization: collect only what has a documented purpose and lawful basis.",
      "PII classification precedes collection; retention limits are set at design time.",
      "Consent is informed, specific, and revocable; revocation propagates.",
      "Subject rights (access, deletion, portability) have tested procedures.",
    ],
    references: {
      "GDPR (Regulation EU 2016/679)": { url: "https://eur-lex.europa.eu/eli/reg/2016/679/oj" },
      "NIST Privacy Framework": { url: "https://www.nist.gov/privacy-framework" },
      "CCPA": { url: "https://oag.ca.gov/privacy/ccpa" },
    },
  },
  "release-engineer": {
    skills: [SP],
    skillsDetail: {
      [SP]: { skills: ["finishing-a-development-branch", "verification-before-completion", "executing-plans"], install: addSP("finishing-a-development-branch") },
    },
    policies: [
      "No release from a dirty tree or a red build; gates are mechanical.",
      "Rollback path demonstrated or documented before every deploy.",
      "Changelog entries are client-readable: what changed, what to do, by when.",
      "Release freezes are respected; hotfixes follow the documented exception path.",
    ],
    references: {
      "Keep a Changelog": { url: "https://keepachangelog.com/" },
      "Semantic Versioning": { url: "https://semver.org/" },
    },
  },
  // ---- built-ins ----
  "security-engineer": {
    skills: [WES, SP],
    skillsDetail: {
      [WES]: { skills: ["auth-implementation-patterns", "code-review-expert"], install: addWES("auth-implementation-patterns") },
      [SP]: { skills: ["systematic-debugging", "verification-before-completion"], install: addSP("systematic-debugging") },
    },
    policies: [
      "Threat-model before design approval on auth, payments, and PII surfaces.",
      "Secrets live in a secret manager; never in code, logs, or fixtures.",
      "Vulnerabilities follow responsible disclosure with coordinated timelines.",
      "Least privilege by default; elevated access is time-boxed and audited.",
    ],
    references: {
      "OWASP Top 10": { url: "https://owasp.org/Top10/" },
      "OWASP ASVS": { url: "https://owasp.org/www-project-application-security-verification-standard/", note: "verification standard for app security" },
      "MITRE CWE": { url: "https://cwe.mitre.org/", note: "weakness classification vocabulary" },
    },
  },
  "sre": {
    skills: [WES, SP],
    skillsDetail: {
      [WES]: { skills: ["deployment-pipeline-design", "bash-defensive-patterns"], install: addWES("bash-defensive-patterns") },
      [SP]: { skills: ["systematic-debugging", "verification-before-completion"], install: addSP("systematic-debugging") },
    },
    policies: [
      "SLOs with error budgets gate feature velocity; budget burn is reviewed weekly.",
      "Every alert names an owner and a runbook; orphan alerts are deleted.",
      "Blameless postmortems for every page that recurs.",
      "Production changes ride the pipeline; no unreviewed manual mutations.",
    ],
    references: {
      "Google SRE Books": { url: "https://sre.google/books/", note: "SLOs, error budgets, incident response" },
    },
  },
  "staff-engineer": {
    skills: [SP],
    skillsDetail: {
      [SP]: { skills: ["writing-plans", "brainstorming", "dispatching-parallel-agents"], install: addSP("writing-plans"), note: "long-horizon work is planned and delegated" },
    },
    policies: [
      "Decisions are written as RFCs/ADRs with alternatives considered.",
      "Technical direction is socialized before it is mandated.",
      "Delegation with review: ownership transfers, accountability stays visible.",
    ],
    references: {
      "Architecture Decision Records": { url: "https://adr.github.io/", note: "decision record format" },
    },
  },
  "devops-engineer": {
    skills: [WES, SP],
    skillsDetail: {
      [WES]: { skills: ["deployment-pipeline-design", "github-actions-templates", "gitlab-ci-patterns", "helm-chart-scaffolding", "bash-defensive-patterns"], install: addWES("deployment-pipeline-design") },
      [SP]: { skills: ["verification-before-completion"], install: addSP("verification-before-completion") },
    },
    policies: [
      "Infrastructure changes are code-reviewed and applied by pipeline.",
      "Environments are reproducible; no snowflake servers.",
      "Secrets never enter logs, artifacts, or caches.",
      "Rollback is rehearsed; deploys are reversible by design.",
    ],
    references: {
      "The Twelve-Factor App": { url: "https://12factor.net/" },
      "DORA": { url: "https://dora.dev/", note: "delivery performance metrics" },
    },
  },
  "database-engineer": {
    skills: [WES, SP],
    skillsDetail: {
      [WES]: { skills: ["architecture-data-system-design"], install: addWES("architecture-data-system-design") },
      [SP]: { skills: ["systematic-debugging"], install: addSP("systematic-debugging"), note: "query regressions debugged with plans" },
    },
    policies: [
      "Migrations are expand/contract with tested rollback.",
      "Schema changes state their lock and downtime impact up front.",
      "Backups are restorable — drilled, not assumed.",
      "PII columns are classified, minimized, and access-controlled.",
    ],
    references: {
      "Use The Index, Luke": { url: "https://use-the-index-luke.com/", note: "SQL indexing and tuning" },
      "PostgreSQL Documentation": { url: "https://www.postgresql.org/docs/current/", note: "authoritative RDBMS semantics" },
    },
  },
  "frontend-engineer": {
    skills: [ANT, WES, SP],
    skillsDetail: {
      [ANT]: { skills: ["frontend-design", "web-artifacts-builder"], install: addANT("frontend-design") },
      [WES]: { skills: ["e2e-testing-patterns", "frontend-design-everyday-things"], install: addWES("e2e-testing-patterns") },
      [SP]: { skills: ["verification-before-completion"], install: addSP("verification-before-completion") },
    },
    policies: [
      "Accessibility is a ship gate: keyboard, contrast, semantics (WCAG 2.2 AA).",
      "Performance budgets (Core Web Vitals) guard every landing path.",
      "User input is validated at the boundary; no secrets in client code.",
      "Progressive enhancement: core flows survive JS failure.",
    ],
    references: {
      "WCAG 2.2": { url: "https://www.w3.org/TR/WCAG22/" },
      "Core Web Vitals": { url: "https://web.dev/articles/vitals/" },
      "MDN Web Docs": { url: "https://developer.mozilla.org/", note: "platform reference" },
    },
  },
  "accessibility-engineer": {
    skills: [ANT, SP],
    skillsDetail: {
      [ANT]: { skills: ["frontend-design"], install: addANT("frontend-design"), note: "inclusive interface patterns" },
      [SP]: { skills: ["verification-before-completion"], install: addSP("verification-before-completion") },
    },
    policies: [
      "WCAG 2.2 AA is the floor, not the goal.",
      "Assistive-technology testing (screen reader, switch, magnification) precedes sign-off.",
      "Accessibility defects are functional defects — same severity ladder.",
      "Motion and flashing respect vestibular sensitivity (prefers-reduced-motion).",
    ],
    references: {
      "WCAG 2.2": { url: "https://www.w3.org/TR/WCAG22/" },
      "WAI-ARIA 1.2": { url: "https://www.w3.org/TR/wai-aria-1.2/" },
      "WAI Resources": { url: "https://www.w3.org/WAI/", note: "how-to and testing guidance" },
    },
  },
  "performance-engineer": {
    skills: [SP],
    skillsDetail: {
      [SP]: { skills: ["systematic-debugging", "verification-before-completion"], install: addSP("systematic-debugging"), note: "profile before patching" },
    },
    policies: [
      "No optimization without a profile; no claim without a before/after.",
      "Budgets are written into CI; regressions block release.",
      "Measurements state the environment (hardware, network, dataset).",
    ],
    references: {
      "Core Web Vitals": { url: "https://web.dev/articles/vitals/" },
      "Performance research (web.dev)": { url: "https://web.dev/performance", note: "metrics and methodology" },
    },
  },
  "qa-engineer": {
    skills: [SP, WES],
    skillsDetail: {
      [SP]: { skills: ["test-driven-development", "verification-before-completion", "systematic-debugging"], install: addSP("test-driven-development") },
      [WES]: { skills: ["e2e-testing-patterns"], install: addWES("e2e-testing-patterns") },
    },
    policies: [
      "A bug without a reproduction is a hypothesis — documented as such.",
      "Test data is synthetic; production data never enters test systems.",
      "Quality signals are published: escape rate, coverage of risk, flake rate.",
      "Release sign-off states what was and was not verified.",
    ],
    references: {
      "Google flaky-test approach": { url: "https://research.google/pubs/pub49162/" },
    },
  },
  "backend-engineer": {
    skills: [WES, SP],
    skillsDetail: {
      [WES]: { skills: ["auth-implementation-patterns", "javascript-design-patterns", "python-design-patterns"], install: addWES("auth-implementation-patterns") },
      [SP]: { skills: ["test-driven-development", "verification-before-completion"], install: addSP("test-driven-development") },
    },
    policies: [
      "Untrusted input is validated at every boundary; output encoded at sinks.",
      "Idempotency for unsafe operations; retries are safe by design.",
      "Data migrations are reversible; expand/contract for breaking changes.",
      "Secrets and PII never enter logs.",
    ],
    references: {
      "The Twelve-Factor App": { url: "https://12factor.net/" },
      "OWASP Top 10": { url: "https://owasp.org/Top10/" },
    },
  },
  "principal-engineer": {
    skills: [SP],
    skillsDetail: {
      [SP]: { skills: ["writing-plans", "brainstorming", "subagent-driven-development"], install: addSP("brainstorming"), note: "org-scale work is structured and delegated" },
    },
    policies: [
      "High-stakes decisions get written records with alternatives and trade-offs.",
      "Leverage over heroics: solutions that teams can own after you leave.",
      "Risk is stated in business terms with reversibility options.",
    ],
    references: {
      "Architecture Decision Records": { url: "https://adr.github.io/" },
    },
  },
  "senior-engineer": {
    skills: [SP, WES],
    skillsDetail: {
      [SP]: { skills: ["test-driven-development", "systematic-debugging", "writing-plans", "using-git-worktrees", "verification-before-completion"], install: addSP("test-driven-development") },
      [WES]: { skills: ["clean-code", "debugging-strategies"], install: addWES("clean-code") },
    },
    policies: [
      "Changes ship with tests and docs in the same PR.",
      "Debugging is evidence-driven; fixes name the root cause.",
      "Mentoring is part of delivery: reviews teach, not gatekeep.",
    ],
    references: {
      "Conventional Comments": { url: "https://conventionalcomments.org/" },
    },
  },
  "systems-architect": {
    skills: [WES, SP],
    skillsDetail: {
      [WES]: { skills: ["architecture-decision-records", "c4-model", "cloud-architect", "architecture-system-design"], install: addWES("c4-model") },
      [SP]: { skills: ["brainstorming", "writing-plans"], install: addSP("writing-plans") },
    },
    policies: [
      "Every consequential decision is an ADR with alternatives and consequences.",
      "Designs state failure modes and degradation behavior, not just happy paths.",
      "Diagrams are C4-level explicit and kept current with reality.",
    ],
    references: {
      "C4 Model": { url: "https://c4model.com/", note: "context, containers, components, code" },
      "Architecture Decision Records": { url: "https://adr.github.io/" },
    },
  },
};

// Apply
let touched = 0;
const missing = [];
for (const dir of ["profiles", ".marketplace/profiles"]) {
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const p = `${dir}/${f}`;
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!raw.profile?.slug) continue; // crews
    const cfg = CONFIG[raw.profile.slug];
    if (!cfg) {
      missing.push(raw.profile.slug);
      continue;
    }
    raw.skills ??= [];
    for (const s of cfg.skills) if (!raw.skills.includes(s)) raw.skills.push(s);
    raw.skillsDetail = { ...(raw.skillsDetail ?? {}), ...cfg.skillsDetail };
    raw.policies = [...new Set([...(raw.policies ?? []), ...cfg.policies])];
    raw.references = { ...(raw.references ?? {}), ...cfg.references };
    fs.writeFileSync(p, JSON.stringify(raw, null, 2) + "\n");
    touched++;
  }
}
console.log(`enriched ${touched} profiles`);
if (missing.length) console.log("no config for:", missing.join(", "));
