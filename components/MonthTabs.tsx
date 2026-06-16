"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export default function MonthTabs({
  thisMonthName,
  nextMonthName,
  thisMonthContent,
  nextMonthContent,
}: {
  thisMonthName: string;
  nextMonthName: string;
  thisMonthContent: ReactNode;
  nextMonthContent: ReactNode;
}) {
  const [tab, setTab] = useState<"this" | "next">("this");

  return (
    <div>
      <div className="mb-8 flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
        <button
          onClick={() => setTab("this")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "this"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          This month: {thisMonthName}
        </button>
        <button
          onClick={() => setTab("next")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "next"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Next month: {nextMonthName}
        </button>
      </div>

      {tab === "this" ? thisMonthContent : nextMonthContent}
    </div>
  );
}
