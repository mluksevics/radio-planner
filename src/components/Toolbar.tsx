"use client";

import { useRef } from "react";

interface Props {
  onSaveJson: () => void;
  onLoadJson: (file: File) => void;
  onExportExcel: () => void;
  onCopyLink: () => void;
  linkCopied: boolean;
  linkSaving: boolean;
}

export default function Toolbar({
  onSaveJson,
  onLoadJson,
  onExportExcel,
  onCopyLink,
  linkCopied,
  linkSaving,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button
        onClick={onCopyLink}
        disabled={linkSaving}
        className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
        title="Save this version to the server and copy a shareable /id link"
      >
        {linkSaving ? "Saving…" : linkCopied ? "Link copied!" : "Save & copy link"}
      </button>
      <button
        onClick={onSaveJson}
        className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
      >
        Save JSON
      </button>
      <label className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50">
        Load JSON
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onLoadJson(f);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
      </label>
      <button
        onClick={onExportExcel}
        className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800"
      >
        Export Excel
      </button>
    </div>
  );
}
