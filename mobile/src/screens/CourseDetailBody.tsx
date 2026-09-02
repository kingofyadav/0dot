import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getCourse, markLessonComplete, submitQuizAttempt, getLessonFileUrl, ApiError } from "../api/client";
import { API_BASE_URL } from "../config";
import { Button } from "../components/Button";
import { Chip } from "../components/Chip";
import { EmptyState } from "../components/EmptyState";
import { haptics } from "../utils/haptics";
import { useContentMaxWidth } from "../utils/responsive";
import { useTheme, type Theme } from "../theme";
import type { CourseDetail, CourseLesson, CourseQuiz } from "../api/types";

// Bearer-token-backed counterpart to
// src/app/[username]/courses/[courseId]/page.tsx. Every lesson's real
// content only ever arrives from the server once hasAccess is true — this
// screen never decides access itself, it just renders what the route
// already gated (see that route's own comment). v1 scope: reading,
// progress, and quizzes — purchasing a course stays web-only for now (no
// CourseBuyButton bearer-API equivalent yet).
export function CourseDetailBody({ username, courseId }: { username: string; courseId: string }) {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCourse(await getCourse(username, courseId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this course.");
    }
  }, [username, courseId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  async function onMarkComplete(lessonId: string) {
    haptics.light();
    try {
      await markLessonComplete(username, courseId, lessonId);
      await load();
    } catch {
      haptics.warning();
    }
  }

  async function onOpenFile(lessonId: string) {
    try {
      const { url } = await getLessonFileUrl(username, courseId, lessonId);
      await Linking.openURL(`${API_BASE_URL}${url}`);
    } catch {
      haptics.warning();
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }
  if (!course) {
    return (
      <View style={styles.center}>
        <EmptyState icon="school-outline" message={error ?? "Course not found."} onRetry={error ? load : undefined} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
    >
      <Text style={styles.title}>{course.title}</Text>
      {course.description ? <Text style={styles.description}>{course.description}</Text> : null}

      <Text style={styles.priceLine}>
        {course.price !== null && course.currency !== null ? `${course.price.toFixed(2)} ${course.currency.toUpperCase()}` : ""}
        {course.price !== null && course.requiredTier ? " or " : ""}
        {course.requiredTier ? `included with ${course.requiredTier.name} membership` : ""}
      </Text>

      <View style={styles.accessRow}>
        <Ionicons
          name={course.hasAccess ? "checkmark-circle-outline" : "lock-closed-outline"}
          size={16}
          color={course.hasAccess ? theme.colors.success : theme.colors.mutedForeground}
        />
        <Text style={styles.accessText}>
          {course.hasAccess ? "You have access to this course." : "Purchase or subscribe on the web to unlock this course."}
        </Text>
      </View>

      {course.modules.map((courseModule) => (
        <View key={courseModule.id} style={styles.moduleSection}>
          <Text style={styles.moduleTitle}>{courseModule.title}</Text>
          {courseModule.lessons.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              hasAccess={course.hasAccess}
              theme={theme}
              onMarkComplete={() => onMarkComplete(lesson.id)}
              onOpenFile={() => onOpenFile(lesson.id)}
              onQuizSubmit={async (quizId, answers) => {
                const result = await submitQuizAttempt(username, courseId, quizId, answers);
                await load();
                return result;
              }}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function LessonCard({
  lesson,
  hasAccess,
  theme,
  onMarkComplete,
  onOpenFile,
  onQuizSubmit,
}: {
  lesson: CourseLesson;
  hasAccess: boolean;
  theme: Theme;
  onMarkComplete: () => void;
  onOpenFile: () => void;
  onQuizSubmit: (quizId: string, answers: number[]) => Promise<{ score: number; passed: boolean }>;
}) {
  const styles = createStyles(theme);
  return (
    <View style={styles.lessonCard}>
      <View style={styles.lessonHeaderRow}>
        {!hasAccess ? <Ionicons name="lock-closed-outline" size={13} color={theme.colors.mutedForeground} /> : null}
        <Text style={styles.lessonTitle}>{lesson.title}</Text>
        {lesson.isCompleted ? (
          <View style={styles.completedBadge}>
            <Ionicons name="checkmark" size={12} color={theme.colors.success} />
            <Text style={styles.completedText}>Completed</Text>
          </View>
        ) : null}
      </View>

      {hasAccess ? (
        <>
          {lesson.contentType === "text" && lesson.body ? <Text style={styles.lessonBody}>{lesson.body}</Text> : null}
          {lesson.hasFile ? (
            <Button
              label={lesson.contentType === "video" ? "Play video" : "Download"}
              variant="secondary"
              onPress={onOpenFile}
              style={styles.fileButton}
            />
          ) : null}
          {!lesson.isCompleted ? (
            <Button label="Mark complete" variant="secondary" onPress={onMarkComplete} style={styles.completeButton} />
          ) : null}
          {lesson.quizzes.map((quiz) => (
            <QuizCard key={quiz.id} quiz={quiz} theme={theme} onSubmit={(answers) => onQuizSubmit(quiz.id, answers)} />
          ))}
        </>
      ) : null}
    </View>
  );
}

function QuizCard({
  quiz,
  theme,
  onSubmit,
}: {
  quiz: CourseQuiz;
  theme: Theme;
  onSubmit: (answers: number[]) => Promise<{ score: number; passed: boolean }>;
}) {
  const styles = createStyles(theme);
  const [answers, setAnswers] = useState<(number | null)[]>(() => quiz.questions.map(() => null));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);

  if (quiz.passed) {
    return (
      <View style={styles.quizPassedRow}>
        <Ionicons name="checkmark-circle-outline" size={14} color={theme.colors.success} />
        <Text style={styles.quizPassedText}>Quiz passed</Text>
      </View>
    );
  }

  const allAnswered = answers.every((a) => a !== null);

  async function handleSubmit() {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    try {
      const outcome = await onSubmit(answers as number[]);
      setResult(outcome);
      haptics.light();
    } catch {
      haptics.warning();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.quizCard}>
      {quiz.questions.map((question, qIndex) => (
        <View key={qIndex} style={styles.quizQuestion}>
          <Text style={styles.quizQuestionText}>{question.question}</Text>
          <View style={styles.quizOptionsRow}>
            {question.options.map((option, oIndex) => (
              <Chip
                key={oIndex}
                label={option}
                selected={answers[qIndex] === oIndex}
                onPress={() => setAnswers((prev) => prev.map((a, i) => (i === qIndex ? oIndex : a)))}
              />
            ))}
          </View>
        </View>
      ))}
      {result ? (
        <Text style={[styles.quizResultText, { color: result.passed ? theme.colors.success : theme.colors.danger }]}>
          {result.passed ? `Passed (${result.score}%)` : `Not quite (${result.score}%) — try again`}
        </Text>
      ) : null}
      <Button label="Submit quiz" onPress={handleSubmit} loading={submitting} disabled={!allAnswered} style={styles.quizSubmitButton} />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.space[5], gap: theme.space[2] },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space[6] },
    title: { color: theme.colors.foreground, fontSize: theme.text.xl, fontWeight: theme.weight.heading },
    description: { color: theme.colors.mutedForeground, fontSize: theme.text.base, marginTop: 2 },
    priceLine: { color: theme.colors.mutedForeground, fontSize: theme.text.sm, marginTop: theme.space[1] },
    accessRow: { flexDirection: "row", alignItems: "center", gap: theme.space[1], marginTop: theme.space[1] },
    accessText: { color: theme.colors.mutedForeground, fontSize: theme.text.sm, flexShrink: 1 },
    moduleSection: { marginTop: theme.space[4], gap: theme.space[2] },
    moduleTitle: {
      color: theme.colors.mutedForeground,
      fontSize: theme.text.xs,
      fontWeight: theme.weight.label,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    lessonCard: {
      gap: theme.space[2],
      padding: theme.space[3],
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    lessonHeaderRow: { flexDirection: "row", alignItems: "center", gap: theme.space[1], flexWrap: "wrap" },
    lessonTitle: { color: theme.colors.foreground, fontSize: theme.text.base, fontWeight: theme.weight.emphasis, flexShrink: 1 },
    completedBadge: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: "auto" },
    completedText: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
    lessonBody: { color: theme.colors.foreground, fontSize: theme.text.sm, lineHeight: theme.text.sm * 1.4 },
    fileButton: { alignSelf: "flex-start" },
    completeButton: { alignSelf: "flex-start" },
    quizPassedRow: { flexDirection: "row", alignItems: "center", gap: theme.space[1] },
    quizPassedText: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    quizCard: { gap: theme.space[2], marginTop: theme.space[1] },
    quizQuestion: { gap: theme.space[1] },
    quizQuestionText: { color: theme.colors.foreground, fontSize: theme.text.sm, fontWeight: theme.weight.label },
    quizOptionsRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.space[2] },
    quizResultText: { fontSize: theme.text.sm, fontWeight: theme.weight.emphasis },
    quizSubmitButton: { alignSelf: "flex-start" },
  });
}
