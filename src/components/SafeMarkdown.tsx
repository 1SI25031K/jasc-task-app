import React from "react";
import { MaterialIcon } from "./MaterialIcon";

interface SafeMarkdownProps {
  content: string;
  validTaskIds?: Set<string>;
  onTaskClick?: (taskId: string) => void;
  className?: string;
}

/**
 * 外部ライブラリ不使用・XSS 脆弱性ゼロ（S6）の安全な Markdown パーサーコンポーネント。
 * dangerouslySetInnerHTML は一切使用せず、純粋な React 仮想 DOM ノードとしてレンダリングする。
 *
 * 対応構文:
 * - 見出し: # / ## / ###
 * - 箇条書きリスト: - / *
 * - 太字: **text**
 * - インラインコード: `code`
 * - タスク参照: [TASK:T-001] -> M3 Assist Chip（クリック可能、存在しないIDは無効化）
 */
export function SafeMarkdown({
  content,
  validTaskIds,
  onTaskClick,
  className = "",
}: SafeMarkdownProps) {
  if (!content) return null;

  // インライン要素（太字、コード、[TASK:ID]）のパース
  const renderInline = (text: string): React.ReactNode[] => {
    // パターン:
    // 1. **bold**
    // 2. `code`
    // 3. [TASK:id]
    const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[TASK:[A-Za-z0-9_-]+\])/g;
    const parts = text.split(regex);

    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={idx} className="font-semibold text-on-surface">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={idx}
            className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[11px] text-primary"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("[TASK:") && part.endsWith("]")) {
        const taskId = part.slice(6, -1);
        const isValid = !validTaskIds || validTaskIds.has(taskId);

        if (isValid && onTaskClick) {
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onTaskClick(taskId)}
              className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-[8px] bg-primary-container text-on-primary-container text-xs font-medium hover:bg-primary/20 transition cursor-pointer"
              title={`タスク ${taskId} の詳細を開く`}
            >
              <MaterialIcon name="task_alt" size={14} className="text-primary" />
              <span>{taskId}</span>
            </button>
          );
        }

        return (
          <span
            key={idx}
            className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-xs"
          >
            {taskId}
          </span>
        );
      }

      return part;
    });
  };

  // 行単位のブロックパース
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let currentListItems: React.ReactNode[] = [];

  const flushList = () => {
    if (currentListItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-2 space-y-1 pl-4 list-disc text-xs sm:text-sm text-on-surface leading-relaxed">
          {currentListItems}
        </ul>
      );
      currentListItems = [];
    }
  };

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    // 見出し
    if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(
        <h4 key={lineIdx} className="mt-3 mb-1.5 text-xs sm:text-sm font-semibold text-on-surface">
          {renderInline(trimmed.slice(4))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(
        <h3 key={lineIdx} className="mt-4 mb-2 text-sm sm:text-base font-medium text-on-surface">
          {renderInline(trimmed.slice(3))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(
        <h2 key={lineIdx} className="mt-4 mb-2 text-base sm:text-lg font-medium text-on-surface">
          {renderInline(trimmed.slice(2))}
        </h2>
      );
      return;
    }

    // リスト項目
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      currentListItems.push(
        <li key={lineIdx} className="text-xs sm:text-sm text-on-surface leading-relaxed">
          {renderInline(trimmed.slice(2))}
        </li>
      );
      return;
    }

    // 通常の段落
    flushList();
    elements.push(
      <p key={lineIdx} className="my-1.5 text-xs sm:text-sm text-on-surface leading-relaxed">
        {renderInline(trimmed)}
      </p>
    );
  });

  flushList();

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
}
