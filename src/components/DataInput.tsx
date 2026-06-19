"use client";

import { useRef, useState } from "react";

interface Props {
  initialText: string;
  onLoad: (text: string) => void;
  onLoadOcadCourse: (file: File) => void;
  onLoadCoursesXml: (file: File) => void;
  onLoadBackground: (file: File) => void;
  backgroundName: string | null;
  ocadBusy: boolean;
  ocadError: string | null;
}

export default function DataInput({
  initialText,
  onLoad,
  onLoadOcadCourse,
  onLoadCoursesXml,
  onLoadBackground,
  backgroundName,
  ocadBusy,
  ocadError,
}: Props) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ocadRef = useRef<HTMLInputElement>(null);
  const xmlRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);

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

  function onOcad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onLoadOcadCourse(file);
    if (ocadRef.current) ocadRef.current.value = "";
  }

  function onXml(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onLoadCoursesXml(file);
    if (xmlRef.current) xmlRef.current.value = "";
  }

  function onBackground(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onLoadBackground(file);
    if (bgRef.current) bgRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border border-gray-200 bg-gray-50 p-2">
        <p className="mb-2 text-xs font-semibold text-gray-600">
          Course file — controls, courses and coordinates in one upload
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Upload course .ocd
            <input
              ref={ocadRef}
              type="file"
              accept=".ocd"
              className="hidden"
              onChange={onOcad}
            />
          </label>
          <label className="cursor-pointer rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Upload courses .xml
            <input
              ref={xmlRef}
              type="file"
              accept=".xml"
              className="hidden"
              onChange={onXml}
            />
          </label>
          <label className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-white">
            Upload background map .ocd
            <input
              ref={bgRef}
              type="file"
              accept=".ocd"
              className="hidden"
              onChange={onBackground}
            />
          </label>
          {ocadBusy && <span className="text-xs text-gray-500">Parsing…</span>}
          {backgroundName && !ocadBusy && (
            <span className="text-xs text-emerald-700">
              map: {backgroundName}
            </span>
          )}
        </div>
        {ocadError && <p className="mt-1 text-sm text-red-600">{ocadError}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={loadSample}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
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
          type="button"
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
        className="h-40 w-full rounded border border-gray-300 p-2 font-mono text-xs"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
