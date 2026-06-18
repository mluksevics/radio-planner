"use client";

import { useRef } from "react";

interface Props {
  heatmap: boolean;
  onToggleHeatmap: () => void;
  onSaveJson: () => void;
  onLoadJson: (file: File) => void;
  onExportExcel: () => void;
  onCopyLink: () => void;
  onPrint: () => void;
  linkCopied: boolean;
}

export default function Toolbar({
  heatmap,
  onToggleHeatmap,
  onSaveJson,
  onLoadJson,
  onExportExcel,
  onCopyLink,
  onPrint,
  linkCopied,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <label className="flex cursor-pointer items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm">
        <input
          type="checkbox"
          checked={heatmap}
          onChange={onToggleHeatmap}
          className="accent-orange-500"
        />
        Heatmap
      </label>
      <span className="mx-1 h-5 w-px bg-gray-300" />
      <button
        onClick={onCopyLink}
        className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        title="Copy a shareable link that encodes this exact version"
      >
        {linkCopied ? "Link copied!" : "Copy link"}
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
      <button
        onClick={onPrint}
        className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
      >
        Print
      </button>
    </div>
  );
}
