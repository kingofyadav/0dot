import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getResume, ApiError } from "../api/client";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { useContentMaxWidth } from "../utils/responsive";
import { useTheme, type Theme } from "../theme";
import type { ResumeResponse, WorkExperienceItem, EducationItem } from "../api/types";

function formatDate(iso: string | null): string {
  if (!iso) return "Present";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

// Bearer-token-backed mobile counterpart to
// src/app/[username]/resume/page.tsx — same sections, same "just a
// rendering of profile data" posture, no separate resume-only editing here
// either (this is a viewer screen).
export function ResumeBody({ username }: { username: string }) {
  const theme = useTheme();
  const maxWidth = useContentMaxWidth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [resume, setResume] = useState<ResumeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setResume(await getResume(username));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this résumé.");
    }
  }, [username]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }
  if (!resume) {
    return (
      <View style={styles.center}>
        <EmptyState icon="document-text-outline" message={error ?? "Résumé not found."} onRetry={error ? load : undefined} />
      </View>
    );
  }

  const hasAnything =
    resume.workExperiences.length > 0 || resume.education.length > 0 || resume.skills.length > 0 || resume.featuredProjects.length > 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null]}
    >
      {resume.resumePdfUrl ? (
        <Button label="Download PDF" variant="secondary" onPress={() => Linking.openURL(resume.resumePdfUrl!)} style={styles.pdfButton} />
      ) : null}

      {!hasAnything ? <EmptyState icon="document-text-outline" message="Nothing on this résumé yet." /> : null}

      {resume.workExperiences.length > 0 ? (
        <Section title="Work experience">
          {resume.workExperiences.map((item) => (
            <WorkExperienceRow key={item.id} item={item} theme={theme} />
          ))}
        </Section>
      ) : null}

      {resume.education.length > 0 ? (
        <Section title="Education">
          {resume.education.map((item) => (
            <EducationRow key={item.id} item={item} theme={theme} />
          ))}
        </Section>
      ) : null}

      {resume.skills.length > 0 ? (
        <Section title="Skills">
          <View style={styles.skillRow}>
            {resume.skills.map((skill) => (
              <View key={skill.id} style={styles.skillChip}>
                <Text style={styles.skillText}>{skill.name}</Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {resume.featuredProjects.length > 0 ? (
        <Section title="Projects">
          {resume.featuredProjects.map((project) => (
            <View key={project.id} style={styles.projectRow}>
              <Text style={styles.projectTitle}>{project.title}</Text>
              {project.summary ? <Text style={styles.projectSummary}>{project.summary}</Text> : null}
            </View>
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function WorkExperienceRow({ item, theme }: { item: WorkExperienceItem; theme: Theme }) {
  const styles = createStyles(theme);
  return (
    <View style={styles.entry}>
      <Text style={styles.entryTitle}>
        {item.title} — {item.company}
        {item.location ? <Text style={styles.entryMuted}> · {item.location}</Text> : null}
      </Text>
      <Text style={styles.entryDates}>
        {formatDate(item.startDate)} – {formatDate(item.endDate)}
      </Text>
      {item.description ? <Text style={styles.entryDescription}>{item.description}</Text> : null}
    </View>
  );
}

function EducationRow({ item, theme }: { item: EducationItem; theme: Theme }) {
  const styles = createStyles(theme);
  return (
    <View style={styles.entry}>
      <Text style={styles.entryTitle}>
        {item.institution}
        {item.degree ? ` — ${item.degree}` : ""}
        {item.fieldOfStudy ? <Text style={styles.entryMuted}> · {item.fieldOfStudy}</Text> : null}
      </Text>
      <Text style={styles.entryDates}>
        {formatDate(item.startDate)} – {formatDate(item.endDate)}
      </Text>
      {item.description ? <Text style={styles.entryDescription}>{item.description}</Text> : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.space[5], gap: theme.space[2] },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space[6] },
    pdfButton: { alignSelf: "flex-start", marginBottom: theme.space[2] },
    section: { marginTop: theme.space[3] },
    sectionHeading: {
      color: theme.colors.mutedForeground,
      fontSize: theme.text.xs,
      fontWeight: theme.weight.label,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      marginBottom: theme.space[2],
    },
    sectionBody: { gap: theme.space[3] },
    entry: { gap: 2 },
    entryTitle: { color: theme.colors.foreground, fontSize: theme.text.base, fontWeight: theme.weight.emphasis },
    entryMuted: { color: theme.colors.mutedForeground, fontWeight: theme.weight.regular },
    entryDates: { color: theme.colors.mutedForeground, fontSize: theme.text.xs },
    entryDescription: { color: theme.colors.foreground, fontSize: theme.text.sm, marginTop: 2 },
    skillRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.space[2] },
    skillChip: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 999,
      paddingHorizontal: theme.space[3],
      paddingVertical: theme.space[1],
    },
    skillText: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
    projectRow: { gap: 2 },
    projectTitle: { color: theme.colors.accent, fontSize: theme.text.base, fontWeight: theme.weight.emphasis },
    projectSummary: { color: theme.colors.mutedForeground, fontSize: theme.text.sm },
  });
}
