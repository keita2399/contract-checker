"use client";

import { useState, useRef, useCallback } from "react";

interface Clause {
  article: string;
  title: string;
  original_text: string;
  risk_level: "HIGH" | "MEDIUM" | "LOW" | "SAFE";
  issue: string;
  recommendation: string;
  category: string;
}

interface MissingClause {
  title: string;
  risk_level: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  recommendation: string;
}

interface ContractData {
  document_type: string;
  parties: { party_a: string; party_b: string };
  contract_date: string;
  contract_period: string;
  summary: string;
  overall_risk: "HIGH" | "MEDIUM" | "LOW";
  risk_score: number;
  clauses: Clause[];
  missing_clauses: MissingClause[];
  warnings: string[];
}

const RISK_STYLES = {
  HIGH: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", badge: "bg-red-500", label: "危険" },
  MEDIUM: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", badge: "bg-yellow-500", label: "注意" },
  LOW: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", badge: "bg-blue-500", label: "参考" },
  SAFE: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-400", badge: "bg-green-500", label: "安全" },
};

function RiskBadge({ level }: { level: keyof typeof RISK_STYLES }) {
  const s = RISK_STYLES[level];
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded ${s.badge} text-white`}>
      {s.label}
    </span>
  );
}

function RiskMeter({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "#ef4444" : pct >= 40 ? "#eab308" : "#22c55e";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono text-lg font-bold" style={{ color }}>{pct}%</span>
    </div>
  );
}

function ClauseCard({ clause }: { clause: Clause }) {
  const s = RISK_STYLES[clause.risk_level];
  const [open, setOpen] = useState(clause.risk_level === "HIGH");

  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} overflow-hidden`}>
      <button onClick={() => setOpen(!open)} className="w-full px-5 py-4 flex items-center gap-3 text-left">
        <RiskBadge level={clause.risk_level} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-mono text-gray-400 mr-2">{clause.article}</span>
          <span className="text-sm font-medium text-gray-200">{clause.title}</span>
        </div>
        <span className="text-gray-500 text-sm shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-gray-800/50">
          <div className="mt-3 p-3 rounded-lg bg-gray-900/80 text-xs text-gray-400 font-mono leading-relaxed">
            {clause.original_text}
          </div>
          <div>
            <div className={`text-xs font-bold ${s.text} mb-1`}>問題点</div>
            <p className="text-sm text-gray-300 leading-relaxed">{clause.issue}</p>
          </div>
          <div>
            <div className="text-xs font-bold text-green-400 mb-1">修正案</div>
            <p className="text-sm text-gray-300 leading-relaxed">{clause.recommendation}</p>
          </div>
          <div className="text-xs text-gray-500">カテゴリ: {clause.category}</div>
        </div>
      )}
    </div>
  );
}

export default function ContractUploader() {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      setError("画像またはPDFファイルを選択してください");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("ファイルサイズは20MB以下にしてください");
      return;
    }

    setError(null);
    setResult(null);
    setFileName(file.name);

    if (isImage) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null); // PDFはプレビューなし
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      setLoading(true);
      try {
        const body = isPdf
          ? { image: base64, mimeType: "application/pdf" }
          : { image: base64, mimeType: file.type };

        const res = await fetch("/api/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "解析に失敗しました");
        } else {
          setResult(data);
        }
      } catch {
        setError("通信エラーが発生しました");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const highCount = result?.clauses.filter(c => c.risk_level === "HIGH").length ?? 0;
  const mediumCount = result?.clauses.filter(c => c.risk_level === "MEDIUM").length ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="text-xs text-emerald-500 tracking-widest mb-3 font-mono">CONTRACT RISK CHECKER</div>
        <h1 className="text-3xl md:text-4xl font-bold mb-3">
          契約書<span className="text-emerald-500">リスクチェッカー</span>
        </h1>
        <p className="text-gray-400 text-sm max-w-lg mx-auto">
          契約書をアップロード → AIが不利な条項を検出 → 修正案を提示
        </p>
        <p className="text-gray-600 text-xs mt-2">
          ※ 法的助言ではありません。重要な契約は必ず弁護士にご相談ください。
        </p>
      </div>

      {/* Upload area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300
          ${dragOver ? "border-emerald-500 bg-emerald-500/10" : "border-gray-700 hover:border-gray-500 hover:bg-gray-900/50"}
        `}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
        />
        <div className="text-4xl mb-4">📋</div>
        <p className="text-gray-300 font-medium mb-1">契約書のPDFまたは画像をドロップ or 選択</p>
        <p className="text-gray-500 text-xs">PDF / PNG / JPEG / WebP — 20MB以下</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="mt-12 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin text-4xl mb-4">⚖️</div>
            <p className="text-gray-400 text-sm">AIが契約書を分析中...</p>
            <p className="text-gray-600 text-xs mt-1">条項ごとにリスクを判定しています</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-8 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-8 space-y-6">
          {/* Overview */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left: preview */}
            {(preview || fileName) && (
              <div className="rounded-xl overflow-hidden border border-gray-800 max-h-[500px] overflow-y-auto">
                {preview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={preview} alt="契約書" className="w-full" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 bg-gray-900">
                    <div className="text-5xl mb-3">📄</div>
                    <p className="text-gray-400 text-sm">{fileName}</p>
                    <p className="text-gray-600 text-xs mt-1">PDF アップロード済み</p>
                  </div>
                )}
              </div>
            )}

            {/* Right: summary */}
            <div className="space-y-4">
              {/* Risk score */}
              <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-bold">リスク評価</h2>
                  <RiskBadge level={result.overall_risk} />
                </div>
                <RiskMeter score={result.risk_score} />
                <div className="flex gap-4 mt-3 text-xs">
                  {highCount > 0 && <span className="text-red-400">危険: {highCount}件</span>}
                  {mediumCount > 0 && <span className="text-yellow-400">注意: {mediumCount}件</span>}
                  {result.missing_clauses.length > 0 && (
                    <span className="text-orange-400">欠落: {result.missing_clauses.length}件</span>
                  )}
                </div>
              </div>

              {/* Contract info */}
              <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
                <div className="text-xs text-emerald-500 font-mono mb-2">契約情報</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">種類</span>
                    <span>{result.document_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">甲</span>
                    <span>{result.parties.party_a}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">乙</span>
                    <span>{result.parties.party_b}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">契約日</span>
                    <span>{result.contract_date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">期間</span>
                    <span className="text-right max-w-[200px]">{result.contract_period}</span>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
                <div className="text-xs text-emerald-500 font-mono mb-2">概要</div>
                <p className="text-sm text-gray-300 leading-relaxed">{result.summary}</p>
              </div>
            </div>
          </div>

          {/* Clauses */}
          {result.clauses.length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span>📝</span> 条項分析
                <span className="text-xs text-gray-500 font-normal">（{result.clauses.length}条項）</span>
              </h2>
              <div className="space-y-3">
                {result.clauses
                  .sort((a, b) => {
                    const order = { HIGH: 0, MEDIUM: 1, LOW: 2, SAFE: 3 };
                    return order[a.risk_level] - order[b.risk_level];
                  })
                  .map((clause, i) => (
                    <ClauseCard key={i} clause={clause} />
                  ))}
              </div>
            </div>
          )}

          {/* Missing clauses */}
          {result.missing_clauses.length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span>⚠️</span> 欠落している条項
              </h2>
              <div className="space-y-3">
                {result.missing_clauses.map((mc, i) => (
                  <div key={i} className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30">
                    <div className="flex items-center gap-2 mb-2">
                      <RiskBadge level={mc.risk_level} />
                      <span className="text-sm font-medium">{mc.title}</span>
                    </div>
                    <p className="text-sm text-gray-300 mb-2">{mc.reason}</p>
                    <div className="text-xs text-green-400">
                      <span className="font-bold">追加推奨: </span>{mc.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {result.warnings && result.warnings.length > 0 && (
            <div className="p-4 rounded-xl bg-gray-800 border border-gray-700">
              <div className="text-xs text-gray-400 font-mono mb-2">その他の注意事項</div>
              {result.warnings.map((w, i) => (
                <p key={i} className="text-sm text-gray-400">{w}</p>
              ))}
            </div>
          )}

          {/* Disclaimer */}
          <div className="p-4 rounded-xl bg-gray-900 border border-gray-800 text-center">
            <p className="text-xs text-gray-500">
              ⚖️ このツールはAIによるリスク検出であり、法的助言ではありません。
              重要な契約は必ず弁護士にご相談ください。
            </p>
          </div>

          {/* Reset */}
          <button
            onClick={() => { setPreview(null); setFileName(null); setResult(null); setError(null); }}
            className="w-full py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition-colors"
          >
            別の契約書をチェック
          </button>
        </div>
      )}
    </div>
  );
}
