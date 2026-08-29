"use client";

import { useActionState, useState } from "react";
import { createQuiz } from "@/app/actions/quizzes";

type DraftQuestion = { question: string; optionsText: string; correctIndex: number };

export function QuizForm({ lessonId }: { lessonId: string }) {
  const [state, formAction, pending] = useActionState(createQuiz, undefined);
  const [questions, setQuestions] = useState<DraftQuestion[]>([{ question: "", optionsText: "", correctIndex: 0 }]);

  function update(index: number, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  const questionsJson = JSON.stringify(
    questions
      .filter((q) => q.question.trim().length > 0)
      .map((q) => ({
        question: q.question,
        options: q.optionsText.split(",").map((o) => o.trim()).filter(Boolean),
        correctIndex: q.correctIndex,
      }))
  );

  return (
    <form action={formAction} className="settingsForm">
      <input type="hidden" name="lessonId" value={lessonId} />
      {questions.map((q, index) => (
        <div key={index} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <input placeholder="Question" value={q.question} onChange={(e) => update(index, { question: e.target.value })} className="textInput" style={{ flex: "2 1 160px" }} />
          <input placeholder="Options, comma-separated" value={q.optionsText} onChange={(e) => update(index, { optionsText: e.target.value })} className="textInput" style={{ flex: "2 1 160px" }} />
          <input
            type="number"
            min={0}
            placeholder="Correct option #"
            value={q.correctIndex}
            onChange={(e) => update(index, { correctIndex: Number(e.target.value) })}
            className="textInput"
            style={{ flex: "0 1 80px" }}
          />
        </div>
      ))}
      <button type="button" className="button buttonSecondary buttonSmall" style={{ alignSelf: "flex-start" }} onClick={() => setQuestions((prev) => [...prev, { question: "", optionsText: "", correctIndex: 0 }])}>
        + Add question
      </button>
      <input type="hidden" name="questionsJson" value={questionsJson} />
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
        <label htmlFor={`passingScore-${lessonId}`} className="mutedText" style={{ fontSize: "0.85rem" }}>Passing score (%)</label>
        <input id={`passingScore-${lessonId}`} name="passingScore" type="number" min={0} max={100} defaultValue={70} className="textInput" style={{ width: "80px" }} />
      </div>
      <button type="submit" className="button buttonSmall" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Saving…" : "Add quiz"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}
