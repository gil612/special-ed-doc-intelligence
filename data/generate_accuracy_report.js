const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const env = {};
fs.readFileSync(".env.local", "utf8").split("\n").forEach((line) => {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
});

const documentIds = {
  "STU-0008": "0f71188c-26cf-48f4-896d-074aadfc0a34",
  "STU-0014": "61332e64-0cf9-4aac-82df-21eb19c59a72",
  "STU-0017": "f7372ed6-0df7-4979-bd5e-5ac4e2557d1e",
  "STU-0028": "37e46dfc-7da1-4d2d-8e51-bcbf16dcdc8f",
  "STU-0038": "2e3a28ef-da48-44a6-baa9-9d26a196976c",
  "STU-0041": "983d61e2-8e71-46b5-bdd4-36cbac9c4095",
  "STU-0053": "43bc6b42-7b9a-4526-bdea-c3f51c11ae84",
  "STU-0057": "fbaeace5-203e-4582-a90d-d0244dd94b8d",
  "STU-0065": "db5be407-cd18-4ce8-a23f-f2d3c3b0c5e1",
  "STU-0079": "608570ea-ba6b-4ae9-8b7e-0504cb673a9b",
};

// Ground truth, pulled directly from Students_Synthetic via a Python/openpyxl
// export (ground_truth.json) - not hand-transcribed, to avoid transcription errors.
const groundTruth = JSON.parse(
  fs.readFileSync(__dirname + "/ground_truth.json", "utf8")
);

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function checkmark(match) {
  return match ? "✅" : "❌";
}

(async () => {
  const rows = [];
  for (const [studentId, docId] of Object.entries(documentIds)) {
    const { data, error } = await client
      .from("documents")
      .select("id, original_filename, status, extractions(*)")
      .eq("id", docId)
      .single();
    if (error) {
      console.log(studentId, "ERROR", JSON.stringify(error));
      continue;
    }
    const extraction = Array.isArray(data.extractions) ? data.extractions[0] : data.extractions;
    rows.push({ studentId, extraction, gt: groundTruth[studentId] });
  }

  let exactMatchTotal = 0;
  let exactMatchCorrect = 0;
  const lines = [];

  lines.push("# Accuracy Test Report — 10 Synthetic Students, Real Schools\n");
  lines.push(
    `Generated ${new Date().toISOString().slice(0, 10)}. Ground truth from ` +
    "`data/synthetic_iep_dataset_real_schools.xlsx` (Students_Synthetic sheet). " +
    "Documents generated from a template, uploaded through the real production " +
    "pipeline (`/api/upload`), extracted by Gemini.\n"
  );

  lines.push("## Exact-match summary\n");
  lines.push("| student_id | school_year | placement_type | weekly_support_hours | review_date |");
  lines.push("|---|---|---|---|---|");

  const summaryRows = [];
  for (const { studentId, extraction, gt } of rows) {
    const checks = {
      school_year: extraction.school_year === gt.school_year,
      placement_type: extraction.placement_type === gt.placement,
      weekly_support_hours: Number(extraction.weekly_support_hours) === Number(gt.hours),
      review_date: extraction.review_date === gt.review_date,
    };
    Object.values(checks).forEach((v) => {
      exactMatchTotal += 1;
      if (v) exactMatchCorrect += 1;
    });
    summaryRows.push({ studentId, checks, extraction, gt });
    lines.push(
      `| ${studentId} | ${checkmark(checks.school_year)} | ${checkmark(checks.placement_type)} | ` +
      `${checkmark(checks.weekly_support_hours)} | ${checkmark(checks.review_date)} |`
    );
  }

  lines.push(
    `\n**${exactMatchCorrect}/${exactMatchTotal} exact-match checks passed** ` +
    `(${Math.round((exactMatchCorrect / exactMatchTotal) * 100)}%) across the 4 structured fields × 10 students.\n`
  );

  lines.push("## Per-student detail\n");
  for (const { studentId, extraction, gt, checks } of summaryRows) {
    lines.push(`### ${studentId} — ${gt.school}\n`);
    lines.push("| Field | Ground truth | Extracted | Match |");
    lines.push("|---|---|---|---|");
    lines.push(`| school_year | ${gt.school_year} | ${extraction.school_year} | ${checkmark(checks.school_year)} |`);
    lines.push(`| placement_type | ${gt.placement} | ${extraction.placement_type} | ${checkmark(checks.placement_type)} |`);
    lines.push(`| weekly_support_hours | ${gt.hours} | ${extraction.weekly_support_hours} | ${checkmark(checks.weekly_support_hours)} |`);
    lines.push(`| review_date | ${gt.review_date} | ${extraction.review_date} | ${checkmark(checks.review_date)} |`);
    lines.push(`| disability_category (free text, not auto-scored) | ${gt.disability} | ${extraction.disability_category} | — |`);
    lines.push("");
    lines.push(`**Goals** — ground truth (${gt.goals.length}) vs extracted (${(extraction.goals || []).length}):`);
    lines.push("");
    lines.push("Ground truth:");
    gt.goals.forEach((g) => lines.push(`- ${g}`));
    lines.push("");
    lines.push("Extracted:");
    (extraction.goals || []).forEach((g) => lines.push(`- ${g}`));
    lines.push("");
    lines.push(`**Accommodations** — ground truth (${gt.accommodations.length}) vs extracted (${(extraction.accommodations || []).length}):`);
    lines.push("");
    lines.push("Ground truth:");
    gt.accommodations.forEach((a) => lines.push(`- ${a}`));
    lines.push("");
    lines.push("Extracted:");
    (extraction.accommodations || []).forEach((a) => lines.push(`- ${a}`));
    lines.push("");
    lines.push(`**Summary (Gemini-written):** ${extraction.summary ?? "(none)"}`);
    lines.push("");
    lines.push(`**Confidence** — Gemini reported: ${extraction.confidence}; dataset's invented confidence (not a target to match): ${gt.dataset_confidence}`);
    lines.push("\n---\n");
  }

  const report = lines.join("\n");
  fs.writeFileSync("data/accuracy_test_report.md", report, "utf8");
  console.log("Wrote data/accuracy_test_report.md");
  console.log(`Exact-match: ${exactMatchCorrect}/${exactMatchTotal} (${Math.round((exactMatchCorrect / exactMatchTotal) * 100)}%)`);
})();
