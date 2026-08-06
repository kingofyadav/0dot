"use client";

import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";
import { submitQuizAttempt, type QuizQuestion, type QuizSubmitState } from "@/app/actions/quizzes";

export function QuizWidget({ quizId, questions, passingScore }: { quizId: string; questions: QuizQuestion[]; passingScore: number }) {
  const [state, formAction, pending] = useActionState<QuizSubmitState, FormData>(submitQuizAttempt, undefined);
  const [answers, setAnswers] = useState<number[]>(new Array(questions.length).fill(-1));

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
      <input type="hidden" name="quizId" value={quizId} />
      <input type="hidden" name="answersJson" value={JSON.stringify(answers)} />
      <p className="mutedText" style={{ fontSize: "0.85rem" }}>Quiz — passing score {passingScore}%</p>
      {questions.map((q, qIndex) => (
        <div key={qIndex}>
          <p style={{ margin: 0 }}>{q.question}</p>
          {q.options.map((option, oIndex) => (
            <label key={oIndex} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.9rem" }}>
              <input
                type="radio"
                name={`q-${qIndex}`}
                checked={answers[qIndex] === oIndex}
                onChange={() => setAnswers((prev) => prev.map((a, i) => (i === qIndex ? oIndex : a)))}
              />
              {option}
            </label>
          ))}
        </div>
      ))}
      <button type="submit" className="button buttonSmall" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Submitting…" : "Submit quiz"}
      </button>
      {state && "error" in state && <p className="errorText">{state.error}</p>}
      {state && "score" in state && (
        <p style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          {state.passed ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />} {state.passed ? "Passed" : "Not passed"} — scored {state.score}%
        </p>
      )}
    </form>
  );
}
