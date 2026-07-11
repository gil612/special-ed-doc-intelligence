"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "@/app/actions";

export function UploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setStatus("pending");
    setError(null);
    const result = await uploadDocument(formData);
    if (result.success) {
      setStatus("idle");
      formRef.current?.reset();
      router.refresh();
    } else {
      setStatus("error");
      setError(result.error);
    }
  }

  return (
    <form ref={formRef} action={handleSubmit} className="mb-6 flex items-center gap-3">
      <input type="file" name="file" accept="application/pdf" required className="text-sm" />
      <button
        type="submit"
        disabled={status === "pending"}
        className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {status === "pending" ? "מעלה…" : "העלאת מסמך"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
