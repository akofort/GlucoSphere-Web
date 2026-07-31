import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { HTMLAttributes, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useLanguage } from "../lib/LanguageContext";

/** Flattens a hast node back to its plain text -- react-markdown hands the component the parsed
 * node, so this works regardless of how the question was formatted (bold, links, inline code). */
function nodeText(node: unknown): string {
  const n = node as { type?: string; value?: string; children?: unknown[] } | undefined;
  if (!n) return "";
  if (n.type === "text") return n.value ?? "";
  return (n.children ?? []).map(nodeText).join("");
}

const MIN_QUESTION_LENGTH = 10;
const MAX_QUESTION_LENGTH = 200;

/** Pulls a single, self-contained question out of a paragraph or list item -- the point is answers
 * like "Was kann ich dich sinnvollerweise fragen?", which come back as a list of suggested
 * questions the user should be able to just tap.
 *
 * Deliberately conservative: only the FIRST "…?" segment, only if the line contains exactly one
 * question mark (a paragraph arguing back and forth isn't a suggestion), and only within a
 * sensible length. Anything else renders as ordinary text, so a normal answer never turns into a
 * minefield of clickable paragraphs. */
export function extractQuestion(text: string): string | null {
  const trimmed = text.trim();
  if ((trimmed.match(/\?/g) ?? []).length !== 1) return null;
  const match = trimmed.match(/([^.!?\n]*\?)/);
  if (!match) return null;
  const question = match[1]
    // List/quote decoration the markdown itself doesn't carry (e.g. `- "Wie ist mein Wert?"`).
    .replace(/^[\s\-–—•*>]+/, "")
    // A leading label like "Beispiel: " -- letters only, so a time ("Um 8:00 Uhr, wie …?") is safe.
    .replace(/^[A-Za-zÄÖÜäöüß ]{1,20}:\s+/, "")
    .replace(/^["„“'‚‘]+/, "")
    .replace(/["“”'‘’]+$/, "")
    .trim();
  if (question.length < MIN_QUESTION_LENGTH || question.length > MAX_QUESTION_LENGTH) return null;
  if (!question.includes(" ")) return null;
  return question;
}

type BlockProps = HTMLAttributes<HTMLElement> & { node?: unknown; children?: ReactNode };

interface Props {
  content: string;
  /** Omitted (or null) renders plain markdown -- e.g. while another answer is still generating,
   * where clicking a suggestion would be dropped anyway. */
  onAskQuestion?: ((question: string) => void) | null;
}

export default function MarkdownAnswer({ content, onAskQuestion }: Props) {
  const { t } = useLanguage();

  const askProps = (question: string) => ({
    className: "clickable-question",
    role: "button",
    tabIndex: 0,
    title: t.chatAskThisQuestion,
    onClick: (e: MouseEvent) => {
      // A link inside the suggestion stays a link -- don't hijack its click.
      if ((e.target as HTMLElement).closest("a")) return;
      onAskQuestion?.(question);
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onAskQuestion?.(question);
      }
    },
  });

  const Hint = () => (
    <span className="clickable-question-hint" aria-hidden="true">
      ➜
    </span>
  );

  const Paragraph = ({ node, children, ...props }: BlockProps) => {
    const question = onAskQuestion ? extractQuestion(nodeText(node)) : null;
    if (!question) return <p {...props}>{children}</p>;
    return (
      <p {...props} {...askProps(question)}>
        {children}
        <Hint />
      </p>
    );
  };

  const ListItem = ({ node, children, ...props }: BlockProps) => {
    const question = onAskQuestion ? extractQuestion(nodeText(node)) : null;
    if (!question) return <li {...props}>{children}</li>;
    return (
      <li {...props} {...askProps(question)}>
        {children}
        <Hint />
      </li>
    );
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: Paragraph, li: ListItem }}>
      {content}
    </ReactMarkdown>
  );
}
