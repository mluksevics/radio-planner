"use client";

import { useRef, useState } from "react";

interface Props {
  initialText: string;
  onLoad: (text: string) => void;
}

export default function DataInput({ initialText, onLoad }: Props) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadSample() {
    try {
      const res = await fetch("/sample.txt");
      const sample = await res.text();
      setText(sample);
      onLoad(sample);
      setError(null);
    } catch {
      setError("Could not load sample.txt");
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const t = await file.text();
    setText(t);
    onLoad(t);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={loadSample}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Load sample
        </button>
        <label className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50">
          Upload .txt
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={onFile}
          />
        </label>
        <button
          onClick={() => {
            onLoad(text);
            setError(null);
          }}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Parse pasted text
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        placeholder="Paste course data here (one course per line, ;-separated) or click Load sample"
        className="h-48 w-full rounded border border-gray-300 p-2 font-mono text-xs"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
