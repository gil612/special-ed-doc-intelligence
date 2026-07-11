"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface FileProgress {
  fileName: string;
  percent: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

export function UploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<FileProgress[]>([]);

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;

    setUploads(files.map((file) => ({ fileName: file.name, percent: 0, status: "uploading" })));

    await Promise.all(
      files.map(async (file, index) => {
        // A plain fetch() doesn't expose byte-level upload progress either
        // (that needs XMLHttpRequest's progress events), so this is an
        // honest, simulated fill (same approach the click-invoice
        // reference project uses) rather than a fabricated precise
        // percentage - it communicates "this is in flight," not a measured fact.
        const tick = setInterval(() => {
          setUploads((prev) =>
            prev.map((u, i) => (i === index && u.percent < 90 ? { ...u, percent: u.percent + 15 } : u))
          );
        }, 150);

        const singleFileFormData = new FormData();
        singleFileFormData.set("file", file);
        try {
          const response = await fetch("/api/dashboard-upload", {
            method: "POST",
            body: singleFileFormData,
          });
          const result: { document_id: string; status: string } | { error: string } = await response.json();
          clearInterval(tick);
          setUploads((prev) =>
            prev.map((u, i) =>
              i === index
                ? response.ok
                  ? { ...u, percent: 100, status: "done" }
                  : { ...u, percent: 100, status: "error", error: "error" in result ? result.error : "" }
                : u
            )
          );
        } catch (error) {
          clearInterval(tick);
          const message = error instanceof Error ? error.message : String(error);
          setUploads((prev) =>
            prev.map((u, i) => (i === index ? { ...u, percent: 100, status: "error", error: message } : u))
          );
        } finally {
          router.refresh();
        }
      })
    );

    formRef.current?.reset();
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <form ref={formRef} className="mb-6" onSubmit={(e) => e.preventDefault()}>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-accent bg-accent-soft"
            : "border-black/10 bg-white hover:border-accent hover:bg-accent-soft"
        }`}
      >
        <span className="mb-2 block text-4xl">📄</span>
        <p className="font-semibold text-ink">גררו קבצי PDF לכאן</p>
        <p className="text-sm text-ink-muted">או לחצו לבחירה — אפשר להעלות כמה קבצים בבת אחת</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => uploadFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      {uploads.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {uploads.map((upload, i) => (
            <div key={i}>
              <div className="mb-1 flex justify-between text-xs text-ink-muted">
                <span>{upload.fileName}</span>
                <span>{upload.status === "error" ? upload.error : `${upload.percent}%`}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    upload.status === "error" ? "bg-red-500" : "bg-accent"
                  }`}
                  style={{ width: `${upload.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
