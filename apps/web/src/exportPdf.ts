import { jsPDF } from "jspdf";
import type { Mission } from "@agent-grove/shared";

function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Strip light Markdown so jsPDF can wrap plain text cleanly. */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .trim();
}

export function exportMissionPdf(mission: Mission): void {
  const content = mission.report?.content;
  if (!content) return;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(mission.title, maxWidth) as string[];
  ensureSpace(titleLines.length * 20);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 20 + 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  const meta = `Agent Grove · ${new Date(mission.finishedAt || mission.updatedAt).toLocaleString()}`;
  doc.text(meta, margin, y);
  y += 16;

  const promptLines = doc.splitTextToSize(`Mission: ${mission.prompt}`, maxWidth) as string[];
  ensureSpace(promptLines.length * 13 + 10);
  doc.text(promptLines, margin, y);
  y += promptLines.length * 13 + 14;

  doc.setDrawColor(180);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;
  doc.setTextColor(20);

  doc.setFontSize(11);
  const body = toPlainText(content);
  const paragraphs = body.split(/\n+/);

  for (const para of paragraphs) {
    const lines = doc.splitTextToSize(para, maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(14);
      doc.text(line, margin, y);
      y += 14;
    }
    y += 6;
  }

  doc.save(`agent-grove-${sanitizeFilename(mission.title) || "report"}.pdf`);
}
