"use client";

import { useState, useTransition } from "react";
import { runNow } from "./actions";

export function RunNow() {
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await runNow()))}
        className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
      >
        {pending ? "Running… (can take a minute)" : "Run now"}
      </button>
      {result && <p className="max-w-md text-right text-xs text-slate-600">{result}</p>}
    </div>
  );
}
