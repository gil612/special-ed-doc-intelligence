"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "@/app/actions";

interface UploadError {
  fileName: string;
  error: string;
}

export function UploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [errors, setErrors] = useState<UploadError[]>([]);

  async function handleSubmit(formData: FormData) {
    const files = formData.getAll("file").filter((value): value is File => value instanceof File);
    if (files.length === 0) return;

    setErrors([]);
    setPendingCount(files.length);

    // Each file is uploaded independently: as soon as ITS OWN
    // uploadDocument() call settles, router.refresh() runs immediately for
    // that file alone, rather than waiting for the whole batch. This is
    // what makes each file's row appear on its own timeline instead of
    // all-at-once after the slowest upload in the batch.
    await Promise.all(
      files.map(async (file) => {
        const singleFileFormData = new FormData();
        singleFileFormData.set("file", file);
        try {
          const result = await uploadDocument(singleFileFormData);
          if (!result.success) {
            setErrors((prev) => [...prev, { fileName: file.name, error: result.error }]);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setErrors((prev) => [...prev, { fileName: file.name, error: message }]);
        } finally {
          setPendingCount((prev) => prev - 1);
          router.refresh();
        }
      })
    );

    formRef.current?.reset();
  }

  return (
    <form ref={formRef} action={handleSubmit} className="mb-6">
      <div className="flex items-center gap-3">
        <input type="file" name="file" accept="application/pdf" required multiple className="text-sm" />
        <button
          type="submit"
          disabled={pendingCount > 0}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {pendingCount > 0 ? `מעלה… (${pendingCount} נותרו)` : "העלאת מסמכים"}
        </button>
      </div>
      {errors.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-red-600">
          {errors.map((err, i) => (
            <li key={i}>
              {err.fileName}: {err.error}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
